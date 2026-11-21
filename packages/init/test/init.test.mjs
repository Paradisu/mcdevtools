// @ts-check
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { init } from '../lib/init.mjs';
import { patchBlock } from '../lib/markers.mjs';
import { migrateConfigText } from '../lib/migrations.mjs';
import { update } from '../lib/update.mjs';
import { run } from '../lib/util.mjs';
import { addWorkspacePackages } from '../lib/yaml.mjs';

const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
Object.assign(process.env, env);

/** @param {string} cwd @param {...string} args */
function git(cwd, ...args) {
  const result = run('git', args, { cwd });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A stand-in for the mcdevtools repository: just what init and update look at. */
function makeToolRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mcdev-tool-'));
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'packages', 'init'), { recursive: true });
  mkdirSync(join(dir, 'devcontainer', 'template'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mcdevtools', packageManager: 'pnpm@12.11.2' }));
  writeFileSync(join(dir, 'packages', 'init', 'package.json'), '{}');
  writeFileSync(join(dir, 'devcontainer', 'template', 'devcontainer.json'), '{}');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'mcdev-project-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'settings.gradle.kts'), 'rootProject.name = "demo"\n');
  writeFileSync(join(dir, '.gitignore'), 'build/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

test('init wires a project and a second run changes nothing', () => {
  const tool = makeToolRepo();
  const project = makeProject();
  const options = { cwd: project, url: tool, install: false, extension: 'demo', devcontainer: true };
  const first = init(options);
  assert.ok(first.some((r) => r.status === 'changed' && r.what === 'submodule dev'));

  assert.ok(existsSync(join(project, 'dev', 'packages', 'init', 'package.json')), 'the submodule is checked out');
  assert.match(readFileSync(join(project, '.gitmodules'), 'utf8'), /path = dev/);
  assert.match(readFileSync(join(project, '.gitmodules'), 'utf8'), /branch = main/);
  assert.match(readFileSync(join(project, 'pnpm-workspace.yaml'), 'utf8'), /- dev\/packages\/\*\n\s+- \.mcdevtools\/extensions\/\*/);
  assert.equal(JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')).packageManager, 'pnpm@12.11.2');
  assert.match(readFileSync(join(project, 'settings.gradle.kts'), 'utf8'), /\/\/ mcdevtools:begin\nincludeBuild\("dev\/java"\) \{ name = "mcdevtools" \}\n\/\/ mcdevtools:end/);
  assert.match(readFileSync(join(project, '.gitignore'), 'utf8'), /build\/\n\n# mcdevtools:begin\n\.mcdevtools\/run\//);
  const config = readFileSync(join(project, '.mcdevtools', 'config.toml'), 'utf8');
  assert.match(config, /extensions = \["extensions\/demo"\]/);
  assert.match(config, /command = \["\.\/gradlew", "-q", "build"\]/);
  const extension = readFileSync(join(project, '.mcdevtools', 'extensions', 'demo', 'src', 'index.ts'), 'utf8');
  assert.match(extension, /name: 'demo'/);
  assert.doesNotMatch(extension, /\{\{/);
  assert.ok(existsSync(join(project, '.devcontainer', 'devcontainer.json')));

  const second = init(options);
  assert.deepEqual(second.filter((r) => r.status === 'changed' || r.status === 'manual'), []);
});

test('update moves the submodule, stages it and re-runs the wiring', () => {
  const tool = makeToolRepo();
  const project = makeProject();
  init({ cwd: project, url: tool, install: false });
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'add mcdevtools');

  writeFileSync(join(tool, 'NEWS.md'), 'new\n');
  git(tool, 'add', '-A');
  git(tool, 'commit', '-q', '-m', 'second');
  const newest = git(tool, 'rev-parse', 'HEAD');

  const results = update({ cwd: project, install: false });
  assert.ok(results.some((r) => r.status === 'changed' && r.what === 'submodule dev'));
  assert.equal(git(join(project, 'dev'), 'rev-parse', 'HEAD'), newest);
  assert.match(git(project, 'status', '--porcelain'), /^M\s+dev$/m, 'the new submodule commit is staged');
  assert.equal(update({ cwd: project, install: false }).find((r) => r.what === 'submodule dev')?.status, 'ok');
});

test('patchBlock replaces only what is between the markers', () => {
  const once = patchBlock('a\n', '#', ['x']);
  assert.equal(once, 'a\n\n# mcdevtools:begin\nx\n# mcdevtools:end\n');
  assert.equal(patchBlock(once, '#', ['y']), 'a\n\n# mcdevtools:begin\ny\n# mcdevtools:end\n');
});

test('addWorkspacePackages edits block lists and reports anything else as manual', () => {
  assert.deepEqual(addWorkspacePackages('', ['a']).text, 'packages:\n  - a\n');
  const merged = addWorkspacePackages('packages:\n  - a\nallowBuilds:\n  x: true\n', ['a', 'b']);
  assert.equal(merged.text, 'packages:\n  - a\n  - b\nallowBuilds:\n  x: true\n');
  assert.deepEqual(merged.added, ['b']);
  assert.equal(addWorkspacePackages('packages: [a]\n', ['b']).manual, true);
});

test('config migrations run in order and rewrite the format', () => {
  const migrations = [
    { from: 1, note: 'rename a', apply: (/** @type {string} */ t) => t.replace('a =', 'b =') },
    { from: 2, note: 'rename b', apply: (/** @type {string} */ t) => t.replace('b =', 'c =') },
  ];
  const result = migrateConfigText('format = 1\na = 1\n', { migrations });
  assert.equal(result.text, 'format = 3\nc = 1\n');
  assert.deepEqual(result.applied, ['rename a', 'rename b']);
  assert.deepEqual(migrateConfigText('format = 3\n', { migrations }).applied, []);
});

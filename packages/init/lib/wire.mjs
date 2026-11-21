// @ts-check
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { patchBlock } from './markers.mjs';
import { run, step } from './util.mjs';
import { addWorkspacePackages } from './yaml.mjs';

/**
 * Connects an mcdevtools checkout at `path` to the project: pnpm workspace, root package.json, `pnpm install` and
 * the Gradle included build. Idempotent; every part reports whether it changed anything.
 * @param {{ root: string, path: string, gradle: boolean, pnpm: boolean, install: boolean }} options
 */
export function wireProject({ root, path, gradle, pnpm, install }) {
  const results = [];
  if (pnpm) {
    results.push(...wirePnpm(root, path, install));
  }
  if (gradle) {
    results.push(wireGradle(root, path));
  }
  return results;
}

/**
 * @param {string} root
 * @param {string} path
 * @param {boolean} install
 */
function wirePnpm(root, path, install) {
  const results = [];
  const workspace = join(root, 'pnpm-workspace.yaml');
  const before = existsSync(workspace) ? readFileSync(workspace, 'utf8') : '';
  const edit = addWorkspacePackages(before, [`${path}/packages/*`, '.mcdevtools/extensions/*']);
  if (edit.manual) {
    results.push(step('manual', 'pnpm-workspace.yaml', `add "${path}/packages/*" and ".mcdevtools/extensions/*" to its packages list`));
  } else if (edit.added.length > 0) {
    writeFileSync(workspace, edit.text);
    results.push(step('changed', 'pnpm-workspace.yaml', `added ${edit.added.join(', ')}`));
  } else {
    results.push(step('ok', 'pnpm-workspace.yaml'));
  }

  const manifest = join(root, 'package.json');
  if (existsSync(manifest)) {
    results.push(step('ok', 'package.json'));
  } else {
    const tool = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
    const name = root.split(/[\\/]/).pop() ?? 'project';
    const json = { name: `${name}-workspace`, private: true, ...(tool.packageManager ? { packageManager: tool.packageManager } : {}) };
    writeFileSync(manifest, `${JSON.stringify(json, null, 2)}\n`);
    results.push(step('changed', 'package.json', 'created a private workspace root'));
  }

  if (!install) {
    results.push(step('skipped', 'pnpm install'));
  } else {
    const direct = run('pnpm', ['--version']);
    const command = direct.status === 0 ? ['pnpm'] : ['corepack', 'pnpm'];
    const installed = run(command[0] ?? 'pnpm', [...command.slice(1), 'install'], { cwd: root });
    results.push(
      installed.status === 0
        ? step('ok', 'pnpm install')
        : step('manual', 'pnpm install', `failed; run it yourself: ${(installed.stderr || installed.stdout).trim().split('\n').pop()}`),
    );
  }
  return results;
}

/**
 * @param {string} root
 * @param {string} path
 */
function wireGradle(root, path) {
  const kts = join(root, 'settings.gradle.kts');
  const groovy = join(root, 'settings.gradle');
  const file = existsSync(kts) ? kts : existsSync(groovy) ? groovy : undefined;
  if (!file) {
    return step('skipped', 'Gradle included build', 'no settings.gradle(.kts) here');
  }
  const text = readFileSync(file, 'utf8');
  const line = file === kts ? `includeBuild("${path}/java") { name = "mcdevtools" }` : `includeBuild('${path}/java') { name = 'mcdevtools' }`;
  const patched = patchBlock(text, '//', [line]);
  const name = file === kts ? 'settings.gradle.kts' : 'settings.gradle';
  if (patched === text) {
    return step('ok', name);
  }
  writeFileSync(file, patched);
  return step('changed', name, `includeBuild("${path}/java")`);
}

/**
 * Writes a file unless it exists.
 * @param {string} file
 * @param {string} content
 */
export function writeIfMissing(file, content) {
  if (existsSync(file)) {
    return false;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}

// @ts-check
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findToolPath, repoRoot, submoduleBranch } from './git.mjs';
import { migrateConfigText } from './migrations.mjs';
import { InitError, run, step } from './util.mjs';
import { wireProject } from './wire.mjs';

/**
 * Moves the mcdevtools submodule to `ref` (default: the newest commit of the branch .gitmodules follows), re-applies
 * the project wiring, migrates the config format and stages the new submodule commit. Never commits.
 * @param {{ cwd: string, ref?: string, install?: boolean }} options
 */
export function update(options) {
  const root = repoRoot(options.cwd);
  const path = findToolPath(root) ?? new InitError('No mcdevtools submodule found; run `npx github:Paradisu/mcdevtools init` first').throw();
  const tool = join(root, path);
  const git = (/** @type {string[]} */ args, /** @type {string} */ cwd = tool) => {
    const result = run('git', args, { cwd });
    if (result.status !== 0) {
      throw new InitError(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    }
    return result.stdout.trim();
  };

  const before = git(['rev-parse', 'HEAD']);
  if (git(['status', '--porcelain']) !== '') {
    throw new InitError(`${path}/ has uncommitted changes; commit or discard them before updating`);
  }
  git(['fetch', '--tags', 'origin']);
  if (options.ref) {
    git(['checkout', '--quiet', options.ref]);
  } else {
    const branch = submoduleBranch(root, path) ?? 'main';
    git(['checkout', '--quiet', branch]);
    git(['merge', '--ff-only', `origin/${branch}`]);
  }
  const after = git(['rev-parse', 'HEAD']);
  const results = [step(before === after ? 'ok' : 'changed', `submodule ${path}`, before === after ? 'already up to date' : `${before.slice(0, 7)} -> ${after.slice(0, 7)}`)];

  results.push(...wireProject({ root, path, gradle: true, pnpm: true, install: options.install !== false }));

  const config = join(root, '.mcdevtools', 'config.toml');
  if (existsSync(config)) {
    const text = readFileSync(config, 'utf8');
    const migrated = migrateConfigText(text);
    if (migrated.applied.length > 0) {
      writeFileSync(`${config}.bak`, text);
      writeFileSync(config, migrated.text);
      results.push(step('changed', 'config.toml', `${migrated.applied.join('; ')} (backup: config.toml.bak)`));
    } else {
      results.push(step('ok', 'config.toml', 'format is current'));
    }
  }

  if (before !== after) {
    console.log(`\n${git(['log', '--oneline', `${before}..${after}`])}`);
    git(['add', path], root);
    console.log(`\nThe new submodule commit is staged. Commit it: git commit -m "Update mcdevtools"`);
  }
  return results;
}

// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { InitError, run } from './util.mjs';

/**
 * The git work tree containing `cwd`.
 * @param {string} cwd
 */
export function repoRoot(cwd) {
  const result = run('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (result.status !== 0) {
    throw new InitError('This is not a git repository. Run `git init` first: mcdevtools is added as a git submodule.');
  }
  return result.stdout.trim();
}

/**
 * Whether `.gitmodules` already lists `path`.
 * @param {string} root
 * @param {string} path
 */
export function hasSubmodule(root, path) {
  const file = join(root, '.gitmodules');
  return existsSync(file) && readFileSync(file, 'utf8').includes(`path = ${path}`);
}

/**
 * `git submodule add` with the default branch recorded in .gitmodules, so `mcdev update` knows what to follow.
 * @param {string} root
 * @param {string} path
 * @param {string} url
 * @param {string | undefined} ref
 */
export function addSubmodule(root, path, url, ref) {
  const local = isAbsolute(url) || url.startsWith('.') || url.startsWith('file:');
  // Git refuses local-path submodules unless the file transport is allowed explicitly (tests and offline use)
  const config = local ? ['-c', 'protocol.file.allow=always'] : [];
  const args = [...config, 'submodule', 'add', ...(ref ? ['-b', ref] : []), url, path];
  const result = run('git', args, { cwd: root });
  if (result.status !== 0) {
    throw new InitError(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  if (!ref) {
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: join(root, path) }).stdout.trim();
    if (branch && branch !== 'HEAD') {
      run('git', ['config', '-f', '.gitmodules', `submodule.${path}.branch`, branch], { cwd: root });
    }
  }
}

/**
 * The branch a submodule follows, from .gitmodules.
 * @param {string} root
 * @param {string} path
 */
export function submoduleBranch(root, path) {
  const result = run('git', ['config', '-f', '.gitmodules', '--get', `submodule.${path}.branch`], { cwd: root });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * The path of the mcdevtools submodule: the one in .gitmodules that contains `packages/init`.
 * @param {string} root
 * @returns {string | undefined}
 */
export function findToolPath(root) {
  const result = run('git', ['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'], { cwd: root });
  if (result.status !== 0) {
    return undefined;
  }
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const path = line.slice(line.indexOf(' ') + 1).trim();
    if (existsSync(join(root, path, 'packages', 'init', 'package.json'))) {
      return path;
    }
  }
  return undefined;
}

// @ts-check
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { addSubmodule, hasSubmodule, repoRoot } from './git.mjs';
import { patchBlock } from './markers.mjs';
import { InitError, step } from './util.mjs';
import { wireProject, writeIfMissing } from './wire.mjs';

export const DEFAULT_URL = 'https://github.com/Paradisu/mcdevtools.git';
const SCAFFOLD = join(import.meta.dirname, '..', '..', 'cli', 'scaffold');

/**
 * @typedef {object} InitOptions
 * @property {string} cwd
 * @property {string} [path] where the submodule goes, relative to the repository (default `dev`)
 * @property {string} [ref] branch to follow
 * @property {string} [url]
 * @property {boolean} [gradle] add the Gradle included build (default true)
 * @property {boolean} [pnpm] wire the pnpm workspace (default true)
 * @property {boolean} [install] run `pnpm install` (default true)
 * @property {boolean} [devcontainer] copy the devcontainer template
 * @property {string} [extension] scaffold an extension with this name
 */

/**
 * Sets the repository containing `options.cwd` up for mcdevtools. Safe to run again: every step checks first.
 * @param {InitOptions} options
 */
export function init(options) {
  const root = repoRoot(options.cwd);
  const path = options.path ?? 'dev';
  const results = [];
  console.log(`Setting up mcdevtools in ${root}`);

  // 1. The submodule
  if (hasSubmodule(root, path)) {
    results.push(step('ok', `submodule ${path}`));
  } else {
    if (existsSync(join(root, path)) && readdirSync(join(root, path)).length > 0) {
      throw new InitError(`${path}/ exists and is not an mcdevtools submodule; choose another --path or move it away`);
    }
    addSubmodule(root, path, options.url ?? DEFAULT_URL, options.ref);
    results.push(step('changed', `submodule ${path}`, `from ${options.url ?? DEFAULT_URL}`));
  }

  // 2. .mcdevtools/
  const config = join(root, '.mcdevtools');
  const gradleProject = existsSync(join(root, 'settings.gradle.kts')) || existsSync(join(root, 'settings.gradle'));
  const wrote = writeIfMissing(join(config, 'config.toml'), renderConfig(gradleProject));
  results.push(step(wrote ? 'changed' : 'ok', '.mcdevtools/config.toml'));
  writeIfMissing(join(config, 'config.local.toml.example'), readFileSync(join(SCAFFOLD, 'config.local.toml.example'), 'utf8'));
  results.push(patchGitignore(root));

  // 3. pnpm workspace and Gradle
  results.push(...wireProject({ root, path, gradle: options.gradle !== false, pnpm: options.pnpm !== false, install: options.install !== false }));

  // 4. Optional parts
  if (options.extension) {
    results.push(...scaffoldExtension(root, options.extension));
  }
  if (options.devcontainer) {
    results.push(copyDevcontainer(root, path));
  }

  console.log('\nNext: `mcdev setup` downloads the servers, `mcdev start` runs the network (see dev/docs/environment.md).');
  return results;
}

/** @param {boolean} gradleProject */
function renderConfig(gradleProject) {
  const build = gradleProject
    ? [
        '# The project\'s own build: `mcdev start` runs it first and copies the artifacts into matching instances',
        '[build]',
        'command = ["./gradlew", "-q", "build"]',
        '',
        '# [[build.artifacts]]',
        '# path = "build/libs/MyPlugin.jar"',
        '# platforms = ["paper", "velocity"]  # plugin families: paper, velocity, limbo',
      ]
    : ['# [build]', '# command = ["make"]', '', '# [[build.artifacts]]', '# path = "build/MyPlugin.jar"', '# platforms = ["paper"]'];
  return readFileSync(join(SCAFFOLD, 'config.toml'), 'utf8').replace('{{BUILD}}', build.join('\n'));
}

/** @param {string} root */
function patchGitignore(root) {
  const file = join(root, '.gitignore');
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const after = patchBlock(before, '#', readFileSync(join(SCAFFOLD, 'gitignore-block.txt'), 'utf8').trimEnd().split('\n'));
  if (after === before) {
    return step('ok', '.gitignore');
  }
  writeFileSync(file, after);
  return step('changed', '.gitignore');
}

/**
 * Creates `.mcdevtools/extensions/<name>` from the scaffold and lists it in `extensions`.
 * @param {string} root
 * @param {string} name
 */
function scaffoldExtension(root, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new InitError(`Extension name "${name}" must be lowercase letters, digits and dashes, starting with a letter`);
  }
  const results = [];
  const dir = join(root, '.mcdevtools', 'extensions', name);
  if (existsSync(dir)) {
    results.push(step('ok', `extension ${name}`));
  } else {
    const scope = basename(root).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    cpSync(join(SCAFFOLD, 'extension'), dir, { recursive: true });
    replaceTokens(dir, { '{{NAME}}': name, '{{PACKAGE_SCOPE}}': scope });
    results.push(step('changed', `extension ${name}`, `.mcdevtools/extensions/${name}`));
  }
  const configFile = join(root, '.mcdevtools', 'config.toml');
  const text = readFileSync(configFile, 'utf8');
  const entry = `extensions/${name}`;
  const match = /^extensions\s*=\s*\[([^\]]*)\]/m.exec(text);
  if (!match) {
    results.push(step('manual', 'config.toml', `add "${entry}" to extensions`));
  } else if (match[1]?.includes(`"${entry}"`)) {
    results.push(step('ok', 'config.toml extensions'));
  } else {
    const items = (match[1] ?? '').trim();
    const next = `extensions = [${items ? `${items}, ` : ''}"${entry}"]`;
    writeFileSync(configFile, text.replace(match[0], next));
    results.push(step('changed', 'config.toml extensions', `added ${entry}`));
  }
  return results;
}

/**
 * @param {string} dir
 * @param {Record<string, string>} tokens
 */
function replaceTokens(dir, tokens) {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) {
      replaceTokens(file, tokens);
      continue;
    }
    let text = readFileSync(file, 'utf8');
    for (const [token, value] of Object.entries(tokens)) text = text.split(token).join(value);
    writeFileSync(file, text);
  }
}

/**
 * @param {string} root
 * @param {string} path
 */
function copyDevcontainer(root, path) {
  const target = join(root, '.devcontainer');
  if (existsSync(target)) {
    return step('skipped', '.devcontainer', 'already exists');
  }
  const template = join(root, path, 'devcontainer', 'template');
  if (!existsSync(template)) {
    return step('manual', '.devcontainer', `${path}/devcontainer/template is missing`);
  }
  cpSync(template, target, { recursive: true });
  return step('changed', '.devcontainer', `copied from ${path}/devcontainer/template`);
}

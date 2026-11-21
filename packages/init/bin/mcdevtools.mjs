#!/usr/bin/env node
// @ts-check
import { parseArgs } from 'node:util';
import { DEFAULT_URL, init } from '../lib/init.mjs';
import { afterUpdate, update } from '../lib/update.mjs';
import { findToolPath, repoRoot } from '../lib/git.mjs';
import { InitError } from '../lib/util.mjs';

const HELP = `mcdevtools: set a project up for the mcdev dev tools

Usage:
  npx github:Paradisu/mcdevtools init [options]     add the submodule, .mcdevtools/, pnpm workspace and Gradle included build
  npx github:Paradisu/mcdevtools update [options]   move the submodule to a newer version and re-apply the wiring

init options:
  --path <dir>          where the submodule goes (default: dev)
  --ref <branch>        branch to follow (default: the repository's default branch)
  --url <git url>       repository to add (default: ${DEFAULT_URL})
  --extension <name>    also create .mcdevtools/extensions/<name>
  --devcontainer        also copy the devcontainer template to .devcontainer
  --no-gradle           skip the Gradle included build
  --no-pnpm             skip the pnpm workspace and install
  --no-install          wire the workspace but do not run pnpm install

update options:
  --ref <branch|tag|sha>  version to move to (default: latest of the followed branch)
  --no-install            do not run pnpm install afterwards
`;

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
  } else if (command === 'init') {
    const { values } = parseArgs({
      args: rest,
      options: {
        path: { type: 'string' },
        ref: { type: 'string' },
        url: { type: 'string' },
        extension: { type: 'string' },
        devcontainer: { type: 'boolean' },
        'no-gradle': { type: 'boolean' },
        'no-pnpm': { type: 'boolean' },
        'no-install': { type: 'boolean' },
      },
    });
    init({
      cwd: process.cwd(),
      path: values.path,
      ref: values.ref,
      url: values.url,
      extension: values.extension,
      devcontainer: values.devcontainer,
      gradle: !values['no-gradle'],
      pnpm: !values['no-pnpm'],
      install: !values['no-install'],
    });
  } else if (command === 'update') {
    const { values } = parseArgs({ args: rest, options: { ref: { type: 'string' }, 'no-install': { type: 'boolean' } } });
    update({ cwd: process.cwd(), ref: values.ref, install: !values['no-install'] });
  } else if (command === '_after-update') {
    // Run by the previous version's `update` once this version is checked out
    const { values } = parseArgs({ args: rest, options: { path: { type: 'string' }, 'no-install': { type: 'boolean' } } });
    const root = repoRoot(process.cwd());
    afterUpdate({ root, path: values.path ?? findToolPath(root) ?? 'dev', install: !values['no-install'] });
  } else {
    throw new InitError(`Unknown command "${command}". Run with --help.`);
  }
} catch (error) {
  if (error instanceof InitError) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

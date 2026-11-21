import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Where a project keeps its mcdevtools config, relative to the project root */
export const CONFIG_DIR_NAME = '.mcdevtools';

export interface Project {
  /** The mcdevtools checkout (the submodule): packages/, java/, bin/ */
  toolRoot: string;
  /** The project being developed: the nearest directory holding `.mcdevtools/config.toml` */
  root: string;
  /** `<root>/.mcdevtools`: config, templates, extensions, db seeds, profiles */
  configDir: string;
  /** False when no `.mcdevtools/config.toml` was found; `root` is then the working directory */
  found: boolean;
}

/** Walks up from `start` to the first directory containing `.mcdevtools/config.toml`. */
export function findProjectRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, CONFIG_DIR_NAME, 'config.toml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Resolves the project from `MCDEV_PROJECT` or the working directory. Synchronous so module-level paths can use it. */
export function resolveProject(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Project {
  const toolRoot = resolve(import.meta.dirname, '..', '..', '..');
  const explicit = env.MCDEV_PROJECT ? resolve(env.MCDEV_PROJECT) : undefined;
  const root = explicit ?? findProjectRoot(cwd);
  const resolved = root ?? resolve(cwd);
  return { toolRoot, root: resolved, configDir: join(resolved, CONFIG_DIR_NAME), found: root !== undefined && existsSync(join(resolved, CONFIG_DIR_NAME, 'config.toml')) };
}

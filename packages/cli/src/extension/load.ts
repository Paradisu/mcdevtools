import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Command } from '../command.ts';
import { registerExporter } from '../capture/exporters/index.ts';
import type { DevConfig } from '../config.ts';
import { registerMigrationProvider } from '../db-migrations.ts';
import { registerHelpSection } from '../help.ts';
import { setPlayerResolver } from '../mc/players.ts';
import { registerPlatform } from '../platforms/index.ts';
import { registerProviderFactory } from '../share/providers/index.ts';
import { sendLine } from '../supervisor.ts';
import { registerTemplateVars } from '../templates.ts';
import { CONFIG_DIR, DevError, PROJECT, ROOT } from '../util.ts';
import { registerPluginSource } from '../versions.ts';
import { on } from './hooks.ts';
import type { Extension, ExtensionApi } from './index.ts';

/** Finds the module an `extensions` entry points to: a directory under .mcdevtools, or a package of the project. */
export function resolveExtensionEntry(entry: string, root = ROOT, configDir = CONFIG_DIR): string {
  const dir = isAbsolute(entry) ? entry : resolve(configDir, entry);
  if (existsSync(join(dir, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      exports?: string | { '.'?: string | { default?: string; import?: string } };
      main?: string;
    };
    const dot = typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.'];
    const target = typeof dot === 'string' ? dot : (dot?.import ?? dot?.default ?? pkg.main);
    if (!target) {
      throw new DevError(`${join(dir, 'package.json')} has no "exports" or "main" for the extension entry point`);
    }
    return join(dir, target);
  }
  if (existsSync(dir) && /\.(ts|js|mjs)$/.test(dir)) {
    return dir;
  }
  try {
    return createRequire(join(root, 'package.json')).resolve(entry);
  } catch {
    throw new DevError(`Extension "${entry}" not found: neither a directory under .mcdevtools/ nor a package resolvable from ${root}`);
  }
}

function createApi(config: DevConfig, extension: Extension, addCommand: (command: Command) => void): ExtensionApi {
  return {
    project: PROJECT,
    config,
    settings: <T extends Record<string, unknown>>() => ((config as unknown as Record<string, unknown>)[extension.name] ?? {}) as T,
    registerCommand: addCommand,
    registerHelpSection,
    registerPlatform,
    registerPluginSource,
    registerExporter,
    registerShareProvider: registerProviderFactory,
    registerTemplateVars,
    registerMigrationProvider,
    registerPlayerResolver: setPlayerResolver,
    on,
    sendConsole: (instance, line) => sendLine(instance, line),
  };
}

/**
 * Imports every extension listed in `extensions` and lets it register itself. A failing extension stops the CLI
 * with a message naming it, so a broken one is never silently skipped.
 */
export async function loadExtensions(config: DevConfig, addCommand: (command: Command) => void): Promise<string[]> {
  const loaded: string[] = [];
  for (const entry of config.extensions) {
    let name = entry;
    try {
      const file = resolveExtensionEntry(entry);
      const module = (await import(pathToFileURL(file).href)) as { default?: Extension };
      const extension = module.default;
      if (!extension || typeof extension.setup !== 'function' || typeof extension.name !== 'string') {
        throw new DevError('its default export must be defineExtension({ name, setup })');
      }
      name = extension.name;
      await extension.setup(createApi(config, extension, addCommand));
      loaded.push(name);
    } catch (error) {
      const message = error instanceof DevError ? error.message : ((error as Error).stack ?? String(error));
      throw new DevError(`Extension "${name}" (${entry}) failed to load: ${message}`);
    }
  }
  return loaded;
}

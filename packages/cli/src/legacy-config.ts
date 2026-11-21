type Json = Record<string, unknown>;

export interface LegacyConversion {
  /** The same settings in the `[[instances]]` schema (config format 1) */
  config: Json;
  /** Things that could not be carried over automatically */
  notes: string[];
}

const PROFILE_JARS_OLD = 'dev/.cache/profile-jars';
const PROFILE_JARS_NEW = '.mcdevtools/.cache/profile-jars';
const NETWORK = 'main';

function isTable(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(from: Json, keys: string[]): Json {
  return Object.fromEntries(keys.filter((key) => key in from).map((key) => [key, from[key]]));
}

/**
 * Converts a `dev.toml`/`dev.local.toml` from before the extraction (fixed `[proxy]`, `[limbo]`, `[[servers]]`,
 * `purpur_build`, `velocity_*`, `[jvm]`) to the instances schema. Works on partial files too, so personal override
 * files and profile settings convert as well: keys that are absent stay absent.
 */
export function convertLegacyConfig(old: Json): LegacyConversion {
  const notes: string[] = [];
  const config: Json = {};
  Object.assign(config, pick(old, ['accept_eula', 'public_host', 'online_mode', 'data_version', 'ui', 'web', 'share', 'capture']));
  if (isTable(old.jvm)) config.java = old.jvm;
  if (typeof old.minecraft_version === 'string' && old.minecraft_version !== 'auto') {
    config.versions = { minecraft: old.minecraft_version };
  }
  if (Array.isArray(old.plugins)) {
    config.plugins = old.plugins.map((plugin) => {
      if (!isTable(plugin) || !isTable(plugin.pinned)) return plugin;
      const pinned = Object.fromEntries(
        Object.entries(plugin.pinned).map(([platform, pin]) => [
          platform,
          isTable(pin) && typeof pin.file === 'string' ? { ...pin, file: pin.file.replace(PROFILE_JARS_OLD, PROFILE_JARS_NEW) } : pin,
        ]),
      );
      return { ...plugin, pinned };
    });
  }

  const instances: Json[] = [];
  const explicit = (value: unknown): value is string => typeof value === 'string' && value !== 'auto';

  if (isTable(old.proxy)) {
    const proxy: Json = { name: 'proxy', type: 'velocity', network: NETWORK, ...pick(old.proxy, ['port', 'public_port', 'debug_port', 'memory', 'first_start_commands']) };
    if (explicit(old.velocity_version)) proxy.version = old.velocity_version;
    if (explicit(old.velocity_build)) proxy.build = old.velocity_build;
    instances.push(proxy);
  } else if (explicit(old.velocity_version) || explicit(old.velocity_build)) {
    notes.push('velocity_version / velocity_build: set version / build on your velocity instance');
  }

  if (isTable(old.limbo)) {
    const limbo: Json = { name: 'limbo', type: 'limbo', ...pick(old.limbo, ['enabled', 'port', 'public_port', 'debug_port', 'memory', 'first_start_commands']) };
    if (explicit(old.limbo_version)) limbo.version = old.limbo_version;
    instances.push(limbo);
  } else if (explicit(old.limbo_version)) {
    notes.push('limbo_version: set version on your limbo instance');
  }

  if (Array.isArray(old.servers)) {
    for (const server of old.servers.filter(isTable)) {
      const instance: Json = {
        name: server.name,
        type: 'purpur',
        network: NETWORK,
        ...pick(server, ['enabled', 'port', 'debug_port', 'memory', 'try', 'world_preset', 'first_start_commands', 'context']),
      };
      if (explicit(old.purpur_build)) instance.build = old.purpur_build;
      instances.push(instance);
    }
  } else if (explicit(old.purpur_build)) {
    notes.push('purpur_build: set build on your purpur instances');
  }

  if (instances.length > 0) config.instances = instances;
  if (isTable(old.proxy)) config.networks = [{ name: NETWORK, forwarding: 'modern' }];
  for (const key of Object.keys(old)) {
    if (!(key in config) && !['jvm', 'minecraft_version', 'proxy', 'limbo', 'servers', 'purpur_build', 'velocity_version', 'velocity_build', 'limbo_version', 'accept_eula'].includes(key)) {
      notes.push(`unknown key "${key}" was dropped`);
    }
  }
  return { config, notes };
}

/** `mcdev config migrate <file> [--write]`: prints the converted TOML, or writes `<file>` next to the project config. */
export async function migrateConfigCommand(args: string[]): Promise<void> {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { parse, stringify } = await import('smol-toml');
  const { parseArgs } = await import('node:util');
  const { log, warn, fail } = await import('./util.ts');
  const { values, positionals } = parseArgs({ args, options: { out: { type: 'string' } }, allowPositionals: true });
  const file = positionals[0] ?? fail('Usage: mcdev config migrate <dev.toml> [--out <file>]');
  const { config, notes } = convertLegacyConfig(parse(readFileSync(file, 'utf8')) as Json);
  const text = stringify(config);
  if (values.out) {
    writeFileSync(values.out, `${text}\n`);
    log(`Wrote ${values.out}`);
  } else {
    log(text);
  }
  for (const note of notes) warn(note);
}

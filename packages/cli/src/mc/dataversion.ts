import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readResolved } from '../downloads.ts';
import { platformOf } from '../platforms/index.ts';
import type { DevConfig } from '../config.ts';
import { CACHE, capture, fail } from '../util.ts';

/** `world_version` from the top-level version.json of a game server jar (Paper and its forks; proxies have none). */
export function dataVersionOfJar(jar: string): number | undefined {
  if (!existsSync(jar)) return undefined;
  const result = capture('unzip', ['-p', jar, 'version.json']);
  if (result.status !== 0) return undefined;
  try {
    const version = (JSON.parse(result.stdout) as { world_version?: number }).world_version;
    return typeof version === 'number' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * DataVersion stamped on generated items: `data_version` in the config, else the first downloaded game server jar's. Items
 * written with an older version are upgraded by the server's data fixers; a newer one is refused, so don't guess.
 */
export async function dataVersion(config: DevConfig & { data_version?: number }): Promise<number> {
  if (config.data_version) return config.data_version;
  const resolved = await readResolved().catch(() => undefined);
  let found: number | undefined;
  for (const server of Object.values(resolved?.servers ?? {}).filter((candidate) => platformOf(candidate.type).worlds)) {
    // resolved.json records absolute paths; the checkout may have moved since (devcontainer vs host)
    found = dataVersionOfJar(server.file) ?? dataVersionOfJar(join(CACHE, 'servers', basename(server.file)));
    if (found) break;
  }
  return found ?? fail('Cannot determine the Minecraft DataVersion: run `mcdev setup`, or set data_version in .mcdevtools/config.local.toml');
}

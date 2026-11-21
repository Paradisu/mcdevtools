import type { ResolvedForwarding } from '../config.ts';
import { fail } from '../util.ts';
import { LIMBO } from './limbo.ts';
import { FABRIC, FORGE, NEOFORGE, SPONGE } from './mods.ts';
import { BUNGEECORD, VIAPROXY, WATERFALL } from './proxies.ts';
import { FOLIA, PAPER, PAPER_FORK } from './paper.ts';
import { PURPUR_PLATFORM } from './purpur.ts';
import type { PlatformDef } from './types.ts';
import { VELOCITY } from './velocity.ts';

export type { PlatformDef, PrepareCtx, ResolveCtx, Role, ServerArtifact } from './types.ts';

const PLATFORMS = new Map<string, PlatformDef>();

/** Adds a server type. Extensions call this through `api.registerPlatform`. */
export function registerPlatform(def: PlatformDef): void {
  if (PLATFORMS.has(def.type)) {
    fail(`Platform type "${def.type}" is registered twice`);
  }
  PLATFORMS.set(def.type, def);
}

export function platformOf(type: string): PlatformDef {
  return PLATFORMS.get(type) ?? fail(`Unknown instance type "${type}". Known types: ${[...PLATFORMS.keys()].join(', ')}`);
}

/** Folder of plugin/mod jars for a platform. */
export function pluginsDirOf(def: PlatformDef): string {
  return def.pluginsDir ?? 'plugins';
}

/** Folder of per-plugin config folders for a platform. */
export function configDirOf(def: PlatformDef): string {
  return def.configDir ?? pluginsDirOf(def);
}

/** Whether packet capture works on a platform (as a plugin or a Java agent). */
export function capturableOf(def: PlatformDef): boolean {
  return def.capture === 'plugin' || def.capture === 'agent';
}

export function forwardingOf(def: PlatformDef): ResolvedForwarding[] {
  return def.forwarding ?? ['none'];
}

export function platformTypes(): string[] {
  return [...PLATFORMS.keys()];
}

for (const def of [PURPUR_PLATFORM, PAPER, FOLIA, PAPER_FORK, VELOCITY, LIMBO, WATERFALL, BUNGEECORD, VIAPROXY, FABRIC, FORGE, NEOFORGE, SPONGE]) registerPlatform(def);

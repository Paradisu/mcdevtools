import { fail } from '../util.ts';
import { LIMBO } from './limbo.ts';
import { PURPUR_PLATFORM } from './purpur.ts';
import type { PlatformDef } from './types.ts';
import { VELOCITY } from './velocity.ts';

export type { PlatformDef, ResolveCtx, Role, ServerArtifact } from './types.ts';

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

export function platformTypes(): string[] {
  return [...PLATFORMS.keys()];
}

for (const def of [PURPUR_PLATFORM, VELOCITY, LIMBO]) registerPlatform(def);

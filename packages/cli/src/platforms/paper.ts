import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail } from '../util.ts';
import { fillArtifact, fillBuild } from './fill.ts';
import type { PlatformDef } from './types.ts';

/** What every Bukkit-family backend has in common; plugins and templates use the `paper` family. */
const BACKEND: Omit<PlatformDef, 'type' | 'label' | 'resolve' | 'cacheName'> = {
  family: 'paper',
  role: 'server',
  startOrder: 20,
  needsEula: true,
  terminalFlags: true,
  nogui: true,
  stopCommand: 'stop',
  readyPattern: /Done \(/,
  timestampedLogs: false,
  waitForPort: false,
  hotswap: true,
  worlds: true,
  installsProjectArtifacts: true,
};

/** A PaperMC Fill project that publishes server jars per Minecraft version (paper, folia). */
function fillBackend(project: string, label: string): PlatformDef {
  return {
    ...BACKEND,
    type: project,
    label,
    async resolve(ctx, instance) {
      const version = instance.version === 'auto' ? await ctx.minecraft() : instance.version;
      const build = await fillBuild(project, version, instance.build);
      return { ...fillArtifact(build), version, build: String(build.id) };
    },
    cacheName: (artifact) => `${project}-${artifact.version}-${artifact.build}.jar`,
  };
}

/** Paper itself, at the newest build for the Minecraft version. `version` is a Minecraft version, `build` a Fill build id. */
export const PAPER = fillBackend('paper', 'Paper');

/** Folia (regionised multithreading). Plugins must declare `folia-supported: true`; the capture plugin does. */
export const FOLIA = fillBackend('folia', 'Folia');

/**
 * Any other Paper-like server (Pufferfish, Leaf, a build of your own fork): set `jar` on the instance to a path
 * relative to the project root, or to an http(s) URL. A local file is copied again on every `mcdev setup`.
 */
export const PAPER_FORK: PlatformDef = {
  ...BACKEND,
  type: 'paper-fork',
  label: 'Paper fork',
  async resolve(_ctx, instance) {
    const jar = instance.extra.jar;
    if (typeof jar !== 'string' || jar === '') {
      fail(`Instance "${instance.name}" (type paper-fork) needs jar = "<path relative to the project, or an https:// URL>"`);
    }
    const version = instance.version === 'auto' ? 'custom' : instance.version;
    if (/^https?:\/\//.test(jar)) {
      return { name: basename(new URL(jar).pathname) || `${instance.name}.jar`, url: jar, version };
    }
    return { name: basename(jar), url: pathToFileURL(resolve(ROOT, jar)).href, version };
  },
  cacheName: (artifact) => `fork-${artifact.version}-${artifact.name}`,
};

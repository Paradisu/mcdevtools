import { fail } from '../util.ts';
import { modrinthVersions } from '../versions.ts';
import type { PlatformDef } from './types.ts';

/** The standalone Limbo server (a waiting room). It is not part of any network's server list. */
export const LIMBO: PlatformDef = {
  type: 'limbo',
  label: 'Limbo',
  family: 'limbo',
  role: 'server',
  startOrder: 0,
  async resolve(ctx, instance) {
    const minecraft = await ctx.minecraft();
    // Limbo releases are built for exactly one Minecraft version
    const candidates = await modrinthVersions('limbo-server', ['java-agent'], [minecraft]);
    const pick = instance.version === 'auto' ? candidates[0] : candidates.find((candidate) => candidate.version_number === instance.version);
    if (!pick) {
      fail(
        `No Limbo build on Modrinth for Minecraft ${minecraft}${instance.version === 'auto' ? '' : ` matching "${instance.version}"`}. ` +
          `Set enabled = false on ${instance.name}, or pin its version to a build you provide.`,
      );
    }
    const file = pick.files.find((candidate) => candidate.primary) ?? pick.files[0];
    if (!file) {
      fail(`Limbo ${pick.version_number} has no files`);
    }
    return { name: file.filename, url: file.url, sha512: file.hashes.sha512, version: pick.version_number };
  },
  cacheName: (artifact) => artifact.name,
  needsEula: false,
  terminalFlags: false,
  nogui: true,
  stopCommand: 'stop',
  readyPattern: /Limbo server listening/,
  timestampedLogs: true,
  waitForPort: false,
  hotswap: false,
  worlds: false,
  installsProjectArtifacts: false,
};

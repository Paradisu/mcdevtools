import { fail, getJson } from '../util.ts';
import type { PlatformDef, ServerArtifact } from './types.ts';

const PURPUR = 'https://api.purpurmc.org/v2/purpur';

interface PurpurBuilds {
  builds: { latest: string; all: string[] };
}

interface PurpurBuild {
  build: string;
  result: string;
  md5: string;
}

async function purpurBuildFor(minecraft: string, wanted: string): Promise<ServerArtifact> {
  let versions: PurpurBuilds;
  try {
    versions = await getJson<PurpurBuilds>(`${PURPUR}/${minecraft}`);
  } catch (error) {
    const index = await getJson<{ versions: string[] }>(PURPUR);
    fail(`${(error as Error).message}\nPurpur has no ${minecraft} yet. Latest versions: ${index.versions.slice(-5).join(', ')}`);
  }
  const build = wanted === 'auto' || wanted === 'latest' ? versions.builds.latest : wanted;
  const info = await getJson<PurpurBuild>(`${PURPUR}/${minecraft}/${build}`);
  if (info.result !== 'SUCCESS') {
    fail(`Purpur ${minecraft} build ${build} did not succeed (${info.result})`);
  }
  return {
    name: `purpur-${minecraft}-${build}.jar`,
    url: `${PURPUR}/${minecraft}/${build}/download`,
    md5: info.md5,
    version: minecraft,
    build,
  };
}

/** Purpur, a Paper fork (like production); plugins still target the "paper" family. */
export const PURPUR_PLATFORM: PlatformDef = {
  type: 'purpur',
  label: 'Purpur',
  family: 'paper',
  role: 'server',
  startOrder: 20,
  async resolve(ctx, instance) {
    return purpurBuildFor(instance.version === 'auto' ? await ctx.minecraft() : instance.version, instance.build);
  },
  cacheName: (artifact) => artifact.name,
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
  capture: 'agent',
  forwarding: ['modern', 'legacy', 'none'],
};

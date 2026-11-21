import { fail } from '../util.ts';
import { fillArtifact, fillBuild } from './fill.ts';
import type { PlatformDef } from './types.ts';

export const VELOCITY: PlatformDef = {
  type: 'velocity',
  label: 'Velocity',
  family: 'velocity',
  role: 'proxy',
  startOrder: 10,
  async resolve(ctx, instance) {
    let version = instance.version;
    if (version === 'auto') {
      const key = ctx.config.versions.auto.velocity_from;
      const api = (await ctx.catalog())[key];
      if (!api) {
        fail(`Cannot derive the Velocity version for ${instance.name}: ${key} is not in the catalog (${ctx.config.versions.auto.catalog}). Set version = "<x.y.z>-SNAPSHOT" on it.`);
      }
      version = `${api.split('-')[0]}-SNAPSHOT`;
    }
    const build = await fillBuild('velocity', version, instance.build);
    return { ...fillArtifact(build), version, build: String(build.id) };
  },
  cacheName: (artifact) => `velocity-${artifact.version}-${artifact.build}.jar`,
  needsEula: false,
  terminalFlags: true,
  nogui: false,
  stopCommand: 'shutdown',
  // haproxy-protocol is read by Velocity's own reload; without it the listener keeps expecting the old framing
  reloadCommand: 'velocity reload',
  readyPattern: /Done \(/,
  timestampedLogs: false,
  waitForPort: true,
  hotswap: true,
  worlds: false,
  installsProjectArtifacts: true,
  capture: 'plugin',
  forwarding: ['modern', 'legacy', 'none'],
};

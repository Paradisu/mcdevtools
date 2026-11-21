import { fail, getJson } from '../util.ts';
import { fillArtifact, fillBuild, fillLatestVersion } from './fill.ts';
import type { InstanceConfig } from '../config.ts';
import type { PlatformDef } from './types.ts';

/** BungeeCord-family proxies: legacy forwarding only, `end` stops them, `greload` re-reads the config. */
const BUNGEE: Omit<PlatformDef, 'type' | 'label' | 'resolve' | 'cacheName'> = {
  family: 'bungee',
  role: 'proxy',
  startOrder: 10,
  needsEula: false,
  // stdin is a pipe owned by the supervisor, not a terminal
  terminalFlags: false,
  nogui: false,
  stopCommand: 'end',
  reloadCommand: 'greload',
  readyPattern: /Listening on/,
  // BungeeCord writes proxy.log.0 (Waterfall, a fork, uses logs/latest.log)
  logFile: 'proxy.log.0',
  timestampedLogs: false,
  waitForPort: true,
  hotswap: false,
  worlds: false,
  installsProjectArtifacts: true,
  capture: 'none',
  forwarding: ['legacy', 'none'],
  launch: () => ['-Djline.terminal=jline.UnsupportedTerminal', '-jar', 'server.jar'],
};

/** Waterfall (the discontinued PaperMC fork of BungeeCord). `version` is a Waterfall version such as `1.21`. */
export const WATERFALL: PlatformDef = {
  ...BUNGEE,
  logFile: undefined,
  type: 'waterfall',
  label: 'Waterfall',
  async resolve(_ctx, instance) {
    const version = instance.version === 'auto' ? await fillLatestVersion('waterfall') : instance.version;
    const build = await fillBuild('waterfall', version, instance.build);
    return { ...fillArtifact(build), version, build: String(build.id) };
  },
  cacheName: (artifact) => `waterfall-${artifact.version}-${artifact.build}.jar`,
};

const BUNGEE_JOB = 'https://hub.spigotmc.org/jenkins/job/BungeeCord';

interface JenkinsBuild {
  number: number;
  artifacts: { fileName: string; relativePath: string }[];
}

/** BungeeCord from its Jenkins job (the last successful build, or `build` for a specific one). */
export const BUNGEECORD: PlatformDef = {
  ...BUNGEE,
  type: 'bungeecord',
  label: 'BungeeCord',
  async resolve(_ctx, instance) {
    const which = instance.build === 'auto' ? 'lastSuccessfulBuild' : instance.build;
    const build = await getJson<JenkinsBuild>(`${BUNGEE_JOB}/${which}/api/json?tree=number,artifacts%5BfileName,relativePath%5D`);
    const artifact = build.artifacts.find((candidate) => candidate.fileName === 'BungeeCord.jar') ?? fail(`BungeeCord build ${build.number} has no BungeeCord.jar`);
    // The build number, not lastSuccessfulBuild: the URL then keeps meaning the same jar
    return { name: artifact.fileName, url: `${BUNGEE_JOB}/${build.number}/artifact/${artifact.relativePath}`, version: `build-${build.number}`, build: String(build.number) };
  },
  cacheName: (artifact) => `bungeecord-${artifact.build}.jar`,
};

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string; digest?: string | null }[];
}

/**
 * ViaProxy: lets clients of other Minecraft versions join. It is a proxy of its own network that forwards to one
 * target: `target = "<instance>"` (default: the network's first other proxy, else its first backend), plus the
 * optional `target_version` ViaProxy's `--target-version` takes. It takes no part in forwarding (clients that
 * connect to it reach the target like any other client).
 */
export const VIAPROXY: PlatformDef = {
  family: 'viaproxy',
  role: 'proxy',
  startOrder: 15,
  type: 'viaproxy',
  label: 'ViaProxy',
  async resolve(_ctx, instance) {
    const release = await getJson<GithubRelease>(
      `https://api.github.com/repos/ViaVersion/ViaProxy/releases/${instance.version === 'auto' ? 'latest' : `tags/${instance.version}`}`,
      process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
    );
    // ViaProxy-3.4.14.jar; the +java8 build is for old JVMs
    const asset = release.assets.find((candidate) => /^ViaProxy-[\d.]+\.jar$/.test(candidate.name)) ?? fail(`ViaProxy ${release.tag_name} has no ViaProxy-<version>.jar asset`);
    return {
      name: asset.name,
      url: asset.browser_download_url,
      sha256: asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : undefined,
      version: release.tag_name,
    };
  },
  cacheName: (artifact) => artifact.name,
  needsEula: false,
  terminalFlags: false,
  nogui: false,
  stopCommand: 'stop',
  readyPattern: /Started|listening|Binding/i,
  timestampedLogs: false,
  waitForPort: true,
  hotswap: false,
  worlds: false,
  installsProjectArtifacts: true,
  capture: 'none',
  // Not part of forwarding: the empty list excludes it from the network's mode
  forwarding: [],
  launch: ({ config, instance }) => ['-jar', 'server.jar', ...viaProxyArgs(config.instances, instance)],
};

/** The `cli` arguments of a ViaProxy instance, which need the topology (the target's port). */
export function viaProxyArgs(instances: InstanceConfig[], instance: InstanceConfig): string[] {
  const named = typeof instance.extra.target === 'string' ? instances.find((i) => i.name === instance.extra.target) : undefined;
  if (typeof instance.extra.target === 'string' && !named) {
    fail(`ViaProxy "${instance.name}": target "${instance.extra.target}" is not an instance`);
  }
  const target =
    named ??
    instances.find((i) => i.enabled && i.network === instance.network && i.name !== instance.name && i.type !== 'viaproxy' && i.port !== instance.port) ??
    fail(`ViaProxy "${instance.name}" has nothing to forward to: add another instance to its network or set target = "<instance>"`);
  const args = ['cli', '--bind-address', `0.0.0.0:${instance.port}`, '--target-address', `127.0.0.1:${target.port}`, '--auth-method', 'NONE'];
  if (typeof instance.extra.target_version === 'string') args.push('--target-version', instance.extra.target_version);
  return args;
}

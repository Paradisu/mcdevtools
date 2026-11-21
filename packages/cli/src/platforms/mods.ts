import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { capture, fail, getJson, getText } from '../util.ts';
import type { PlatformDef, PrepareCtx, ServerArtifact } from './types.ts';

/** What the mod-loader servers share: mods in `mods/`, configs in `config/`, no proxy forwarding (so `none`). */
const MODDED: Omit<PlatformDef, 'type' | 'label' | 'family' | 'resolve' | 'cacheName'> = {
  role: 'server',
  startOrder: 20,
  needsEula: true,
  terminalFlags: false,
  nogui: true,
  stopCommand: 'stop',
  readyPattern: /Done \(/,
  timestampedLogs: false,
  waitForPort: false,
  hotswap: false,
  worlds: true,
  installsProjectArtifacts: true,
  capture: 'agent',
  forwarding: ['none'],
  pluginsDir: 'mods',
  configDir: 'config',
};

/** Numeric-aware descending sort of dotted versions: `21.4.10` before `21.4.9`. */
function newestFirst(versions: string[]): string[] {
  const key = (version: string) => version.split(/[.+-]/).map((part) => Number(part) || 0);
  return [...versions].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    }
    return 0;
  });
}

interface FabricLoader {
  loader: { version: string; stable: boolean };
}

/** Fabric: the server launcher jar from Fabric's meta API for a Minecraft version (newest stable loader and installer). */
export const FABRIC: PlatformDef = {
  ...MODDED,
  type: 'fabric',
  label: 'Fabric',
  family: 'fabric',
  async resolve(ctx, instance) {
    const mc = instance.version === 'auto' ? await ctx.minecraft() : instance.version;
    const loaders = await getJson<FabricLoader[]>(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`);
    const loader = (instance.build === 'auto' ? loaders.find((candidate) => candidate.loader.stable) : loaders.find((candidate) => candidate.loader.version === instance.build))?.loader.version;
    if (!loader) {
      fail(`Fabric has no ${instance.build === 'auto' ? 'stable loader' : `loader ${instance.build}`} for Minecraft ${mc}`);
    }
    const installers = await getJson<{ version: string; stable: boolean }[]>('https://meta.fabricmc.net/v2/versions/installer');
    const installer = installers.find((candidate) => candidate.stable)?.version ?? fail('Fabric lists no stable installer');
    return {
      name: `fabric-server-mc.${mc}-loader.${loader}-launcher.${installer}.jar`,
      url: `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}/${loader}/${installer}/server/jar`,
      version: mc,
      build: loader,
    };
  },
  cacheName: (artifact) => artifact.name,
};

/** Runs a Forge-style installer in the instance directory; it downloads the libraries and writes `unix_args.txt`. */
async function runInstaller(ctx: PrepareCtx, label: string): Promise<void> {
  const result = capture(ctx.javaBin, ['-jar', 'server.jar', '--installServer'], { cwd: ctx.dir });
  if (result.status !== 0) {
    fail(`The ${label} installer failed:\n${(result.stderr || result.stdout).trim().split('\n').slice(-8).join('\n')}`);
  }
}

/** `@libraries/<group>/<version>/unix_args.txt`, the launch arguments file the installer wrote. */
function argsFile(dir: string, group: string[], label: string): string {
  const base = join(dir, 'libraries', ...group);
  const version = existsSync(base) ? newestFirst(readdirSync(base))[0] : undefined;
  if (!version || !existsSync(join(base, version, 'unix_args.txt'))) {
    fail(`The ${label} installer did not produce ${join('libraries', ...group)}/<version>/unix_args.txt`);
  }
  return `@${[...group, version, 'unix_args.txt'].join('/').replace(/^/, 'libraries/')}`;
}

/** Forge (1.17 and newer, the `unix_args.txt` launch style). `version` is a Minecraft version, `build` a Forge version or `recommended`. */
export const FORGE: PlatformDef = {
  ...MODDED,
  type: 'forge',
  label: 'Forge',
  family: 'forge',
  async resolve(ctx, instance) {
    const mc = instance.version === 'auto' ? await ctx.minecraft() : instance.version;
    const promos = (await getJson<{ promos: Record<string, string> }>('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos;
    const forge = instance.build === 'auto' || instance.build === 'latest' ? promos[`${mc}-latest`] : instance.build === 'recommended' ? promos[`${mc}-recommended`] : instance.build;
    if (!forge) {
      fail(`Forge has no build for Minecraft ${mc}. Set version = "<minecraft version>" on the instance (Forge lags behind Minecraft).`);
    }
    return {
      name: `forge-${mc}-${forge}-installer.jar`,
      url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${forge}/forge-${mc}-${forge}-installer.jar`,
      version: mc,
      build: forge,
    };
  },
  cacheName: (artifact) => artifact.name,
  prepare: (ctx) => runInstaller(ctx, 'Forge'),
  launch: ({ dir }) => [argsFile(dir, ['net', 'minecraftforge', 'forge'], 'Forge'), 'nogui'],
};

/**
 * NeoForge versions follow the Minecraft version: `1.21.4` is `21.4.x`, and a Minecraft version without the
 * `1.` prefix (`26.3`) is the prefix itself (`26.3.0.x`).
 */
function neoforgePrefix(mc: string): string {
  return mc.startsWith('1.') ? mc.slice(2) : mc;
}

/** NeoForge. `version` is a Minecraft version, `build` an exact NeoForge version. */
export const NEOFORGE: PlatformDef = {
  ...MODDED,
  type: 'neoforge',
  label: 'NeoForge',
  family: 'neoforge',
  async resolve(ctx, instance) {
    const mc = instance.version === 'auto' ? await ctx.minecraft() : instance.version;
    let build = instance.build;
    if (build === 'auto' || build === 'latest') {
      const xml = await getText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
      const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1]!);
      const prefix = `${neoforgePrefix(mc)}.`;
      const matching = newestFirst(versions.filter((version) => version.startsWith(prefix)));
      // Betas only when nothing else exists for that Minecraft version
      build = matching.find((version) => !/beta|alpha/i.test(version)) ?? matching[0] ?? fail(`NeoForge has no build for Minecraft ${mc}. Set version = "<minecraft version>" on the instance.`);
    }
    return {
      name: `neoforge-${build}-installer.jar`,
      url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${build}/neoforge-${build}-installer.jar`,
      version: mc,
      build,
    };
  },
  cacheName: (artifact) => artifact.name,
  prepare: (ctx) => runInstaller(ctx, 'NeoForge'),
  launch: ({ dir }) => [argsFile(dir, ['net', 'neoforged', 'neoforge'], 'NeoForge'), 'nogui'],
};

interface SpongeAssets {
  assets: { classifier: string; downloadUrl: string; extension: string; md5?: string }[];
}

/** SpongeVanilla: the `universal` jar of the newest build for a Minecraft version. `build` pins an exact Sponge version. */
export const SPONGE: PlatformDef = {
  ...MODDED,
  type: 'sponge',
  label: 'SpongeVanilla',
  family: 'sponge',
  async resolve(ctx, instance) {
    const mc = instance.version === 'auto' ? await ctx.minecraft() : instance.version;
    const api = 'https://dl-api.spongepowered.org/v2/groups/org.spongepowered/artifacts/spongevanilla/versions';
    let build = instance.build;
    if (build === 'auto' || build === 'latest') {
      const listing = await getJson<{ artifacts: Record<string, unknown> }>(`${api}?tags=${encodeURIComponent(`minecraft:${mc}`)}&limit=1`);
      build = Object.keys(listing.artifacts)[0] ?? fail(`SpongeVanilla has no build for Minecraft ${mc}. Set version = "<minecraft version>" on the instance.`);
    }
    const assets = (await getJson<SpongeAssets>(`${api}/${encodeURIComponent(build)}`)).assets;
    const universal = assets.find((asset) => asset.classifier === 'universal' && asset.extension === 'jar') ?? fail(`SpongeVanilla ${build} has no universal jar`);
    const artifact: ServerArtifact = { name: `spongevanilla-${build}-universal.jar`, url: universal.downloadUrl, md5: universal.md5, version: mc, build };
    return artifact;
  },
  cacheName: (artifact) => artifact.name,
};

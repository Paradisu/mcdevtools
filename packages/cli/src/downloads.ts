import { step, streamRow } from './output.ts';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { DevConfig, Platform, PluginConfig } from './config.ts';
import { CACHE, ROOT, download, fail, log, sha256File, warn } from './util.ts';
import { type PlatformDef, platformOf } from './platforms/index.ts';
import type { ResolveCtx, ServerArtifact } from './platforms/index.ts';
import { readCatalog, resolveMinecraft, resolvePlugin } from './versions.ts';
import type { Artifact } from './versions.ts';
import { ensureProtocol } from './capture/protocol.ts';

const RESOLVED = join(CACHE, 'resolved.json');

/** What was downloaded, with enough detail (url, sha256) for a profile to pin and re-download exactly the same files */
export interface ResolvedArtifact {
  file: string;
  url?: string;
  sha256: string;
}

/** A downloaded server jar; `type` is the platform type it was resolved for */
export interface ResolvedServer extends ResolvedArtifact {
  type: string;
  version: string;
  build?: string;
}

export interface ResolvedFiles {
  minecraft: string;
  /** By instance name; only instances that were enabled at `setup` */
  servers: Record<string, ResolvedServer>;
  plugins: (ResolvedArtifact & {
    key: string;
    platform: Platform;
    name: string;
    version: string;
    /** The url keeps pointing at the same bytes (versioned releases); false for "latest" links and local jars */
    immutable: boolean;
  })[];
}

function pinFailureHint(plugin: PluginConfig, platform: Platform, message: string): string {
  return plugin.pinned?.[platform] && /sha256 mismatch/.test(message)
    ? `${message}\n  The upstream file changed since the profile was exported; ask for a profile exported with --embed-jars.`
    : message;
}

export async function readResolved(): Promise<ResolvedFiles> {
  if (!existsSync(RESOLVED)) {
    fail('Nothing downloaded yet. Run `mcdev setup` first.');
  }
  const resolved = JSON.parse(await readFile(RESOLVED, 'utf8')) as ResolvedFiles;
  // Paths were recorded as absolute; the checkout may have moved since (devcontainer /workspaces vs a host path)
  const marker = `${sep}.cache${sep}`;
  const relocate = (file: string): string => {
    const at = file.lastIndexOf(marker);
    return at === -1 ? file : join(CACHE, file.slice(at + marker.length));
  };
  for (const server of Object.values(resolved.servers ?? {})) server.file = relocate(server.file);
  for (const plugin of resolved.plugins) plugin.file = relocate(plugin.file);
  return resolved;
}

async function fetchArtifact(artifact: Artifact, subdir: string, fileName: string, force: boolean): Promise<{ file: string; note: string }> {
  const dest = join(CACHE, subdir, fileName);
  if (force || !existsSync(dest)) {
    await download(artifact.url, dest, { md5: artifact.md5, sha256: artifact.sha256, sha512: artifact.sha512 });
    return { file: dest, note: 'downloaded' };
  }
  return { file: dest, note: 'cached' };
}

/** Resolves versions, downloads everything into .mcdevtools/.cache and records the result in resolved.json. */
export async function setup(config: DevConfig, refresh: boolean): Promise<void> {
  step('Resolving versions');
  const minecraft = await resolveMinecraft(config);
  log(`Minecraft ${minecraft}`);
  let catalog: Promise<Record<string, string>> | undefined;
  const ctx: ResolveCtx = {
    config,
    minecraft: async () => minecraft,
    catalog: () => (catalog ??= readCatalog(config)),
  };

  step('Servers');
  const enabled = config.instances.filter((instance) => instance.enabled);
  const serverRow = streamRow([{ min: Math.max(8, ...enabled.map((instance) => instance.name.length)) }, { min: 8 }, { min: 14 }, {}]);
  const servers: ResolvedFiles['servers'] = {};
  // Instances of the same type, version and build share one download
  const shared = new Map<string, Promise<{ artifact: ServerArtifact; file: string; note: string }>>();
  for (const instance of enabled) {
    const def: PlatformDef = platformOf(instance.type);
    const key = `${instance.type}|${instance.version}|${instance.build}`;
    if (!shared.has(key)) {
      shared.set(
        key,
        (async () => {
          const artifact = await def.resolve(ctx, instance);
          const fetched = await fetchArtifact(artifact, 'servers', def.cacheName(artifact), false);
          return { artifact, ...fetched };
        })(),
      );
    }
    const { artifact, file, note } = await shared.get(key)!;
    servers[instance.name] = {
      type: instance.type,
      version: artifact.version,
      build: artifact.build,
      file,
      url: artifact.url,
      sha256: sha256File(file),
    };
    log(`  ${serverRow([instance.name, def.label, artifact.build ? `${artifact.version} #${artifact.build}` : artifact.version, note])}`);
  }

  step('Plugins');
  const pluginRow = streamRow([
    { min: Math.max(0, ...config.plugins.flatMap((plugin) => plugin.platforms.map((platform) => `${plugin.key} (${platform})`.length))) },
    { min: 14 },
    {},
  ]);
  const plugins: ResolvedFiles['plugins'] = [];
  const failures: string[] = [];
  for (const plugin of config.plugins) {
    for (const platform of plugin.platforms) {
      const label = `${plugin.key} (${platform})`;
      try {
        if (plugin.source === 'local' && !plugin.pinned?.[platform]) {
          if (!plugin.path) {
            fail('source = "local" requires path');
          }
          const source = resolve(ROOT, plugin.path);
          if (!existsSync(source)) {
            fail(`${plugin.path} does not exist`);
          }
          const dest = join(CACHE, 'plugins', platform, `${plugin.key}.jar`);
          await mkdir(join(CACHE, 'plugins', platform), { recursive: true });
          await copyFile(source, dest);
          plugins.push({
            key: plugin.key,
            platform,
            file: dest,
            name: `${plugin.key}.jar`,
            version: 'local',
            sha256: sha256File(dest),
            immutable: false,
          });
          log(`  ${pluginRow([label, 'local', plugin.path])}`);
          continue;
        }
        const pin = plugin.pinned?.[platform];
        if (pin) {
          const pinned = pin.file
            ? { file: resolve(ROOT, pin.file), note: 'pinned' }
            : await fetchArtifact(
                { name: `${plugin.key}.jar`, url: pin.url, sha256: pin.sha256 },
                join('plugins', platform),
                `${plugin.key}-${pin.version.replace(/[^A-Za-z0-9._-]/g, '_')}.jar`,
                false,
              );
          const file = pinned.file;
          if (!existsSync(file)) {
            fail(`pinned jar ${pin.file} does not exist`);
          }
          plugins.push({
            key: plugin.key,
            platform,
            file,
            name: `${plugin.key}.jar`,
            version: pin.version,
            url: pin.url,
            sha256: pin.sha256,
            immutable: true,
          });
          log(`  ${pluginRow([label, pin.version, pin.file ? 'pinned, local file' : `pinned, ${pinned.note}`])}`);
          continue;
        }
        const artifact = await resolvePlugin(plugin, platform, minecraft);
        // URL sources have no checksum, so they are re-downloaded on --refresh only
        const fetched = await fetchArtifact(
          artifact,
          join('plugins', platform),
          `${plugin.key}-${artifact.version.replace(/[^A-Za-z0-9._-]/g, '_')}.jar`,
          refresh && plugin.source === 'url',
        );
        const file = fetched.file;
        plugins.push({
          key: plugin.key,
          platform,
          file,
          name: `${plugin.key}.jar`,
          version: artifact.version,
          url: artifact.url,
          sha256: sha256File(file),
          immutable: plugin.source !== 'url',
        });
        log(`  ${pluginRow([label, artifact.version, fetched.note])}`);
      } catch (error) {
        failures.push(`${label}: ${pinFailureHint(plugin, platform, (error as Error).message)}`);
      }
    }
  }

  await mkdir(CACHE, { recursive: true });
  const resolved: ResolvedFiles = { minecraft, servers, plugins };
  await writeFile(RESOLVED, JSON.stringify(resolved, null, 2));

  if (failures.length > 0) {
    for (const failure of failures) {
      warn(failure);
    }
    fail(`${failures.length} plugin download(s) failed (the rest were downloaded)`);
  }
  if (config.capture.enabled) {
    // The capture plugin follows connection states with ids from Mojang's packet report; never let this fail setup
    try {
      await ensureProtocol(config, refresh);
    } catch (error) {
      warn(`Could not generate the capture packet table (${(error as Error).message}); run \`mcdev capture protocol\` later`);
    }
  }
  log('Setup complete.');
}

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import type { DevConfig, Platform, PluginConfig } from './config.ts';
import { FAMILIES } from './platforms/families.ts';
import { ROOT, fail, getJson } from './util.ts';

const MODRINTH = 'https://api.modrinth.com/v2';

export interface Artifact {
  name: string;
  url: string;
  md5?: string;
  sha256?: string;
  sha512?: string;
}

export interface ResolvedPlugin extends Artifact {
  key: string;
  platform: Platform;
  /** Version label for display */
  version: string;
}

/** The `[versions]` of the project's Gradle version catalog; empty when it has none. */
export async function readCatalog(config: DevConfig): Promise<Record<string, string>> {
  const path = join(ROOT, config.versions.auto.catalog);
  if (!existsSync(path)) {
    return {};
  }
  const toml = parse(await readFile(path, 'utf8')) as { versions?: Record<string, string> };
  return toml.versions ?? {};
}

/** [versions].minecraft, or the version in the catalog's paper-api ("1.21.4-R0.1-SNAPSHOT", "1.21.8.build.N-beta"). */
export async function resolveMinecraft(config: DevConfig): Promise<string> {
  if (config.versions.minecraft !== 'auto') {
    return config.versions.minecraft;
  }
  const key = config.versions.auto.minecraft_from;
  const api = (await readCatalog(config))[key];
  if (!api) {
    fail(`Cannot derive the Minecraft version: ${key} is not in ${config.versions.auto.catalog}. Set minecraft = "<version>" under [versions].`);
  }
  const match = /^(?<mc>.+?)\.build\.\d+/.exec(api);
  if (!match?.groups?.mc) {
    fail(`Could not derive the Minecraft version from ${key} "${api}"; set minecraft under [versions].`);
  }
  return match.groups.mc;
}

export interface ModrinthVersion {
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  files: { url: string; filename: string; primary: boolean; hashes: { sha512: string } }[];
}

export async function modrinthVersions(slug: string, loaders: string[], gameVersions?: string[]): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams({ loaders: JSON.stringify(loaders) });
  if (gameVersions) {
    params.set('game_versions', JSON.stringify(gameVersions));
  }
  return getJson<ModrinthVersion[]>(`${MODRINTH}/project/${encodeURIComponent(slug)}/version?${params}`);
}

async function resolveModrinth(plugin: PluginConfig, platform: Platform, minecraft: string): Promise<ResolvedPlugin> {
  const slug = plugin.slug ?? plugin.key;
  const family = FAMILIES[platform];
  const loaders = family.modrinthLoaders;

  let candidates = await modrinthVersions(slug, loaders, [minecraft]);
  if (candidates.length === 0 && family.tagsMinecraft) {
    for (const fallback of plugin.game_version_fallback ?? []) {
      candidates = await modrinthVersions(slug, loaders, [fallback]);
      if (candidates.length > 0) {
        break;
      }
    }
  }
  if (candidates.length === 0 && !family.tagsMinecraft) {
    // Many Velocity and Limbo plugins do not tag Minecraft versions at all
    candidates = await modrinthVersions(slug, loaders);
  }
  if (candidates.length === 0) {
    fail(
      `No ${platform} build of "${slug}" on Modrinth for Minecraft ${minecraft}` +
        (family.tagsMinecraft ? ' (add game_version_fallback = ["..."] to allow an older tag)' : ''),
    );
  }

  const pick = plugin.version
    ? candidates.find((candidate) => candidate.version_number === plugin.version)
    : candidates.find((candidate) => plugin.allow_prerelease || candidate.version_type === 'release');
  if (!pick) {
    fail(`No matching ${plugin.version ? `version ${plugin.version}` : 'release'} of "${slug}" for ${platform}`);
  }
  const file = pick.files.find((candidate) => candidate.primary) ?? pick.files[0];
  if (!file) {
    fail(`Modrinth version ${pick.version_number} of "${slug}" has no files`);
  }
  return {
    key: plugin.key,
    platform,
    name: file.filename,
    url: file.url,
    sha512: file.hashes.sha512,
    version: pick.version_number,
  };
}

interface JenkinsBuild {
  number: number;
  artifacts: { fileName: string; relativePath: string }[];
}

async function resolveJenkins(plugin: PluginConfig, platform: Platform): Promise<ResolvedPlugin> {
  const job = plugin.job_url?.replace(/\/+$/, '') ?? fail(`Plugin "${plugin.key}" needs job_url`);
  const build = await getJson<JenkinsBuild>(
    `${job}/lastSuccessfulBuild/api/json?tree=number,artifacts%5BfileName,relativePath%5D`,
  );
  const pattern = plugin.artifact_pattern ? new RegExp(plugin.artifact_pattern) : /^(?!.*-(sources|javadoc)\.jar$).*\.jar$/;
  const artifact = build.artifacts.find((candidate) => pattern.test(candidate.fileName));
  if (!artifact) {
    const names = build.artifacts.map((candidate) => candidate.fileName).join(', ') || 'none';
    fail(`No artifact of ${job} matches ${pattern} (build ${build.number} has: ${names})`);
  }
  return {
    key: plugin.key,
    platform,
    name: artifact.fileName,
    // The build number, not lastSuccessfulBuild: the URL then keeps meaning the same jar
    url: `${job}/${build.number}/artifact/${artifact.relativePath}`,
    version: `build-${build.number}`,
  };
}

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string; digest?: string | null }[];
}

async function resolveGithub(plugin: PluginConfig, platform: Platform): Promise<ResolvedPlugin> {
  const repo = plugin.repo ?? fail(`Plugin "${plugin.key}" needs repo = "owner/name"`);
  // Anonymous API calls are limited to 60 per hour; a token lifts that
  const token = process.env.GITHUB_TOKEN;
  const release = await getJson<GithubRelease>(
    `https://api.github.com/repos/${repo}/releases/latest`,
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  const pattern = plugin.asset_pattern ? new RegExp(plugin.asset_pattern) : /^(?!.*-(sources|javadoc)\.jar$).*\.jar$/;
  const asset = release.assets.find((candidate) => pattern.test(candidate.name));
  if (!asset) {
    const names = release.assets.map((candidate) => candidate.name).join(', ') || 'none';
    fail(`No asset of ${repo} ${release.tag_name} matches ${pattern} (it has: ${names})`);
  }
  return {
    key: plugin.key,
    platform,
    name: asset.name,
    url: asset.browser_download_url,
    sha256: asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : undefined,
    version: release.tag_name,
  };
}

/** Resolves one plugin for one platform. `local` plugins are handled by the caller. */
export async function resolvePlugin(
  plugin: PluginConfig,
  platform: Platform,
  minecraft: string,
): Promise<ResolvedPlugin> {
  if (plugin.source === 'modrinth') {
    return resolveModrinth(plugin, platform, minecraft);
  }
  if (plugin.source === 'jenkins') {
    return resolveJenkins(plugin, platform);
  }
  if (plugin.source === 'github') {
    return resolveGithub(plugin, platform);
  }
  const url = plugin.urls?.[platform] ?? plugin.url;
  if (!url) {
    fail(`Plugin "${plugin.key}" has no url for ${platform}`);
  }
  return { key: plugin.key, platform, name: `${plugin.key}.jar`, url, version: 'url' };
}

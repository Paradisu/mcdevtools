import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse } from 'smol-toml';
import { CONFIG_DIR, ROOT, deepMerge, fail } from './util.ts';

/**
 * Plugin/template family: paper = the Bukkit-family backends (Purpur and other Paper forks), velocity = the
 * proxy, limbo = the standalone Limbo server. Plugins target a family (`platforms = ["paper"]`), templates live in
 * `plugins/<key>/<family>/`. A family is not an instance type (see platforms/).
 */
export type Platform = 'paper' | 'velocity' | 'limbo';

export interface JavaConfig {
  enhanced_redefinition: boolean;
  hotswap_agent: boolean;
  /** HotswapAgent plugins to load besides the ones the project's libraries need (see hotswap.ts) */
  hotswap_plugins: string[];
  extra_flags: string[];
}

/** One server process: a proxy, a backend or a standalone server. Keys not listed here are kept in `extra`. */
export interface InstanceConfig {
  name: string;
  /** A registered platform type: purpur, velocity, limbo (see platforms/) */
  type: string;
  enabled: boolean;
  /** The network this instance belongs to; absent = standalone */
  network?: string;
  port: number;
  /** Port clients use when it differs from `port` (for example when MCDEV_PROXY_PORT remaps it) */
  public_port?: number;
  debug_port: number;
  memory: string;
  /** "auto" derives it (see [versions]) or a version of this platform */
  version: string;
  /** "auto" = latest build, or a build id to pin exactly */
  build: string;
  first_start_commands: string[];
  /** Backends: listed in the proxy's `try` order */
  try?: boolean;
  world_preset?: 'redstone_ready' | 'void' | 'default';
  /** Every other key of the table; extensions read their own settings from here */
  extra: Record<string, unknown>;
}

export type ForwardingMode = 'auto' | 'modern' | 'legacy' | 'none';

/** A set of proxies and the backends they route to; instances without a network are standalone. */
export interface NetworkConfig {
  name: string;
  forwarding: ForwardingMode;
  /** Defaults to the top-level online_mode */
  online_mode?: boolean;
}

export interface BuildArtifact {
  /** Relative to the project root */
  path: string;
  /** Plugin families the artifact is installed on */
  platforms: Platform[];
}

/** The project's own build: run before `start`, and its artifacts are copied into matching instances. */
export interface BuildConfig {
  /** e.g. ["./gradlew", "-q", "shadowJar"]; empty = nothing to build */
  command: string[];
  artifacts: BuildArtifact[];
}

export interface VersionsConfig {
  /** "auto" reads it from the catalog (see auto), or a Minecraft version */
  minecraft: string;
  auto: {
    /** Gradle version catalog the "auto" versions come from, relative to the project root */
    catalog: string;
    /** Catalog version key whose "<mc>.build.N" value gives the Minecraft version */
    minecraft_from: string;
    /** Catalog version key of velocity-api (the Velocity version, with -SNAPSHOT) */
    velocity_from: string;
  };
}

export interface MigrationsConfig {
  /** A registered migration provider (liquibase is built in) */
  tool: string;
  /** Directory that changelog paths resolve against, relative to the project root */
  search_path: string;
  /** Master changelog, relative to search_path */
  changelog: string;
  /** SQL seeds named after changelog ids, relative to .mcdevtools */
  seed_dir: string;
}

export interface DbConfig {
  kind: 'postgres';
  /** The first one is the main database; `db reset --all` also recreates the rest, and profiles dump all of them */
  databases: string[];
  /** `start` waits for the database before launching anything */
  required: boolean;
  migrations?: MigrationsConfig;
}

export interface PluginConfig {
  key: string;
  /** modrinth | url | jenkins | github | local, or a source registered by an extension */
  source: string;
  platforms: Platform[];
  slug?: string;
  version?: string;
  allow_prerelease?: boolean;
  game_version_fallback?: string[];
  url?: string;
  /** jenkins: job URL, e.g. https://ci.example.com/job/My%20Job */
  job_url?: string;
  /** jenkins: regex for the artifact file name (default: any jar except sources/javadoc) */
  artifact_pattern?: string;
  /** github: owner/name; the latest release is used */
  repo?: string;
  /** github: regex for the release asset name (default: any jar except sources/javadoc) */
  asset_pattern?: string;
  urls?: Partial<Record<Platform, string>>;
  path?: string;
  config_dir?: Partial<Record<Platform, string>>;
  /** An exact artifact per platform, written by profile imports; setup downloads it instead of resolving the latest */
  pinned?: Partial<Record<Platform, PinnedArtifact>>;
}

export interface PinnedArtifact {
  url: string;
  sha256: string;
  version: string;
  /** A jar shipped inside a profile, relative to the repository root; used instead of `url` */
  file?: string;
}

export interface UiConfig {
  /** Layout `mcdev ui` opens: network | tabs | the name of a file in dev/layouts or dev/layouts.local */
  default_layout: string;
  /** Name of the zellij session */
  session: string;
}

export interface WebConfig {
  port: number;
  /** 127.0.0.1 = plain HTTP, reachable through port forwarding; anything else needs TLS (a self-signed certificate is generated) */
  bind: string;
}

/** An instance name (a proxy or standalone server) or `web` */
export type ShareTarget = string;

export interface ShareConfig {
  /** Tunnel service: a name from `mcdev share providers` */
  provider: string;
  /** Targets `mcdev share start` opens when none are named */
  targets: ShareTarget[];
  /** Renew this long before a provider's tunnel limit so the switch happens on our schedule */
  renew_before_seconds: number;
  /** PROXY protocol sent to the proxy so Velocity sees real player addresses; "off" keeps direct connections working while sharing */
  proxy_protocol: 'off' | 'v1' | 'v2';
  /** Per-provider options: [share.providers.<name>] */
  providers: Record<string, Record<string, unknown>>;
}

export interface CaptureConfig {
  /** Install the capture plugin (devtools/capture) on every instance */
  enabled: boolean;
  /** Dump compression, 1 (fast) to 9 (small); runs on a background thread */
  gzip_level: number;
  /** Default per-instance cap on captured (uncompressed) bytes, e.g. "512M" */
  max_size: string;
  /** Packets buffered for the writer; when full, packets are dropped and counted instead of blocking the server */
  queue_capacity: number;
}

export interface DevConfig {
  /** Config schema version; see migrations/ */
  format: number;
  accept_eula: boolean;
  /** Overrides the DataVersion detected from the server jar (for generated items) */
  data_version?: number;
  /** Address clients use to reach this machine; proxies tell players to transfer to it */
  public_host: string;
  online_mode: boolean;
  /** Extension entry points, relative to .mcdevtools or package names resolvable from the project root */
  extensions: string[];
  versions: VersionsConfig;
  build: BuildConfig;
  java: JavaConfig;
  db?: DbConfig;
  redis: { enabled: boolean };
  networks: NetworkConfig[];
  instances: InstanceConfig[];
  ui: UiConfig;
  web: WebConfig;
  share: ShareConfig;
  capture: CaptureConfig;
  plugins: PluginConfig[];
}

export interface DbEnv {
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
}

export interface Env {
  db: DbEnv;
  redisHost: string;
}

let defaultDatabase = 'mcdev';

/** Connection settings: MCDEV_DB_* / MCDEV_REDIS_HOST, defaulting to localhost and the main database's name. */
export function env(): Env {
  const e = process.env;
  return {
    db: {
      host: e.MCDEV_DB_HOST ?? 'localhost',
      port: e.MCDEV_DB_PORT ?? '5432',
      name: e.MCDEV_DB_NAME ?? defaultDatabase,
      user: e.MCDEV_DB_USER ?? defaultDatabase,
      password: e.MCDEV_DB_PASSWORD ?? defaultDatabase,
    },
    redisHost: e.MCDEV_REDIS_HOST ?? 'localhost',
  };
}

/** Values used for everything a project does not set. */
function defaults(): Record<string, unknown> {
  return {
    format: 1,
    accept_eula: false,
    public_host: 'localhost',
    online_mode: true,
    extensions: [],
    versions: { minecraft: 'auto', auto: { catalog: 'gradle/libs.versions.toml', minecraft_from: 'paper-api', velocity_from: 'velocity-api' } },
    build: { command: [], artifacts: [] },
    java: { enhanced_redefinition: true, hotswap_agent: true, hotswap_plugins: [], extra_flags: [] },
    redis: { enabled: false },
    networks: [],
    instances: [],
    ui: { default_layout: 'network', session: basename(ROOT) },
    web: { port: 8082, bind: '127.0.0.1' },
    share: { provider: 'pinggy', targets: [], renew_before_seconds: 30, proxy_protocol: 'off', providers: {} },
    capture: { enabled: false, gzip_level: 3, max_size: '512M', queue_capacity: 65536 },
    plugins: [],
  };
}

const LISTS: Record<string, string> = { instances: 'name', networks: 'name', plugins: 'key' };
const INSTANCE_KEYS = new Set([
  'name', 'type', 'enabled', 'network', 'port', 'public_port', 'debug_port', 'memory', 'version', 'build',
  'first_start_commands', 'try', 'world_preset',
]);

/** Fills instance defaults and moves unknown keys into `extra`. */
function normalizeInstance(raw: Record<string, unknown>): InstanceConfig {
  const known: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) (INSTANCE_KEYS.has(key) ? known : extra)[key] = value;
  return {
    enabled: true,
    memory: '1G',
    version: 'auto',
    build: 'auto',
    first_start_commands: [],
    ...known,
    extra,
  } as unknown as InstanceConfig;
}

/** Loads .mcdevtools/config.toml and deep-merges .mcdevtools/config.local.toml (gitignored) on top. */
export async function loadConfig(): Promise<DevConfig> {
  const basePath = join(CONFIG_DIR, 'config.toml');
  const localPath = join(CONFIG_DIR, 'config.local.toml');
  if (!existsSync(basePath)) {
    fail(`No .mcdevtools/config.toml in ${ROOT}. Run \`npx github:Paradisu/mcdevtools init\` to set the project up.`);
  }
  let merged = parse(await readFile(basePath, 'utf8')) as Record<string, unknown>;
  if (existsSync(localPath)) {
    const local = parse(await readFile(localPath, 'utf8')) as Record<string, unknown>;
    merged = mergeNamedLists(merged, local, Object.keys(LISTS));
    merged = deepMerge(merged, withoutKeys(local, Object.keys(LISTS)));
  }
  const config = deepMerge(defaults(), merged) as unknown as DevConfig;
  config.instances = ((merged.instances as Record<string, unknown>[] | undefined) ?? []).map(normalizeInstance);
  config.networks = ((merged.networks as Partial<NetworkConfig>[] | undefined) ?? []).map((network) => ({ forwarding: 'auto', ...network }) as NetworkConfig);
  config.plugins = (merged.plugins as PluginConfig[] | undefined) ?? [];
  if (config.db) {
    config.db = { kind: 'postgres', required: true, ...(config.db as Partial<DbConfig>) } as DbConfig;
    defaultDatabase = config.db.databases[0] ?? defaultDatabase;
  }
  return config;
}

function withoutKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
}

/**
 * Arrays of tables ([[instances]], [[networks]], [[plugins]]) are merged by their name/key so a local file can
 * flip `enabled` on one instance without restating it; entries that do not exist in the base are appended.
 */
function mergeNamedLists(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  lists: string[],
): Record<string, unknown> {
  const result = { ...base };
  for (const list of lists) {
    const overrides = local[list] as Record<string, unknown>[] | undefined;
    if (!overrides) {
      continue;
    }
    const idKey = LISTS[list] ?? 'name';
    const merged = [...((base[list] as Record<string, unknown>[] | undefined) ?? [])];
    for (const override of overrides) {
      const index = merged.findIndex((entry) => entry[idKey] === override[idKey]);
      if (index === -1) {
        merged.push(override);
      } else {
        merged[index] = deepMerge(merged[index]!, override);
      }
    }
    result[list] = merged;
  }
  return result;
}

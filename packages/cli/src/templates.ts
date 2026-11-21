import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { type DevConfig, type Env, type InstanceConfig, type NetworkConfig, type Platform, env } from './config.ts';
import { type PlatformDef, configDirOf, platformOf } from './platforms/index.ts';
import { networkOf, proxiesOf, resolveForwarding, serversOf, varName } from './topology.ts';
import { shareAddresses, shareProxyProtocol } from './share/state.ts';
import { CORE_TEMPLATES, ROOT, RUN, TEMPLATES, TEMPLATES_LOCAL, render } from './util.ts';

export interface Instance {
  /** The instance name from the config; also its directory under run/ */
  name: string;
  /** Plugin family of its platform (paper, velocity, limbo) */
  platform: Platform;
  def: PlatformDef;
  config: InstanceConfig;
  dir: string;
  port: number;
  debugPort: number;
  memory: string;
  firstStartCommands: string[];
  enabled: boolean;
  network?: NetworkConfig;
}

export function instancesOf(config: DevConfig): Instance[] {
  return config.instances
    .map<Instance>((entry) => {
      const def = platformOf(entry.type);
      return {
        name: entry.name,
        platform: def.family,
        def,
        config: entry,
        dir: join(RUN, entry.name),
        port: entry.port,
        debugPort: entry.debug_port,
        memory: entry.memory,
        firstStartCommands: entry.first_start_commands,
        enabled: entry.enabled,
        network: networkOf(config, entry),
      };
    })
    .sort((a, b) => a.def.startOrder - b.def.startOrder);
}

/** Directory of each layer's templates that applies to a plugin family */
const BASE_TEMPLATE: Record<Platform, string[]> = {
  velocity: ['proxy'],
  paper: ['vanilla', 'paper-common'],
  limbo: ['limbo'],
  bungee: ['bungee'],
  viaproxy: ['viaproxy'],
  fabric: ['vanilla'],
  forge: ['vanilla'],
  neoforge: ['vanilla'],
  sponge: ['vanilla'],
};

const WORLD_PRESETS = {
  redstone_ready: {
    levelType: 'minecraft\\:flat',
    generatorSettings:
      '{"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:stone","height":3},{"block":"minecraft:sandstone","height":116}],"biome":"minecraft:desert","structure_overrides":[]}',
  },
  void: {
    levelType: 'minecraft\\:flat',
    generatorSettings: '{"layers":[{"block":"minecraft:air","height":1}],"biome":"minecraft:the_void","structure_overrides":[]}',
  },
  default: { levelType: 'minecraft\\:normal', generatorSettings: '' },
} as const;

/** The network's forwarding secret, generated on first use and shared by its proxy and backends. */
async function forwardingSecret(network: string): Promise<{ secret: string; file: string }> {
  const file = join(RUN, 'networks', network, 'forwarding.secret');
  if (existsSync(file)) {
    return { secret: (await readFile(file, 'utf8')).trim(), file };
  }
  const secret = randomBytes(24).toString('base64url');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, secret);
  return { secret, file };
}

export type TemplateVarProvider = (
  config: DevConfig,
  instance: Instance,
  base: Record<string, string>,
) => Record<string, string> | Promise<Record<string, string>>;

const varProviders: TemplateVarProvider[] = [];

/** Adds variables to every template (extensions call this through `api.registerTemplateVars`); later providers win. */
export function registerTemplateVars(provider: TemplateVarProvider): void {
  varProviders.push(provider);
}

/**
 * Variables available to every template as ${NAME}: this instance (SERVER_NAME, SERVER_PORT, PROXY_PORT), its
 * network (ONLINE_MODE, FORWARDING_*, VELOCITY_*), the database, and PUBLIC_HOST_<NAME> / PUBLIC_PORT_<NAME> of every
 * instance (a live `mcdev share` tunnel replaces the configured public address).
 */
export async function templateVars(config: DevConfig, instance: Instance): Promise<Record<string, string>> {
  const e: Env = env();
  const preset = WORLD_PRESETS[instance.config.world_preset ?? 'default'];
  const network = instance.network;
  const velocityServers = network ? serversOf(config, network.name) : [];
  const velocityTry = velocityServers.filter((server) => server.try);
  const proxy = network ? proxiesOf(config, network.name)[0] : undefined;
  const forwarding = network ? await forwardingSecret(network.name) : { secret: '', file: '' };
  const forwardingMode = network ? resolveForwarding(config, network) : 'none';
  const shared = shareAddresses();
  const publicAddresses: Record<string, string> = {};
  for (const other of config.instances) {
    publicAddresses[`PUBLIC_HOST_${varName(other.name)}`] = shared[other.name]?.host ?? config.public_host;
    publicAddresses[`PUBLIC_PORT_${varName(other.name)}`] = String(shared[other.name]?.port ?? other.public_port ?? other.port);
  }
  const vars: Record<string, string> = {
    ...publicAddresses,
    PROXY_PORT: String(instance.def.role === 'proxy' ? instance.port : (proxy?.port ?? '')),
    HAPROXY_PROTOCOL: String(shareProxyProtocol(instance.name)),
    PUBLIC_HOST: config.public_host,
    PROJECT_NAME: basename(ROOT),
    SERVER_NAME: instance.name,
    SERVER_PORT: String(instance.port),
    ONLINE_MODE: String(network?.online_mode ?? config.online_mode),
    FORWARDING_MODE: forwardingMode,
    VELOCITY_ENABLED: String(forwardingMode === 'modern'),
    BUNGEECORD_ENABLED: String(forwardingMode === 'legacy'),
    FORWARDING_SECRET: forwarding.secret,
    FORWARDING_SECRET_FILE: forwarding.file,
    DB_HOST: e.db.host,
    DB_NAME: e.db.name,
    DB_USER: e.db.user,
    DB_PASSWORD: e.db.password,
    DB_URL: `jdbc:postgresql://${e.db.host}:${e.db.port}/${e.db.name}`,
    REDIS_HOST: e.redisHost,
    LEVEL_TYPE: preset.levelType,
    GENERATOR_SETTINGS: preset.generatorSettings,
    VELOCITY_SERVERS: velocityServers.map((server) => `${server.name} = "127.0.0.1:${server.port}"`).join('\n'),
    VELOCITY_TRY: `[${velocityTry.map((server) => `"${server.name}"`).join(', ')}]`,
    BUNGEE_SERVERS: velocityServers.map((server) => `  ${server.name}:\n    motd: ${server.name}\n    address: 127.0.0.1:${server.port}\n    restricted: false`).join('\n'),
    BUNGEE_PRIORITIES: `[${(velocityTry.length > 0 ? velocityTry : velocityServers).map((server) => server.name).join(', ')}]`,
  };
  for (const provider of varProviders) Object.assign(vars, await provider(config, instance, vars));
  return vars;
}

async function overlay(from: string, to: string, vars: Record<string, string>): Promise<void> {
  if (!existsSync(from)) {
    return;
  }
  for (const entry of await readdir(from, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const source = join(entry.parentPath, entry.name);
    const relative = source.slice(from.length + 1);
    const dest = join(to, relative);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, render(await readFile(source, 'utf8'), vars));
  }
}

/**
 * Renders the preset configs into the instance directory, always overwriting: base platform template,
 * then servers/<name>, then each installed plugin's preset. Files no template names are never touched.
 */
export async function applyTemplates(
  config: DevConfig,
  instance: Instance,
  installedPlugins: string[],
): Promise<void> {
  const vars = await templateVars(config, instance);
  const bases = BASE_TEMPLATE[instance.platform];
  // Layers, later ones win: templates shipped with mcdevtools, the project's (.mcdevtools/templates), then
  // personal overrides (.mcdevtools/templates.local, exported by profiles). Each has the same layout.
  for (const layer of [CORE_TEMPLATES, TEMPLATES, TEMPLATES_LOCAL]) {
    for (const base of bases) await overlay(join(layer, base), instance.dir, vars);
    await overlay(join(layer, 'servers', instance.name), instance.dir, vars);
    for (const key of installedPlugins) {
      const plugin = config.plugins.find((candidate) => candidate.key === key);
      const folder = plugin?.config_dir?.[instance.platform] ?? key;
      await overlay(join(layer, 'plugins', key, instance.platform), join(instance.dir, configDirOf(instance.def), folder), vars);
    }
  }
}

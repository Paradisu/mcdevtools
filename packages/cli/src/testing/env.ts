import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureProtocol, protocolDir } from '../capture/protocol.ts';
import { controlSocket } from '../capture/paths.ts';
import type { DevConfig } from '../config.ts';
import { readResolved } from '../downloads.ts';
import { logFile } from '../instances.ts';
import { dotDir, isRunning, socketPath } from '../supervisor.ts';
import { type Instance, instancesOf } from '../templates.ts';
import { resolveForwarding } from '../topology.ts';
import { CACHE, CONFIG_DIR, RUN, ROOT, TOOL_ROOT } from '../util.ts';

/**
 * The test environment: everything a test or a bot needs to know about the running network, in one JSON document
 * (`.mcdevtools/run/.test/env.json`) that the Java testkit reads. The format is versioned like the other formats of
 * this tool: the Java side (`TestEnvironment.FORMAT`) rejects a version it does not know.
 */
export const ENV_FORMAT = 1;

export interface TestEnvInstance {
  name: string;
  type: string;
  family: string;
  /** `proxy`, `backend` (member of a network) or `standalone` */
  role: 'proxy' | 'backend' | 'standalone';
  network: string | null;
  host: string;
  port: number;
  running: boolean;
  consoleSocket: string;
  captureSocket: string | null;
  testSocket: string | null;
  logFile: string;
  consoleLog: string;
  /** Whether the instance authenticates players with Mojang: only a proxy (or standalone server) can */
  onlineMode: boolean;
  forwarding: 'modern' | 'legacy' | 'none';
  forwardingSecretFile: string | null;
}

export interface TestEnv {
  format: number;
  project: string;
  configDir: string;
  mcdev: string;
  minecraftVersion: string;
  protocolVersion: number;
  protocolFile: string;
  publicHost: string;
  resultsDir: string;
  accountsDir: string;
  test: { capture: string; export: string[]; logFailPatterns: string[]; logIgnorePatterns: string[] };
  instances: TestEnvInstance[];
}

/** Where `writeTestEnv` puts the file. */
export const ENV_FILE = join(RUN, '.test', 'env.json');

export const RESULTS_DIR = join(CONFIG_DIR, 'test-results');

function describe(config: DevConfig, instance: Instance): TestEnvInstance {
  const network = instance.network;
  const isProxy = instance.def.role === 'proxy';
  const forwarding = network ? resolveForwarding(config, network) : 'none';
  const secret = network ? join(RUN, 'networks', network.name, 'forwarding.secret') : undefined;
  return {
    name: instance.name,
    type: instance.config.type,
    family: instance.platform,
    role: isProxy ? 'proxy' : network ? 'backend' : 'standalone',
    network: network?.name ?? null,
    host: '127.0.0.1',
    port: instance.port,
    running: isRunning(instance),
    consoleSocket: socketPath(instance),
    captureSocket: config.capture.enabled && instance.def.capture ? controlSocket(instance) : null,
    testSocket: config.test.in_game && instance.platform === 'paper' ? socketPath(instance, '-test') : null,
    logFile: logFile(instance) ?? join(instance.dir, 'logs', 'latest.log'),
    consoleLog: join(dotDir(instance), 'console.log'),
    onlineMode: isProxy ? (network?.online_mode ?? config.online_mode) : false,
    forwarding: forwarding === 'modern' || forwarding === 'legacy' ? forwarding : 'none',
    forwardingSecretFile: secret && existsSync(secret) && forwarding !== 'none' ? secret : null,
  };
}

/** Describes the network as it is right now (what is running, where). Generates the protocol table when missing. */
export async function testEnv(config: DevConfig): Promise<TestEnv> {
  const table = await ensureProtocol(config);
  const resolved = await readResolved();
  return {
    format: ENV_FORMAT,
    project: ROOT,
    configDir: CONFIG_DIR,
    mcdev: join(TOOL_ROOT, 'bin', 'mcdev'),
    minecraftVersion: resolved.minecraft,
    protocolVersion: table.protocolVersion,
    protocolFile: join(protocolDir(resolved.minecraft), 'protocol.json'),
    publicHost: config.public_host,
    resultsDir: RESULTS_DIR,
    accountsDir: join(CACHE, 'accounts'),
    test: {
      capture: config.test.capture,
      export: config.test.export,
      logFailPatterns: config.test.log_fail_patterns,
      logIgnorePatterns: config.test.log_ignore_patterns,
    },
    instances: instancesOf(config)
      .filter((instance) => instance.enabled)
      .map((instance) => describe(config, instance)),
  };
}

/** Writes env.json and returns its path. */
export async function writeTestEnv(config: DevConfig): Promise<string> {
  const env = await testEnv(config);
  await mkdir(join(RUN, '.test'), { recursive: true });
  await writeFile(ENV_FILE, `${JSON.stringify(env, null, 2)}\n`);
  return ENV_FILE;
}

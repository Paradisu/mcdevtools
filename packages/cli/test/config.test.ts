import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'smol-toml';

// The project is resolved when util.ts is first imported, so point it at a temp project first
const project = mkdtempSync(join(tmpdir(), 'mcdev-config-'));
process.env.MCDEV_PROJECT = project;
mkdirSync(join(project, '.mcdevtools'), { recursive: true });

const { loadConfig } = await import('../src/config.ts');
const { validateTopology } = await import('../src/topology.ts');
const { convertLegacyConfig } = await import('../src/legacy-config.ts');

/** smol-toml tables have no prototype; compare plain objects */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const write = (name: string, text: string) => writeFileSync(join(project, '.mcdevtools', name), text);

const BASE = `
[[networks]]
name = "main"

[[instances]]
name = "proxy"
type = "velocity"
network = "main"
port = 25565
debug_port = 5005

[[instances]]
name = "lobby"
type = "purpur"
network = "main"
port = 30066
debug_port = 5006
try = true
context = { warp = "w" }
`;

test('loadConfig applies defaults, normalizes instances and keeps unknown keys in extra', async () => {
  write('config.toml', BASE);
  const config = await loadConfig();
  assert.equal(config.format, 1);
  assert.equal(config.public_host, 'localhost');
  assert.equal(config.networks[0]!.forwarding, 'auto');
  const lobby = config.instances.find((i) => i.name === 'lobby')!;
  assert.equal(lobby.enabled, true);
  assert.equal(lobby.version, 'auto');
  assert.equal(lobby.memory, '1G');
  assert.deepEqual(plain(lobby.extra), { context: { warp: 'w' } });
  assert.equal(config.db, undefined);
});

test('config.local.toml merges instances by name and appends new ones', async () => {
  write('config.toml', BASE);
  write(
    'config.local.toml',
    `accept_eula = true\n[[instances]]\nname = "lobby"\nenabled = false\n[[instances]]\nname = "extra"\ntype = "limbo"\nport = 30000\ndebug_port = 5008\n`,
  );
  const config = await loadConfig();
  assert.equal(config.accept_eula, true);
  assert.equal(config.instances.length, 3);
  const lobby = config.instances.find((i) => i.name === 'lobby')!;
  assert.equal(lobby.enabled, false);
  assert.equal(lobby.port, 30066, 'untouched keys survive the merge');
  validateTopology(config);
  writeFileSync(join(project, '.mcdevtools', 'config.local.toml'), '');
});

test('validateTopology names the offending instance', async () => {
  const config = async (extra: string) => {
    write('config.toml', BASE + extra);
    return loadConfig();
  };
  validateTopology(await config(''));
  for (const [extra, message] of [
    ['[[instances]]\nname = "lobby"\ntype = "purpur"\nport = 1\ndebug_port = 2\n', /Duplicate instance name "lobby"/],
    ['[[instances]]\nname = "x"\ntype = "nope"\nport = 1\ndebug_port = 2\n', /Unknown instance type "nope"/],
    ['[[instances]]\nname = "x"\ntype = "purpur"\nnetwork = "ghost"\nport = 1\ndebug_port = 2\n', /network "ghost"/],
    ['[[instances]]\nname = "p2"\ntype = "velocity"\nport = 1\ndebug_port = 2\n', /Proxy "p2" needs a network/],
    ['[[instances]]\nname = "x"\ntype = "purpur"\nport = 30066\ndebug_port = 2\n', /Port 30066 is used by both/],
    ['[[instances]]\nname = "bad name"\ntype = "purpur"\nport = 1\ndebug_port = 2\n', /Invalid instance name/],
  ] as const) {
    const loaded = await config(extra);
    assert.throws(() => validateTopology(loaded), message);
  }
});

test('the real pre-extraction Paradisu config converts to instances in one network', () => {
  const old = parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-paradisu-dev.toml'), 'utf8')) as Record<string, unknown>;
  const { config, notes } = convertLegacyConfig(old);
  const instances = config.instances as { name: string; type: string; network?: string; context?: unknown }[];
  assert.deepEqual(instances.map((i) => [i.name, i.type, i.network]), [
    ['proxy', 'velocity', 'main'],
    ['limbo', 'limbo', undefined],
    ['lobby', 'purpur', 'main'],
    ['creative', 'purpur', 'main'],
  ]);
  assert.deepEqual(plain(instances[2]!.context), { server: 'lobby', warp: 'paradisu', inventory: 'paradisu' });
  assert.deepEqual(plain(config.networks), [{ name: 'main', forwarding: 'modern' }]);
  assert.ok(config.java && !('jvm' in config));
  assert.deepEqual(notes, []);
});

test('legacy conversion of partial override files pins builds and notes what it cannot place', () => {
  const pinned = convertLegacyConfig({
    purpur_build: '2500',
    velocity_version: '3.4.0-SNAPSHOT',
    proxy: { port: 25577 },
    servers: [{ name: 'lobby', port: 1, debug_port: 2 }],
  });
  const instances = pinned.config.instances as { name: string; build?: string; version?: string }[];
  assert.equal(instances.find((i) => i.name === 'lobby')!.build, '2500');
  assert.equal(instances.find((i) => i.name === 'proxy')!.version, '3.4.0-SNAPSHOT');
  const loose = convertLegacyConfig({ limbo_version: '1.2.3' });
  assert.match(loose.notes[0]!, /limbo_version/);
});

test('a network may have several proxies, each with its own port and the same servers and secret', async () => {
  write('config.toml', BASE + '[[instances]]\nname = "proxy2"\ntype = "velocity"\nnetwork = "main"\nport = 25566\ndebug_port = 5015\n');
  const config = await loadConfig();
  validateTopology(config);
  const { instancesOf, templateVars } = await import('../src/templates.ts');
  const { proxiesOf, serversOf } = await import('../src/topology.ts');
  assert.deepEqual(proxiesOf(config, 'main').map((i) => i.name), ['proxy', 'proxy2']);
  assert.deepEqual(serversOf(config, 'main').map((i) => i.name), ['lobby']);
  const [first, second] = ['proxy', 'proxy2'].map((name) => instancesOf(config).find((i) => i.name === name)!);
  const a = await templateVars(config, first!);
  const b = await templateVars(config, second!);
  assert.equal(a.PROXY_PORT, '25565');
  assert.equal(b.PROXY_PORT, '25566');
  assert.equal(a.FORWARDING_SECRET, b.FORWARDING_SECRET, 'one secret per network');
  assert.equal(a.VELOCITY_SERVERS, b.VELOCITY_SERVERS);
  assert.match(a.VELOCITY_SERVERS!, /lobby = "127\.0\.0\.1:30066"/);
});

test('paper-fork resolves a local jar to a file URL and a URL as it is; it needs a jar', async () => {
  const { platformOf } = await import('../src/platforms/index.ts');
  const def = platformOf('paper-fork');
  const ctx = {} as never;
  const base = { name: 'fork', type: 'paper-fork', version: 'auto', build: 'auto', extra: {} } as never;
  await assert.rejects(() => def.resolve(ctx, base), /needs jar/);
  const local = await def.resolve(ctx, { ...(base as object), extra: { jar: 'libs/fork.jar' } } as never);
  assert.equal(local.name, 'fork.jar');
  assert.match(local.url, /^file:\/\/\/.*libs\/fork\.jar$/);
  assert.equal(local.version, 'custom');
  const remote = await def.resolve(ctx, { ...(base as object), version: '1.2', extra: { jar: 'https://example.org/x/fork-1.2.jar' } } as never);
  assert.deepEqual([remote.name, remote.url, remote.version], ['fork-1.2.jar', 'https://example.org/x/fork-1.2.jar', '1.2']);
  assert.equal(def.cacheName(remote), 'fork-1.2-fork-1.2.jar');
});

test('java specs resolve to sdkman candidates, absolute paths or the PATH java', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcdev-sdk-'));
  process.env.SDKMAN_DIR = dir;
  const { javaBinOf, javaSpec, ensureJava, installCommand, javaMajor } = await import('../src/jdk.ts');
  assert.equal(javaBinOf(undefined), 'java');
  assert.equal(javaBinOf('21.0.8-tem'), join(dir, 'candidates', 'java', '21.0.8-tem', 'bin', 'java'));
  assert.equal(javaBinOf('/opt/jdk17'), '/opt/jdk17/bin/java');
  assert.equal(javaBinOf('/opt/jdk17/bin/java'), '/opt/jdk17/bin/java');

  const config = await loadConfig();
  config.java.defaults = { purpur: '17.0.1-tem' };
  const [lobby] = config.instances.filter((i) => i.name === 'lobby');
  assert.equal(javaSpec(config, lobby!), '17.0.1-tem', 'the per-type default applies');
  assert.equal(javaSpec(config, { ...lobby!, java: '8.0.1-zulu' }), '8.0.1-zulu', 'the instance wins');

  assert.equal(await ensureJava(undefined, 'fail'), 'java');
  await assert.rejects(() => ensureJava('21.0.8-tem', 'fail'), /sdkman is not available/);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(join(dir, 'bin', 'sdkman-init.sh'), '');
  await assert.rejects(() => ensureJava('21.0.8-tem', 'fail'), /not installed\. Run: sdk install java 21\.0\.8-tem/);
  await assert.rejects(() => ensureJava('21; rm -rf /', 'fail'), /neither an absolute path nor a sdkman candidate id/);
  await assert.rejects(() => ensureJava('/nope/jdk', 'fail'), /does not exist/);
  assert.deepEqual(installCommand('21.0.8-tem').slice(-2), ['_', '21.0.8-tem'], 'the id is an argument, not part of the script');
  assert.match(installCommand('21.0.8-tem')[2]!, /sdkman_auto_answer=false && printf "n\\n" \| sdk install/, 'it must not become the default JDK');

  // A fake java that prints a version like the real one does, on stderr
  const fake = join(dir, 'candidates', 'java', '17.0.1-tem', 'bin');
  mkdirSync(fake, { recursive: true });
  writeFileSync(join(fake, 'java'), '#!/bin/sh\necho \'openjdk version "17.0.1" 2021-10-19\' >&2\n', { mode: 0o755 });
  assert.equal(await ensureJava('17.0.1-tem', 'fail'), join(fake, 'java'));
  assert.equal(javaMajor(join(fake, 'java')), 17);
  assert.equal(javaMajor('/definitely/not/java'), undefined);
});

test('restoreDefault removes a default sdkman created and puts back one it changed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcdev-sdk-default-'));
  process.env.SDKMAN_DIR = dir;
  const { readDefault, restoreDefault } = await import('../src/jdk.ts');
  const java = join(dir, 'candidates', 'java');
  mkdirSync(java, { recursive: true });
  const { symlinkSync } = await import('node:fs');
  assert.equal(readDefault(), undefined);
  symlinkSync(join(java, '21'), join(java, 'current'));
  restoreDefault(undefined);
  assert.equal(readDefault(), undefined, 'a default that did not exist before is removed');
  symlinkSync(join(java, '17'), join(java, 'current'));
  restoreDefault(join(java, '17'));
  assert.equal(readDefault(), join(java, '17'), 'an unchanged default is left alone');
  restoreDefault(join(java, '8'));
  assert.equal(readDefault(), join(java, '8'), 'a changed default is put back');
});

test('forwarding resolves to the best mode every member supports', async () => {
  const { resolveForwarding } = await import('../src/topology.ts');
  const net = (extra: string, forwarding = 'auto') =>
    `[[networks]]\nname = "main"\nforwarding = "${forwarding}"\n` + extra;
  const inst = (name: string, type: string, port: number, network = 'main') =>
    `[[instances]]\nname = "${name}"\ntype = "${type}"\nnetwork = "${network}"\nport = ${port}\ndebug_port = ${port + 1000}\n`;
  const load = async (text: string) => {
    write('config.toml', text);
    const config = await loadConfig();
    return { config, mode: () => resolveForwarding(config, config.networks[0]!) };
  };
  assert.equal((await load(net(inst('p', 'velocity', 1) + inst('b', 'purpur', 2)))).mode(), 'modern');
  assert.equal((await load(net(inst('p', 'waterfall', 1) + inst('b', 'purpur', 2)))).mode(), 'legacy');
  assert.equal((await load(net(inst('p', 'velocity', 1) + inst('b', 'fabric', 2)))).mode(), 'none');
  assert.equal((await load(net(inst('p', 'velocity', 1) + inst('b', 'fabric', 2) + inst('v', 'viaproxy', 3)))).mode(), 'none');
  // ViaProxy takes no part in forwarding
  assert.equal((await load(net(inst('p', 'velocity', 1) + inst('b', 'purpur', 2) + inst('v', 'viaproxy', 3)))).mode(), 'modern');
  const bad = await load(net(inst('p', 'velocity', 1) + inst('b', 'fabric', 2), 'modern'));
  assert.throws(() => bad.mode(), /not supported by b \(fabric\)/);
  assert.throws(() => validateTopology(bad.config), /not supported by b \(fabric\)/);
});

test('template variables follow the resolved forwarding mode and render a BungeeCord server list', async () => {
  const { instancesOf, templateVars } = await import('../src/templates.ts');
  write('config.toml', '[[networks]]\nname = "main"\n[[instances]]\nname = "p"\ntype = "waterfall"\nnetwork = "main"\nport = 25565\ndebug_port = 5005\n[[instances]]\nname = "lobby"\ntype = "purpur"\nnetwork = "main"\nport = 30066\ndebug_port = 5006\ntry = true\n');
  const config = await loadConfig();
  const vars = await templateVars(config, instancesOf(config).find((i) => i.name === 'lobby')!);
  assert.equal(vars.FORWARDING_MODE, 'legacy');
  assert.equal(vars.VELOCITY_ENABLED, 'false');
  assert.equal(vars.BUNGEECORD_ENABLED, 'true');
  assert.match(vars.BUNGEE_SERVERS!, /^  lobby:\n    motd: lobby\n    address: 127\.0\.0\.1:30066/);
  assert.equal(vars.BUNGEE_PRIORITIES, '[lobby]');
});

test('ViaProxy arguments find their target and the modded platforms use mods/', async () => {
  const { viaProxyArgs } = await import('../src/platforms/proxies.ts');
  const { pluginsDirOf, configDirOf, capturableOf, platformOf } = await import('../src/platforms/index.ts');
  write('config.toml', '[[networks]]\nname = "main"\n[[instances]]\nname = "p"\ntype = "velocity"\nnetwork = "main"\nport = 25565\ndebug_port = 5005\n[[instances]]\nname = "via"\ntype = "viaproxy"\nnetwork = "main"\nport = 25570\ndebug_port = 5006\ntarget_version = "1.8"\n');
  const config = await loadConfig();
  const via = config.instances.find((i) => i.name === 'via')!;
  assert.deepEqual(viaProxyArgs(config.instances, via), ['cli', '--bind-address', '0.0.0.0:25570', '--target-address', '127.0.0.1:25565', '--auth-method', 'NONE', '--target-version', '1.8']);
  assert.throws(() => viaProxyArgs(config.instances, { ...via, extra: { target: 'ghost' } }), /not an instance/);
  assert.equal(pluginsDirOf(platformOf('fabric')), 'mods');
  assert.equal(configDirOf(platformOf('forge')), 'config');
  assert.equal(pluginsDirOf(platformOf('purpur')), 'plugins');
  assert.equal(capturableOf(platformOf('neoforge')), false);
  assert.equal(capturableOf(platformOf('folia')), true);
});

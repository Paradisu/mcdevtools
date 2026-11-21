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
    ['[[instances]]\nname = "p2"\ntype = "velocity"\nnetwork = "main"\nport = 1\ndebug_port = 2\n', /more than one proxy/],
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

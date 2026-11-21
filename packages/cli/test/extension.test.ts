import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

const project = join(import.meta.dirname, 'fixtures', 'extension-project');
process.env.MCDEV_PROJECT = project;

const { loadConfig } = await import('../src/config.ts');
const { loadExtensions, resolveExtensionEntry } = await import('../src/extension/load.ts');
const { platformOf } = await import('../src/platforms/index.ts');
const { templateVars } = await import('../src/templates.ts');
const { usage } = await import('../src/help.ts');

test('an extension registers commands, help sections, platforms and template variables', async () => {
  const config = await loadConfig();
  config.extensions = ['extensions/demo'];
  const commands: { name: string }[] = [];
  const loaded = await loadExtensions(config, (command) => commands.push(command));
  assert.deepEqual(loaded, ['demo']);
  assert.deepEqual(commands.map((c) => c.name), ['demo hello']);
  assert.equal(platformOf('demo-server').label, 'Demo');
  assert.match(usage(commands as never), /Demo/);

  const instance = { name: 'x', platform: 'paper', def: platformOf('demo-server'), config: { world_preset: 'default', extra: {} }, dir: '/tmp/x', port: 1, debugPort: 2, memory: '1G', firstStartCommands: [], enabled: true } as never;
  const vars = await templateVars(config, instance);
  assert.equal(vars.DEMO, 'hi', 'settings() reads the [demo] table');
});

test('an extension that cannot be found fails with its name and where it looked', async () => {
  const config = await loadConfig();
  config.extensions = ['missing-extension'];
  await assert.rejects(() => loadExtensions(config, () => {}), /Extension "missing-extension" .*failed to load: Extension "missing-extension" not found/);
});

test('entries resolve from package.json exports', () => {
  const entry = resolveExtensionEntry('extensions/demo', project, join(project, '.mcdevtools'));
  assert.ok(entry.endsWith(join('extensions', 'demo', 'src', 'index.ts')));
});

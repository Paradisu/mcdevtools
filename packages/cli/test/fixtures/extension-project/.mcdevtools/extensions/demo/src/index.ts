import { defineExtension } from '../../../../../../../src/extension/index.ts';

export default defineExtension({
  name: 'demo',
  setup(api) {
    api.registerCommand({ name: 'demo hello', usage: '', summary: 'Say hello', run: () => {} });
    api.registerHelpSection('Demo', ['demo']);
    api.registerTemplateVars(() => ({ DEMO: String(api.settings().greeting ?? 'none') }));
    api.registerPlatform({
      type: 'demo-server',
      label: 'Demo',
      family: 'paper',
      role: 'server',
      startOrder: 20,
      resolve: async () => ({ name: 'demo.jar', url: 'https://example.invalid/demo.jar', version: '1' }),
      cacheName: (artifact) => artifact.name,
      needsEula: false,
      terminalFlags: true,
      nogui: true,
      stopCommand: 'stop',
      readyPattern: /Done/,
      timestampedLogs: false,
      waitForPort: false,
      hotswap: false,
      worlds: true,
      installsProjectArtifacts: true,
    });
    api.on('afterSetup', () => {});
  },
});

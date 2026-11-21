import { defineExtension } from '@mcdevtools/cli/extension';

export default defineExtension({
  name: '{{NAME}}',
  setup(api) {
    api.registerCommand({
      name: '{{NAME}} hello',
      usage: '',
      summary: 'Say hello from the {{NAME}} extension',
      run: ({ config }) => {
        console.log(`Hello from {{NAME}}: ${config.instances.length} instance(s) configured`);
      },
    });
    api.registerHelpSection('{{NAME}}', ['{{NAME}}']);
  },
});

import { parseArgs } from 'node:util';
import type { Command } from '../command.ts';
import { ensureTestkit } from '../java.ts';
import { keyValue, next } from '../output.ts';
import { capture, fail, log } from '../util.ts';
import { testEnv, writeTestEnv } from './env.ts';
import { MANUAL_COMMANDS } from './manual-run.ts';
import { RUN_COMMANDS } from './run.ts';

/** `mcdev test`: the integration test environment, runs, results and reviews. */
export const TEST_COMMANDS: Command[] = [
  {
    name: 'test env',
    usage: '',
    summary: 'Describe the running network for tests',
    details: 'Prints the test environment that the Java testkit reads (instances, ports, sockets, logs, online mode) and writes it to .mcdevtools/run/.test/env.json.',
    options: [{ flag: '--json', summary: 'Print the environment as JSON only (what the testkit reads from an IDE)' }],
    run: async ({ config }, args) => {
      const { values } = parseArgs({ args, options: { json: { type: 'boolean' } } });
      const env = await testEnv(config);
      if (values.json) {
        console.log(JSON.stringify(env));
        return;
      }
      const file = await writeTestEnv(config);
      log(
        keyValue([
          ['minecraft', `${env.minecraftVersion} (protocol ${env.protocolVersion})`],
          ['file', file],
          ['instances', env.instances.map((i) => `${i.name}${i.running ? '' : ' (stopped)'}`).join(', ')],
        ]),
      );
      next('mcdev test run', 'mcdev bot start <name>');
    },
  },
  {
    name: 'test doctor',
    usage: '',
    summary: 'Check bots can join after a Minecraft update',
    details:
      'Checks that the bundled protocol library (MCProtocolLib) matches the server\'s Minecraft version and that a bot can join every ' +
      'running instance. Run it first after bumping Minecraft, Paper or Velocity.',
    run: async ({ config }) => {
      const bin = ensureTestkit();
      const file = await writeTestEnv(config);
      const result = capture(bin, ['doctor', '--env', file]);
      process.stdout.write(result.stdout);
      if (result.stderr.trim()) process.stderr.write(result.stderr);
      if (result.status !== 0) {
        fail('Some checks failed.');
      }
    },
  },
  ...RUN_COMMANDS,
  ...MANUAL_COMMANDS,
];

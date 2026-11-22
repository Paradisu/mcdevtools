import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Command } from '../command.ts';
import { newCaptureId } from '../capture/store.ts';
import type { DevConfig } from '../config.ts';
import * as instances from '../instances.ts';
import { dim, next } from '../output.ts';
import { isRunning } from '../supervisor.ts';
import { fail, log, sleep } from '../util.ts';
import { clearGameTestRun, gametestFlags, registerGameTestRun } from './gametest-state.ts';
import { parseJunit } from './junit.ts';
import { TEST_STATE } from './paths.ts';
import { type RunSummary, type TestRecord, runDir, summaryTable, totalsLine, totalsOf } from './results.ts';
import { writeSummary } from './run.ts';

/**
 * `mcdev test gametest <instance>`: runs a loader instance's GameTests (Minecraft's built-in test framework) and
 * reads the JUnit report the loader writes. The instance is a dedicated one (usually `enabled = false` in the config,
 * so a normal `mcdev start` leaves it alone): it starts, runs its tests, writes the report and stops itself.
 */
async function gametestCommand({ config }: { config: DevConfig }, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { selector: { type: 'string' }, timeout: { type: 'string' }, 'no-build': { type: 'boolean' } },
    allowPositionals: true,
  });
  const name = positionals[0] ?? fail('Which instance? `mcdev test gametest <instance>` (a Fabric instance with the GameTests of your mod)');
  const instance = instances.select(config, [name])[0]!;
  const report = join(TEST_STATE, `gametest-${name}.xml`);
  // Fails for a platform that is not wired, before anything is started
  gametestFlags(instance.def.type, { report, selector: values.selector });
  if (isRunning(instance)) {
    fail(`${name} is running; a GameTest run starts the instance itself. Stop it first with \`mcdev stop ${name}\`.`);
  }
  const timeout = Number(values.timeout ?? 600);
  await mkdir(TEST_STATE, { recursive: true });
  await rm(report, { force: true });

  const startedAt = Date.now();
  registerGameTestRun(name, { report, selector: values.selector });
  try {
    log(dim(`Running the GameTests of ${name}${values.selector ? ` (${values.selector})` : ''}`));
    // The server may stop itself before `start` sees it ready; what matters is the report
    await instances.start(config, [name], values['no-build'] ?? false, config.accept_eula).catch((error: Error) => {
      if (isRunning(instance) || !existsSync(report)) throw error;
    });
    const deadline = Date.now() + timeout * 1000;
    while (isRunning(instance) && Date.now() < deadline) await sleep(1000);
    if (isRunning(instance)) {
      await instances.stop(config, [name]);
      fail(`${name} was still running after ${timeout} s; stopped it. Raise --timeout if the tests are slow.`);
    }
  } finally {
    clearGameTestRun(name);
  }
  if (!existsSync(report)) {
    fail(`${name} stopped without writing a GameTest report (${report}). See \`mcdev logs ${name}\`: is the GameTest API and your mod's tests installed?`);
  }
  const cases = parseJunit(readFileSync(report, 'utf8'));
  const runId = newCaptureId(`gametest-${name}`);
  const summary: RunSummary = {
    format: 1,
    runId,
    kind: 'junit',
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    command: ['mcdev', 'test', 'gametest', name, ...(values.selector ? ['--selector', values.selector] : [])],
    totals: totalsOf(cases),
    tests: cases.map<TestRecord>((test) => ({ ...test })),
  };
  await writeSummary(summary);
  log('');
  if (cases.length > 0) log(summaryTable(summary));
  log(totalsLine(summary));
  log(`Results: ${runDir(runId)}/summary.json`);
  next(`mcdev test results ${runId}`);
  if (cases.length === 0) fail('The report has no tests; does the filter match any GameTest?');
  if (summary.totals.failed > 0) fail(`${summary.totals.failed} game test(s) failed.`);
}

export const GAMETEST_COMMANDS: Command[] = [
  {
    name: 'test gametest',
    usage: '<instance>',
    summary: 'Run a loader instance\'s GameTests and report them',
    details:
      'For a Fabric instance with GameTests (the GameTest API and your mod): starts it with the loader\'s GameTest flags, waits for it to ' +
      'finish, and reads the JUnit report it wrote. Give the instance `enabled = false` so a normal `mcdev start` skips it. On Paper and ' +
      'other servers run `/test` from a JUnit test with GameTests.run(...) instead.',
    options: [
      { flag: '--selector <filter>', summary: 'Only tests matching the loader\'s filter' },
      { flag: '--timeout <seconds>', summary: 'How long to wait for the run (default 600)' },
      { flag: '--no-build', summary: 'Skip building the project jar' },
    ],
    run: ({ config }, args) => gametestCommand({ config }, args),
  },
];

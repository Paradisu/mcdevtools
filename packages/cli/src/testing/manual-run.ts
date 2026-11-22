import { writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import type { Command } from '../command.ts';
import { EXPORTERS } from '../capture/exporters/index.ts';
import { newCaptureId } from '../capture/store.ts';
import type { DevConfig } from '../config.ts';
import * as instances from '../instances.ts';
import { dim, green, next, red, streamRow, table, yellow } from '../output.ts';
import { runLine } from '../supervisor.ts';
import { TOOL_ROOT, capture, fail, log, warn } from '../util.ts';
import { type TestEnvInstance, testEnv } from './env.ts';
import { type TestCase, writeJunit } from './junit.ts';
import { loadSuites, writeSuitesFile } from './manual.ts';
import { RESULTS_DIR } from './paths.ts';
import { type RunSummary, type TestRecord, runDir, summaryTable, totalsLine, totalsOf } from './results.ts';
import { writeSummary } from './run.ts';

/**
 * `mcdev manual`: drives the in-game runner (java/testkit-paper) from the terminal. The tester plays; the runner
 * shows each test with PASS / FAIL / SKIP / REDO buttons; this command records one packet capture of the whole run
 * (so it can be replayed in Flashback or ReplayMod), prints the verdicts as they come in, and writes the same
 * summary and JUnit report an automated run does.
 */

interface RunnerEvent {
  t: string;
  [key: string]: unknown;
}

/** Runs `mcdev` itself (capture start/stop/export); the capture commands are the single owner of that logic. */
function mcdev(args: string[]): { ok: boolean; json?: Record<string, unknown>; error: string } {
  const result = capture(join(TOOL_ROOT, 'bin', 'mcdev'), [...args, '--no-input']);
  const start = result.stdout.indexOf('{');
  let json: Record<string, unknown> | undefined;
  if (result.status === 0 && start >= 0) {
    try {
      json = JSON.parse(result.stdout.slice(start)) as Record<string, unknown>;
    } catch {
      json = undefined;
    }
  }
  return { ok: result.status === 0, json, error: (result.stderr || result.stdout).trim().split('\n').pop() ?? '' };
}

/** Whether a player is on a backend now, asked of its console. */
async function playerOnline(config: DevConfig, instance: string, player: string): Promise<boolean> {
  const target = instances.select(config, [instance])[0]!;
  const reply = await runLine(target, 'list', 1500);
  return reply.output.toLowerCase().includes(player.toLowerCase());
}

async function listCommand({ config }: { config: DevConfig }): Promise<void> {
  const suites = await loadSuites(config);
  if (suites.length === 0) {
    log(`No manual suites. Add .mcdevtools/${config.test.manual_dir}/<suite>.toml (see docs/testing.md).`);
    return;
  }
  const rows = suites.flatMap((suite) => suite.tests.map((test) => [suite.name, test.id, test.title]));
  log(table(['suite', 'test', 'title'], rows));
  next('mcdev manual run <suite> --player <name>');
}

async function runCommand({ config }: { config: DevConfig }, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { test: { type: 'string' }, player: { type: 'string' }, on: { type: 'string' }, capture: { type: 'string' }, export: { type: 'string' } },
    allowPositionals: true,
  });
  const suiteName = positionals[0] ?? fail('Which suite? `mcdev manual run <suite> --player <name>` (see `mcdev manual list`)');
  const player = values.player ?? fail('Who tests? Pass --player <name>: the player that joins and clicks the buttons');
  const mode = values.capture ?? config.test.capture;
  if (!['always', 'on-failure', 'never'].includes(mode)) fail('--capture must be always, on-failure or never');
  const formats = values.export?.split(',').filter(Boolean) ?? config.test.export;
  for (const format of formats) if (!EXPORTERS[format]) fail(`Unknown export format "${format}"; see \`mcdev capture formats\``);

  const suites = await loadSuites(config);
  const suite = suites.find((candidate) => candidate.name === suiteName) ?? fail(`No manual suite "${suiteName}"; known: ${suites.map((s) => s.name).join(', ') || '(none)'}`);
  const ids = values.test?.split(',').filter(Boolean) ?? [];
  for (const id of ids) if (!suite.tests.some((t) => t.id === id)) fail(`Suite ${suiteName} has no test "${id}"`);
  await writeSuitesFile(config);

  const env = await testEnv(config);
  const runners = env.instances.filter((i) => i.running && i.testSocket);
  const wanted = values.on ?? suite.on;
  const host: TestEnvInstance | undefined = wanted ? runners.find((i) => i.name === wanted) : runners[0];
  if (!host) {
    fail(
      wanted
        ? `${wanted} is not running with the in-game runner. Set [test] in_game = true in .mcdevtools/config.toml and \`mcdev restart ${wanted}\`.`
        : 'No running instance has the in-game runner. Set [test] in_game = true in .mcdevtools/config.toml and restart the Paper instances.',
    );
  }

  // One capture for the whole run, of the backend and its proxies, so the replay covers every test in order
  const runId = newCaptureId(`manual-${suiteName}`);
  const online = await playerOnline(config, host.name, player).catch(() => false);
  const captureOn = env.instances.filter((i) => i.running && i.captureSocket && (i.name === host.name || (i.network !== null && i.network === host.network && i.role === 'proxy')));
  let captureId: string | undefined;
  if (mode !== 'never' && captureOn.length > 0) {
    const started = mcdev(['capture', 'start', '--json', '--label', `manual-${suiteName}`, '--on', captureOn.map((i) => i.name).join(','), '--player', player, ...(online ? [] : ['--next-join'])]);
    if (started.ok) {
      captureId = started.json?.id as string;
      if (online) warn(`${player} is already on ${host.name}: the replay starts mid-session and may not open in a replay viewer. For a full replay, leave and rejoin after the run starts.`);
    } else {
      warn(`Packet capture did not start: ${started.error}`);
    }
  }

  log(`Running ${suiteName} on ${host.name}${online ? '' : `; waiting for ${player} to join`}. Click the buttons in chat (or /mcdevtest pass|fail|skip|redo).`);
  const events = await converse(host.testSocket!, { cmd: 'run', runId, suite: suiteName, tests: ids, player });

  const cases: TestCase[] = events
    .filter((event) => event.t === 'verdict')
    .map((event) => ({
      className: suiteName,
      name: String(event.test),
      seconds: Number(event.durationMs ?? 0) / 1000,
      result: event.result === 'pass' ? 'passed' : event.result === 'fail' ? 'failed' : 'skipped',
      message: event.note ? String(event.note) : undefined,
    }));

  let replay: string[] = [];
  let kept: string | undefined;
  if (captureId) {
    mcdev(['capture', 'stop', '--on', captureOn.map((i) => i.name).join(',')]);
    const failed = cases.some((c) => c.result === 'failed');
    if (mode === 'always' || failed) {
      kept = captureId;
      for (const format of formats) {
        const exported = mcdev(['capture', 'export', captureId, '--format', format, '--json', '--player', player]);
        if (exported.ok) replay.push(...((exported.json?.files as string[] | undefined) ?? []));
        else warn(`Export ${format} failed: ${exported.error}`);
      }
    } else {
      mcdev(['capture', 'rm', captureId, '--yes']);
    }
  }

  const startedAt = Date.now();
  const tests: TestRecord[] = cases.map((test) => ({
    ...test,
    info: {
      status: test.result,
      failure: test.message,
      capture: kept ? { id: kept, exports: replay } : undefined,
    },
  }));
  const summary: RunSummary = {
    format: 1,
    runId,
    kind: 'manual',
    startedAt: new Date(startedAt).toISOString(),
    durationMs: cases.reduce((sum, c) => sum + c.seconds * 1000, 0),
    command: ['mcdev', 'manual', 'run', suiteName],
    totals: totalsOf(cases),
    tests,
  };
  await mkdir(runDir(runId), { recursive: true });
  await writeSummary(summary);
  writeFileSync(join(runDir(runId), `manual-${suiteName}.xml`), writeJunit(`manual.${suiteName}`, cases, summary.durationMs / 1000));

  log('');
  if (cases.length > 0) log(summaryTable(summary));
  log(totalsLine(summary));
  log(`Results: ${RESULTS_DIR.replace(`${process.cwd()}/`, '')}/${runId}/summary.json`);
  for (const file of replay) log(`replay: ${file}`);
  if (events.some((event) => event.t === 'aborted')) warn('The run was ended before every test had a verdict.');
  next(`mcdev test results ${runId}`);
  if (summary.totals.failed > 0) fail(`${summary.totals.failed} manual test(s) failed.`);
}

/** Sends one request to the runner and prints and returns its events until the run is over. */
function converse(socketFile: string, request: Record<string, unknown>): Promise<RunnerEvent[]> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketFile);
    const collected: RunnerEvent[] = [];
    const row = streamRow([{ min: 7 }, { min: 24 }, {}]);
    const abort = (): void => {
      socket.write(`${JSON.stringify({ cmd: 'abort', player: request.player })}\n`);
    };
    process.once('SIGINT', abort);
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('error', (error) => reject(new Error(`Cannot reach the in-game runner at ${socketFile}: ${error.message}. Is the instance running with [test] in_game = true?`)));
    socket.on('close', () => {
      process.off('SIGINT', abort);
      resolve(collected);
    });
    createInterface({ input: socket }).on('line', (line) => {
      let event: RunnerEvent;
      try {
        event = JSON.parse(line) as RunnerEvent;
      } catch {
        return;
      }
      collected.push(event);
      switch (event.t) {
        case 'error':
          socket.destroy();
          reject(new Error(String(event.message)));
          break;
        case 'waiting':
          log(dim(`waiting for ${event.player} to join`));
          break;
        case 'begin':
          log(dim(`test ${event.index}/${event.total}: ${event.test} - ${event.title}`));
          break;
        case 'verdict': {
          const word = event.result === 'pass' ? green('pass') : event.result === 'fail' ? red('fail') : yellow('skip');
          log(row([word, String(event.test), event.note ? String(event.note) : '']));
          break;
        }
        case 'aborted':
          log(dim(`ended: ${event.reason}`));
          break;
        default:
      }
    });
  });
}

export const MANUAL_COMMANDS: Command[] = [
  {
    name: 'manual list',
    usage: '',
    summary: 'List the manual test suites',
    run: ({ config }) => listCommand({ config }),
  },
  {
    name: 'manual run',
    usage: '<suite>',
    summary: 'Run a manual suite with a player in game',
    details:
      'The in-game runner (set [test] in_game = true and restart the Paper instances) shows each test to --player in chat with ' +
      'PASS / FAIL / SKIP / REDO buttons, running the test\'s setup and cleanup commands. One packet capture covers the run; it is kept ' +
      'and exported for replay when a test fails or with --capture always. Ctrl-C ends the run and keeps the verdicts so far.',
    options: [
      { flag: '--player <name>', summary: 'The tester (required); the run starts when they join' },
      { flag: '--test <ids>', summary: 'Only these tests, comma-separated' },
      { flag: '--on <instance>', summary: 'The instance with the runner (default: the suite\'s `on`, else the first)' },
      { flag: '--capture <mode>', summary: 'always, on-failure or never (default: [test] capture)' },
      { flag: '--export <formats>', summary: 'Capture export formats, comma-separated' },
    ],
    run: ({ config }, args) => runCommand({ config }, args),
  },
];


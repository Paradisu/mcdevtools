import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import type { Command } from '../command.ts';
import { EXPORTERS } from '../capture/exporters/index.ts';
import { newCaptureId } from '../capture/store.ts';
import type { DevConfig } from '../config.ts';
import * as instances from '../instances.ts';
import { dim, keyValue, next, red, step } from '../output.ts';
import { isRunning } from '../supervisor.ts';
import { instancesOf } from '../templates.ts';
import { ROOT, fail, log, warn } from '../util.ts';
import { ENV_FILE, writeTestEnv } from './env.ts';
import { parseJunit, type TestCase } from './junit.ts';
import {
  type ArtifactInfo,
  type RunSummary,
  type TestRecord,
  artifactsOf,
  describeTest,
  listRuns,
  loadSummary,
  readInfo,
  runDir,
  summaryTable,
  totalsLine,
  totalsOf,
} from './results.ts';

/** Directories never searched for reports. */
const SKIP = new Set(['node_modules', '.git', '.gradle', '.idea', '.mcdevtools']);

/** Turns a report glob (`**` any depth, `*` within a segment) into a regex over project-relative paths. */
export function globToRegex(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (c === '*') {
      source += '[^/]*';
    } else {
      source += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** Folders under the project that match the report glob. */
export function findReportDirs(root: string, glob: string): string[] {
  const matcher = globToRegex(glob);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (matcher.test(relative(root, path))) found.push(path);
      walk(path);
    }
  };
  walk(root);
  return found;
}

/** The test cases of every JUnit XML written at or after `since` in the matching folders. */
export function collectReports(root: string, glob: string, since: number): TestCase[] {
  const cases: TestCase[] = [];
  for (const dir of findReportDirs(root, glob)) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.xml'))) {
      const path = join(dir, file);
      if (statSync(path).mtimeMs < since) continue;
      cases.push(...parseJunit(readFileSync(path, 'utf8')));
    }
  }
  return cases;
}

function recordOf(runId: string, test: TestCase): TestRecord {
  const artifacts = artifactsOf(runId, test);
  return { ...test, artifacts, info: readInfo(artifacts) };
}

/** Builds and writes `summary.json` for a finished run. */
export async function writeSummary(summary: RunSummary): Promise<void> {
  await mkdir(runDir(summary.runId), { recursive: true });
  writeFileSync(join(runDir(summary.runId), 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
}

async function runCommand(ctx: { config: DevConfig }, args: string[]): Promise<void> {
  const { config } = ctx;
  const { values } = parseArgs({
    args,
    options: { tests: { type: 'string' }, capture: { type: 'string' }, export: { type: 'string' }, 'no-start': { type: 'boolean' } },
  });
  if (values.capture && !['always', 'on-failure', 'never'].includes(values.capture)) {
    fail('--capture must be always, on-failure or never');
  }
  const formats = values.export?.split(',').filter(Boolean);
  for (const format of formats ?? []) {
    if (!EXPORTERS[format]) fail(`Unknown export format "${format}"; see \`mcdev capture formats\``);
  }
  if (config.test.command.length === 0) {
    fail('[test] command is empty in .mcdevtools/config.toml');
  }

  const enabled = instancesOf(config).filter((instance) => instance.enabled);
  if (!enabled.some((instance) => isRunning(instance))) {
    if (values['no-start']) fail('No instance is running; start the network with `mcdev start` or drop --no-start');
    await instances.start(config, [], false, config.accept_eula);
  }

  await writeTestEnv(config);
  const runId = newCaptureId('test');
  const startedAt = Date.now();
  step(`Running tests (${runId})`);
  const [command, ...rest] = config.test.command;
  const commandArgs = [...rest, ...(values.tests ? ['--tests', values.tests] : [])];
  log(dim(`$ ${[command, ...commandArgs].join(' ')}`));
  const result = spawnSync(command!, commandArgs, {
    stdio: 'inherit',
    cwd: ROOT,
    env: {
      ...process.env,
      MCDEV_TEST_ENV: ENV_FILE,
      MCDEV_TEST_RUN_ID: runId,
      ...(values.capture ? { MCDEV_TEST_CAPTURE: values.capture } : {}),
      ...(formats ? { MCDEV_TEST_EXPORT: formats.join(',') } : {}),
    },
  });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);

  const cases = collectReports(ROOT, config.test.reports, startedAt - 2000);
  const summary: RunSummary = {
    format: 1,
    runId,
    kind: 'junit',
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    command: [command!, ...commandArgs],
    commandStatus: result.status ?? 1,
    totals: totalsOf(cases),
    tests: cases.map((test) => recordOf(runId, test)),
  };
  await writeSummary(summary);

  if (cases.length === 0) {
    warn(`No JUnit reports were found under "${config.test.reports}" (check [test] reports).`);
  } else {
    log('');
    log(summaryTable(summary));
    log('');
  }
  log(`${totalsLine(summary)}  ${dim(`(${(summary.durationMs / 1000).toFixed(1)}s)`)}`);
  log(`Results: ${relative(ROOT, runDir(runId))}/summary.json`);
  const pending = summary.tests.filter((t) => t.info?.review?.status === 'pending');
  if (pending.length > 0) {
    log('');
    log(`${pending.length} test(s) await a manual review:`);
    for (const t of pending) log(`  ${t.className}.${t.name}: ${t.info?.review?.note}`);
  }
  next(`mcdev test results ${runId}`, ...(pending.length ? ['mcdev test review'] : []));
  if (summary.totals.failed > 0 || (result.status ?? 1) !== 0) {
    fail(summary.totals.failed > 0 ? `${summary.totals.failed} test(s) failed.` : `${command} exited with status ${result.status}.`);
  }
  if (cases.length === 0) {
    fail('No tests ran.');
  }
}

function resultsCommand(args: string[]): void {
  const { values, positionals } = parseArgs({ args, options: { all: { type: 'boolean' }, json: { type: 'boolean' } }, allowPositionals: true });
  if (positionals.length === 0 && !values.json && listRuns().length > 1 && values.all) {
    for (const id of listRuns()) log(id);
    return;
  }
  let summary: RunSummary;
  try {
    summary = loadSummary(positionals[0] ?? 'latest');
  } catch (error) {
    return fail((error as Error).message);
  }
  if (values.json) {
    console.log(JSON.stringify(summary));
    return;
  }
  log(
    keyValue([
      ['run', summary.runId],
      ['kind', summary.kind],
      ['result', totalsLine(summary)],
      ['time', `${(summary.durationMs / 1000).toFixed(1)}s`],
    ]),
  );
  log('');
  log(summaryTable(summary));
  const shown = summary.tests.filter((t) => t.result === 'failed' || t.info?.review?.status === 'pending' || t.info?.review?.status === 'fail');
  for (const record of shown) {
    log('');
    const reviewed = record.info?.review;
    if (record.result !== 'failed' && reviewed) log(`${red('review')} ${reviewed.status}: ${reviewed.note}`);
    for (const line of describeTest(record)) log(line);
  }
  if (summary.tests.length === 0) log(dim('No tests were recorded in this run.'));
}

function reviewCommand(args: string[]): void {
  const { values, positionals } = parseArgs({ args, options: { note: { type: 'string' } }, allowPositionals: true });
  const verdicts = ['pass', 'fail'];
  let runId = 'latest';
  let test: string | undefined;
  let verdict: string | undefined;
  if (positionals.length >= 3) [runId, test, verdict] = positionals as [string, string, string];
  else if (positionals.length === 2 && verdicts.includes(positionals[1]!)) [test, verdict] = positionals as [string, string];
  else if (positionals.length >= 1) runId = positionals[0]!;
  let summary: RunSummary;
  try {
    summary = loadSummary(runId);
  } catch (error) {
    return fail((error as Error).message);
  }
  const pending = summary.tests.filter((t) => t.info?.review);
  if (!test || !verdict) {
    if (pending.length === 0) {
      log('No test in this run asks for a manual review.');
      return;
    }
    for (const t of pending) {
      const info = t.info!.review!;
      const id = `${t.className.split('.').pop()}#${t.name.replace(/\(.*$/, '')}`;
      log(`${info.status.padEnd(8)} ${id}  ${dim(info.note)}`);
      for (const file of t.info?.capture?.exports ?? []) log(`         replay: ${file}`);
    }
    next(`mcdev test review ${summary.runId} <Class#method> pass|fail --note "..."`);
    return;
  }
  if (!verdicts.includes(verdict)) fail('The verdict must be pass or fail');
  const target = pending.find((t) => `${t.className.split('.').pop()}#${t.name.replace(/\(.*$/, '')}` === test);
  if (!target?.artifacts) fail(`"${test}" is not a review test of run ${summary.runId}; run \`mcdev test review ${summary.runId}\``);
  const info: ArtifactInfo = readInfo(target.artifacts) ?? {};
  info.review = { ...(info.review ?? { note: '' }), status: verdict as 'pass' | 'fail', verdictNote: values.note } as NonNullable<ArtifactInfo['review']>;
  writeFileSync(join(target.artifacts, 'artifacts.json'), `${JSON.stringify(info, null, 2)}\n`);
  target.info = info;
  writeFileSync(join(runDir(summary.runId), 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  log(`Recorded ${verdict} for ${test}`);
  if (verdict === 'fail') process.exitCode = 1;
}

export const RUN_COMMANDS: Command[] = [
  {
    name: 'test run',
    usage: '',
    summary: 'Run the integration tests against the network',
    details:
      'Starts the network when nothing runs, runs the [test] command of the project config (Gradle by default) with the test environment ' +
      'in MCDEV_TEST_ENV, then reads the JUnit reports and writes .mcdevtools/test-results/<run>/summary.json. Failing tests keep their ' +
      'console and log excerpts, bot chat and packets, and a packet capture exported for replay. Exits 1 when a test fails.',
    options: [
      { flag: '--tests <pattern>', summary: 'Only tests matching a Gradle --tests pattern' },
      { flag: '--capture <mode>', summary: 'always, on-failure or never (default: [test] capture)' },
      { flag: '--export <formats>', summary: 'Capture export formats, comma-separated (see `mcdev capture formats`)' },
      { flag: '--no-start', summary: 'Fail instead of starting the network' },
    ],
    run: runCommand,
  },
  {
    name: 'test results',
    usage: '[run]',
    summary: 'Show the results of a test run',
    details: 'Defaults to the latest run. Failures list the message, log and console excerpts, the evidence folder and the capture exports.',
    options: [
      { flag: '--json', summary: 'Print summary.json' },
      { flag: '--all', summary: 'List run ids' },
    ],
    run: (_ctx, args) => resultsCommand(args),
  },
  {
    name: 'test review',
    usage: '[run] [Class#method pass|fail]',
    summary: 'List or record manual reviews of automated tests',
    details: 'Tests marked @ManualReview run with their capture kept and exported. Open the replay, then record the verdict here.',
    options: [{ flag: '--note <text>', summary: 'Why it passed or failed' }],
    run: (_ctx, args) => reviewCommand(args),
  },
];

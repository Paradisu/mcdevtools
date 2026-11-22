import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dim, green, red, status, table, yellow } from '../output.ts';
import { ROOT } from '../util.ts';
import { RESULTS_DIR } from './env.ts';
import type { TestCase } from './junit.ts';

/**
 * Test results as files: `.mcdevtools/test-results/<run>/summary.json` plus, for every JUnit test that used the
 * testkit extension, a folder `<Class>/<method>/` with console, log, chat and packet evidence and `artifacts.json`.
 * `mcdev test results` reads these; so can an LLM, straight from disk.
 */

export interface ArtifactInfo {
  status?: string;
  durationMs?: number;
  failure?: string;
  logErrors?: Record<string, string[]>;
  capture?: { id: string | null; exports: string[]; note?: string };
  review?: { status: 'pending' | 'pass' | 'fail'; note: string; verdictNote?: string };
}

export interface TestRecord extends TestCase {
  /** Folder with the evidence, when the test wrote one */
  artifacts?: string;
  info?: ArtifactInfo;
}

export interface RunSummary {
  format: 1;
  runId: string;
  kind: 'junit' | 'manual';
  startedAt: string;
  durationMs: number;
  command: string[];
  /** Exit status of the test command (junit runs) */
  commandStatus?: number;
  totals: { passed: number; failed: number; skipped: number };
  tests: TestRecord[];
}

export function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function runDir(runId: string): string {
  return join(RESULTS_DIR, runId);
}

/** The evidence folder of a JUnit test, if the testkit extension made one. */
export function artifactsOf(runId: string, test: TestCase): string | undefined {
  const simple = test.className.split('.').pop() ?? test.className;
  const method = test.name.replace(/\(.*$/, '');
  const dir = join(runDir(runId), safeName(simple), safeName(method));
  return existsSync(dir) ? dir : undefined;
}

export function readInfo(dir: string | undefined): ArtifactInfo | undefined {
  const file = dir ? join(dir, 'artifacts.json') : undefined;
  if (!file || !existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ArtifactInfo;
  } catch {
    return undefined;
  }
}

export function totalsOf(tests: TestCase[]): RunSummary['totals'] {
  return {
    passed: tests.filter((t) => t.result === 'passed').length,
    failed: tests.filter((t) => t.result === 'failed').length,
    skipped: tests.filter((t) => t.result === 'skipped').length,
  };
}

/** Runs, newest first (by folder time, so IDE runs named `local-...` sort with the rest). */
export function listRuns(): string[] {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((name) => existsSync(join(RESULTS_DIR, name, 'summary.json')))
    .sort((a, b) => statSync(join(RESULTS_DIR, b)).mtimeMs - statSync(join(RESULTS_DIR, a)).mtimeMs);
}

export function loadSummary(runId: string): RunSummary {
  const id = runId === 'latest' ? listRuns()[0] : listRuns().find((name) => name === runId || name.startsWith(runId));
  if (!id) throw new Error(runId === 'latest' ? 'There are no test runs yet. Run `mcdev test run`.' : `No test run "${runId}"`);
  return JSON.parse(readFileSync(join(RESULTS_DIR, id, 'summary.json'), 'utf8')) as RunSummary;
}

function resultWord(record: TestRecord): string {
  if (record.result === 'failed') return status('failed');
  if (record.result === 'skipped') return dim('skipped');
  return record.info?.review?.status === 'pending' ? yellow('review') : status('passed');
}

/** The table printed after a run. */
export function summaryTable(summary: RunSummary): string {
  const rows = summary.tests.map((t) => [
    t.className.split('.').pop() ?? t.className,
    t.name.replace(/\(\)$/, ''),
    resultWord(t),
    `${t.seconds.toFixed(1)}s`,
  ]);
  return table(['class', 'test', 'result', { header: 'time', align: 'right' }], rows);
}

export function totalsLine(summary: RunSummary): string {
  const { passed, failed, skipped } = summary.totals;
  const reviews = summary.tests.filter((t) => t.info?.review?.status === 'pending').length;
  return [
    green(`${passed} passed`),
    failed ? red(`${failed} failed`) : '0 failed',
    skipped ? `${skipped} skipped` : undefined,
    reviews ? yellow(`${reviews} awaiting review`) : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

function excerpt(file: string, lines: number): string[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8').trimEnd();
  return text ? text.split('\n').slice(0, lines) : [];
}

/** Everything about one failed (or pending-review) test: message, log and console excerpts, capture exports. */
export function describeTest(record: TestRecord, indent = '  '): string[] {
  const out: string[] = [];
  out.push(`${record.className}.${record.name}`);
  if (record.message) out.push(...record.message.split('\n').map((line) => `${indent}${line}`));
  for (const [instance, errors] of Object.entries(record.info?.logErrors ?? {})) {
    out.push(`${indent}log errors on ${instance}:`);
    for (const line of errors.slice(0, 6)) out.push(`${indent}  ${line}`);
  }
  if (record.artifacts) {
    for (const [label, prefix] of [['log', 'log-'], ['console', 'console-']] as const) {
      for (const file of readdirSync(record.artifacts).filter((name) => name.startsWith(prefix))) {
        const lines = excerpt(join(record.artifacts, file), 10);
        if (lines.length) out.push(`${indent}${label} (${file}):`, ...lines.map((l) => `${indent}  ${l}`));
      }
    }
    out.push(`${indent}evidence: ${record.artifacts.replace(`${ROOT}/`, '')}`);
  }
  for (const file of record.info?.capture?.exports ?? []) out.push(`${indent}replay: ${file}`);
  if (record.info?.capture?.id) out.push(`${indent}capture: ${record.info.capture.id}`);
  else if (record.info?.capture?.note) out.push(`${indent}capture: ${record.info.capture.note}`);
  return out;
}

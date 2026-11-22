import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import type { DevConfig } from '../config.ts';
import type { Instance } from '../templates.ts';
import { CONFIG_DIR, fail } from '../util.ts';
import { SUITES_FILE, TEST_STATE } from './paths.ts';

/**
 * Manual test suites: `.mcdevtools/<[test] manual_dir>/<suite>.toml` files that describe tests a person judges in
 * game. They are rendered to one JSON file for the runner plugin (java/testkit-paper), which reads it on every use.
 *
 * ```toml
 * title = "Warps"
 * on = "lobby"                      # optional: the instance whose runner is used
 * [[tests]]
 * id = "warp-menu"
 * title = "Warp menu teleports"
 * setup = ["lp user {player} permission set paradisu.warp true"]   # console commands, {player} = the tester
 * steps = ["Run /warps", "Click the first warp"]
 * expect = "You are teleported and see the arrival message"
 * cleanup = []
 * ```
 */

export interface ManualTest {
  id: string;
  title: string;
  setup: string[];
  steps: string[];
  expect: string;
  cleanup: string[];
}

export interface ManualSuite {
  name: string;
  title: string;
  on?: string;
  tests: ManualTest[];
}

/** The in-game runner is installed on Paper-family instances when `[test] in_game` is set. */
export function runnerWanted(config: DevConfig, instance: Instance): boolean {
  return config.test.in_game && instance.platform === 'paper';
}

function strings(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail(`${where} must be a list of strings`);
  }
  return value as string[];
}

/** Parses one suite file; fails with the file and test named. */
export function parseSuite(name: string, source: string, file = `${name}.toml`): ManualSuite {
  const raw = parse(source) as Record<string, unknown>;
  const tests = (raw.tests as Record<string, unknown>[] | undefined) ?? [];
  if (tests.length === 0) fail(`${file}: a suite needs at least one [[tests]] entry`);
  const seen = new Set<string>();
  return {
    name,
    title: typeof raw.title === 'string' ? raw.title : name,
    on: typeof raw.on === 'string' ? raw.on : undefined,
    tests: tests.map((test, i) => {
      const where = `${file}: test ${i + 1}`;
      const id = test.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(id)) fail(`${where}: id must be letters, digits, ., - or _`);
      if (seen.has(id)) fail(`${file}: duplicate test id "${id}"`);
      seen.add(id);
      if (typeof test.title !== 'string' || test.title === '') fail(`${where} (${id}): a title is required`);
      if (typeof test.expect !== 'string' || test.expect === '') fail(`${where} (${id}): what to expect is required`);
      const steps = strings(test.steps, `${where} (${id}) steps`);
      if (steps.length === 0) fail(`${where} (${id}): at least one step is required`);
      return {
        id,
        title: test.title,
        setup: strings(test.setup, `${where} (${id}) setup`),
        steps,
        expect: test.expect,
        cleanup: strings(test.cleanup, `${where} (${id}) cleanup`),
      };
    }),
  };
}

/** Every suite of the project. */
export async function loadSuites(config: DevConfig): Promise<ManualSuite[]> {
  const dir = join(CONFIG_DIR, config.test.manual_dir);
  if (!existsSync(dir)) return [];
  const suites: ManualSuite[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.toml')).sort()) {
    suites.push(parseSuite(file.slice(0, -'.toml'.length), await readFile(join(dir, file), 'utf8'), file));
  }
  return suites;
}

/** Renders the suites for the runner plugin and returns the file. Written even when there are none. */
export async function writeSuitesFile(config: DevConfig): Promise<string> {
  const suites = await loadSuites(config);
  await mkdir(TEST_STATE, { recursive: true });
  await writeFile(SUITES_FILE, `${JSON.stringify({ format: 1, suites }, null, 2)}\n`);
  return SUITES_FILE;
}

import { join } from 'node:path';
import { CONFIG_DIR, RUN } from '../util.ts';

/** Where the testkit keeps its files. Kept apart from env.ts so `instances.ts` can use them without an import cycle. */

/** `.mcdevtools/run/.test`: state of the bots, the environment file, the rendered manual suites */
export const TEST_STATE = join(RUN, '.test');

/** Test results (gitignored): one folder per run */
export const RESULTS_DIR = join(CONFIG_DIR, 'test-results');

/** The manual suites rendered as JSON for the in-game runner */
export const SUITES_FILE = join(TEST_STATE, 'manual-suites.json');

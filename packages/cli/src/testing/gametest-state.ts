import { fail } from '../util.ts';

/**
 * A GameTest run of a dedicated loader instance: `mcdev test gametest <instance>` registers it here, and
 * `instances.ts` adds the matching JVM flags when it launches that instance. Kept free of imports from
 * `instances.ts` so both can use it.
 */

export interface GameTestRun {
  /** The JUnit XML the loader writes */
  report: string;
  /** Test filter, loader specific */
  selector?: string;
}

const PENDING = new Map<string, GameTestRun>();

/**
 * JVM flags that make a loader run its GameTests at startup, write a JUnit report and stop. Fabric API documents
 * `fabric-api.gametest`, `fabric-api.gametest.report-file` and `fabric-api.gametest.filter`. NeoForge and Forge are not
 * wired up: their GameTest servers are started with program arguments and write no JUnit report.
 */
const FLAGS: Record<string, (run: GameTestRun) => string[]> = {
  fabric: (run) => [
    '-Dfabric-api.gametest',
    `-Dfabric-api.gametest.report-file=${run.report}`,
    ...(run.selector ? [`-Dfabric-api.gametest.filter=${run.selector}`] : []),
  ],
};

/** Platforms `mcdev test gametest` can drive. */
export function gametestPlatforms(): string[] {
  return Object.keys(FLAGS);
}

/** The flags for a platform type, or a failure that names what is supported. */
export function gametestFlags(platform: string, run: GameTestRun): string[] {
  const make = FLAGS[platform];
  if (!make) {
    fail(
      `GameTest runs are wired for ${gametestPlatforms().join(', ')} instances, not ${platform}. ` +
        'On Paper and other servers use GameTests.run(...) from a JUnit test to run `/test run` and read its failures.',
    );
  }
  return make(run);
}

export function registerGameTestRun(instance: string, run: GameTestRun): void {
  PENDING.set(instance, run);
}

export function clearGameTestRun(instance: string): void {
  PENDING.delete(instance);
}

/** The flags to add when launching `instance` (none unless a GameTest run was registered for it). */
export function pendingGameTestFlags(instance: string, platform: string): string[] {
  const run = PENDING.get(instance);
  return run ? gametestFlags(platform, run) : [];
}

import { accessSync, constants, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, TOOL_ROOT, capture, log, run, warn } from './util.ts';

/** mcdevtools' own Gradle build (capture agent and Limbo plugin, Liquibase runner); the project builds it through `java/gradlew`. */
export const JAVA_BUILD = join(TOOL_ROOT, 'java');

/** Name the capture jar gets in every instance's plugins/ (or mods/) folder */
export const CAPTURE_JAR_NAME = 'mcdevtools-capture.jar';
export const CAPTURE_JAR = join(JAVA_BUILD, 'capture', 'build', 'libs', CAPTURE_JAR_NAME);

/** The capture Java agent (shaded), for everything with netty */
export const CAPTURE_AGENT_JAR = join(JAVA_BUILD, 'capture-agent', 'build', 'libs', 'mcdevtools-capture-agent.jar');

export const LIQUIBASE_RUNNER = join(JAVA_BUILD, 'liquibase-runner', 'build', 'install', 'liquibase-runner', 'bin', 'liquibase-runner');

/** The testkit's launcher (bots, doctor), built on demand by `ensureTestkit()` */
export const TESTKIT_BIN = join(JAVA_BUILD, 'testkit', 'build', 'install', 'testkit', 'bin', 'testkit');

/** The in-game manual test runner, a Paper plugin installed into Paper-family instances when `[test] in_game` is set */
export const TESTKIT_PAPER_JAR_NAME = 'mcdevtools-testkit-paper.jar';
export const TESTKIT_PAPER_JAR = join(JAVA_BUILD, 'testkit-paper', 'build', 'libs', TESTKIT_PAPER_JAR_NAME);

/**
 * Gradle keeps per-project caches and lock files in `.gradle` directories inside the checkout, which devcontainers
 * mount as Docker volumes (see devcontainer/template). A volume created for a different user ID than the one running
 * now (the CLI renumbers the container user to the host's), or created by Docker as root for a path the image does
 * not know, is not writable, so Gradle fails to start. Fixes what it can with `sudo chown`.
 */
export function ensureGradleCachesWritable(): void {
  const candidates = [join(ROOT, '.gradle'), join(ROOT, 'build-logic', '.gradle'), join(JAVA_BUILD, '.gradle'), join(JAVA_BUILD, 'build-logic', '.gradle')];
  for (const dir of candidates) {
    if (!existsSync(dir)) {
      continue;
    }
    try {
      accessSync(dir, constants.W_OK);
    } catch {
      const owner = `${process.getuid?.()}:${process.getgid?.()}`;
      const result = capture('sudo', ['-n', 'chown', '-R', owner, dir]);
      const name = relative(ROOT, dir);
      if (result.status === 0) {
        log(`Fixed ownership of ${name} (it belonged to another user ID)`);
      } else {
        warn(`${name} is not writable and could not be fixed: ${result.stderr.trim()}. Remove the container's gradle volumes and reopen.`);
      }
    }
  }
}

/** Builds one or more tasks of mcdevtools' Gradle build, e.g. `:capture:jar`. */
export function gradle(tasks: string[]): void {
  ensureGradleCachesWritable();
  run(join(JAVA_BUILD, 'gradlew'), ['-p', JAVA_BUILD, '-q', ...tasks]);
}

/** Builds the testkit launcher and returns its path. */
export function ensureTestkit(): string {
  gradle([':testkit:installDist']);
  return TESTKIT_BIN;
}

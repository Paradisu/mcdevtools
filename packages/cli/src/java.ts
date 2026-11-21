import { join } from 'node:path';
import { TOOL_ROOT, run } from './util.ts';

/** mcdevtools' own Gradle build (capture plugin, Liquibase runner); the project builds it through `java/gradlew`. */
export const JAVA_BUILD = join(TOOL_ROOT, 'java');

/** Name the capture jar gets in every instance's plugins/ (or mods/) folder */
export const CAPTURE_JAR_NAME = 'mcdevtools-capture.jar';
export const CAPTURE_JAR = join(JAVA_BUILD, 'capture', 'build', 'libs', CAPTURE_JAR_NAME);

export const LIQUIBASE_RUNNER = join(JAVA_BUILD, 'liquibase-runner', 'build', 'install', 'liquibase-runner', 'bin', 'liquibase-runner');

/** Builds one or more tasks of mcdevtools' Gradle build, e.g. `:capture:jar`. */
export function gradle(tasks: string[]): void {
  run(join(JAVA_BUILD, 'gradlew'), ['-p', JAVA_BUILD, '-q', ...tasks]);
}

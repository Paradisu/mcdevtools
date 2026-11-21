import { existsSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { DevConfig, InstanceConfig } from './config.ts';
import { step } from './output.ts';
import { confirmAction } from './prompt.ts';
import { capture, fail, log } from './util.ts';

/** `java` of an instance: a sdkman candidate id (`21.0.8-tem`) or an absolute `JAVA_HOME` (or `java` binary). */
export function javaSpec(config: DevConfig, instance: InstanceConfig): string | undefined {
  return instance.java ?? config.java.defaults?.[instance.type];
}

export function sdkmanDir(): string {
  return process.env.SDKMAN_DIR ?? join(homedir(), '.sdkman');
}

/** The `java` binary a spec names; `java` (the one on the PATH) without a spec. */
export function javaBinOf(spec: string | undefined): string {
  if (!spec) {
    return 'java';
  }
  if (isAbsolute(spec)) {
    return spec.endsWith('/bin/java') ? spec : join(spec, 'bin', 'java');
  }
  return join(sdkmanDir(), 'candidates', 'java', spec, 'bin', 'java');
}

function validSdkmanId(spec: string): boolean {
  return /^[A-Za-z0-9._+-]+$/.test(spec);
}

/**
 * `sdk install java <id>` through sdkman's init script (the id is passed as an argument, never interpolated). It asks
 * not to become the default JDK (`sdkman_auto_answer` is switched off for the call, the question answered with no);
 * sdkman still makes the first JDK of a candidate the default, which `restoreDefault` undoes.
 */
export function installCommand(spec: string): string[] {
  return ['bash', '-lc', 'source "$SDKMAN_DIR/bin/sdkman-init.sh" && sdkman_auto_answer=false && printf "n\\n" | sdk install java "$1"', '_', spec];
}

function defaultLink(): string {
  return join(sdkmanDir(), 'candidates', 'java', 'current');
}

/** Where sdkman's default JDK (`candidates/java/current`) points, or undefined when there is none. */
export function readDefault(): string | undefined {
  try {
    return readlinkSync(defaultLink());
  } catch {
    return undefined;
  }
}

/**
 * Puts sdkman's default JDK back to `before` (no default at all when undefined). Installing a JDK for one server must
 * not change the Java every other command in the shell uses: the dev container keeps JetBrains Runtime as its default.
 */
export function restoreDefault(before: string | undefined): void {
  if (readDefault() === before) {
    return;
  }
  rmSync(defaultLink(), { force: true });
  if (before !== undefined) {
    symlinkSync(before, defaultLink());
  }
}

export type InstallMode = 'install' | 'ask' | 'fail';

/**
 * The `java` binary for an instance, installing the sdkman candidate when it is missing: `install` does it,
 * `ask` confirms on a terminal (and fails otherwise), `fail` only reports the command.
 */
export async function ensureJava(spec: string | undefined, mode: InstallMode): Promise<string> {
  const bin = javaBinOf(spec);
  if (!spec || existsSync(bin)) {
    return bin;
  }
  if (isAbsolute(spec)) {
    fail(`java = "${spec}": ${bin} does not exist`);
  }
  if (!validSdkmanId(spec)) {
    fail(`java = "${spec}" is neither an absolute path nor a sdkman candidate id (see \`sdk list java\`)`);
  }
  const command = `sdk install java ${spec}`;
  const sdkman = join(sdkmanDir(), 'bin', 'sdkman-init.sh');
  if (!existsSync(sdkman)) {
    fail(`JDK ${spec} is not installed and sdkman is not available (${sdkman}). Install the JDK yourself and set java to its absolute path.`);
  }
  if (mode === 'fail' || (mode === 'ask' && !(await confirmAction(`Install JDK ${spec} with sdkman (\`${command}\`)?`, false))) ) {
    fail(`JDK ${spec} is not installed. Run: ${command}`);
  }
  log(`Installing JDK ${spec} (${command})`);
  const [program, ...args] = installCommand(spec);
  const defaultBefore = readDefault();
  const result = capture(program!, args);
  restoreDefault(defaultBefore);
  if (result.status !== 0 || !existsSync(bin)) {
    fail(`${command} failed:\n${(result.stderr || result.stdout).trim().split('\n').slice(-5).join('\n')}`);
  }
  return bin;
}

const majors = new Map<string, number | undefined>();

/** Major version of a java binary (`java -version`: `25.0.4`, `1.8.0_402`), or undefined when it cannot be run. */
export function javaMajor(bin: string): number | undefined {
  if (!majors.has(bin)) {
    const output = capture(bin, ['-version']);
    const match = /version "(\d+)(?:\.(\d+))?/.exec(`${output.stderr}\n${output.stdout}`);
    majors.set(bin, output.status === 0 && match ? (match[1] === '1' ? Number(match[2]) : Number(match[1])) : undefined);
  }
  return majors.get(bin);
}

/** The capture agent and plugin are built for Java 25: an older JVM cannot load them. */
export const CAPTURE_MIN_JAVA = 25;

/** Installs every JDK the enabled instances name (what `mcdev setup` does, so `start` never waits for a download). */
export async function ensureJdks(config: DevConfig): Promise<void> {
  const specs = new Set(config.instances.filter((i) => i.enabled).map((i) => javaSpec(config, i)).filter((s): s is string => Boolean(s)));
  if (specs.size > 0) {
    step('JDKs');
  }
  for (const spec of specs) {
    await ensureJava(spec, 'install');
  }
}

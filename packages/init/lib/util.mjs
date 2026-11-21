// @ts-check
import { spawnSync } from 'node:child_process';

/** An expected failure: printed without a stack trace. */
export class InitError extends Error {
  /** @returns {never} */
  throw() {
    throw this;
  }
}

/**
 * Runs a program and captures its output.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, inherit?: boolean }} [options]
 */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** @typedef {'ok' | 'changed' | 'skipped' | 'manual'} StepStatus */

/**
 * One line of the report: what a step found (`ok`), did (`changed`), left alone (`skipped`) or needs the user for (`manual`).
 * @param {StepStatus} status
 * @param {string} what
 * @param {string} [detail]
 * @returns {{ status: StepStatus, what: string, detail: string }}
 */
export function step(status, what, detail = '') {
  const line = `  ${status.padEnd(8)} ${what}${detail ? `  ${detail}` : ''}`;
  console.log(line);
  return { status, what, detail };
}

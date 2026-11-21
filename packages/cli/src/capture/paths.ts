import { join } from 'node:path';
import { socketPath } from '../supervisor.ts';
import type { Instance } from '../templates.ts';
import { CONFIG_DIR } from '../util.ts';

/** Captures live here (gitignored): one folder per capture. */
export const CAPTURES = join(CONFIG_DIR, 'captures');

/** The capture plugin's control socket for an instance (passed to the JVM as -Dmcdevtools.capture.socket). */
export function controlSocket(instance: Instance): string {
  return socketPath(instance, '-capture');
}

import { fail } from '../../util.ts';
import { flashback } from './flashback.ts';
import { jsonl } from './jsonl.ts';
import { replaymod } from './replaymod.ts';
import { sniffcraft } from './sniffcraft.ts';
import type { Exporter } from './types.ts';

/** Registered export formats; add one here after writing its file. */
export const EXPORTERS: Record<string, Exporter> = {
  [sniffcraft.name]: sniffcraft,
  [jsonl.name]: jsonl,
  [flashback.name]: flashback,
  [replaymod.name]: replaymod,
};

/** Adds an export format (extensions call this through `api.registerExporter`). */
export function registerExporter(format: Exporter): void {
  if (EXPORTERS[format.name]) {
    fail(`Export format "${format.name}" is registered twice`);
  }
  EXPORTERS[format.name] = format;
}

export function exporter(name: string): Exporter {
  return EXPORTERS[name] ?? fail(`Unknown export format "${name}". Available: ${Object.keys(EXPORTERS).join(', ')}`);
}

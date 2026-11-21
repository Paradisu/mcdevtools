import { bold, dim, table } from '../output.ts';
import { fail, log } from '../util.ts';
import { type ItemSummary, decodeItemArray, summarize } from './items.ts';
import { type Tag } from './nbt.ts';
import { stringify } from './snbt.ts';

export type Format = 'table' | 'snbt' | 'json' | 'fixture' | 'raw';

/** Validates a `--format` value against the formats a command supports. */
export function formatArg(value: string | undefined, allowed: Format[], fallback: Format): Format {
  const format = (value ?? fallback) as Format;
  if (!allowed.includes(format)) fail(`--format must be one of ${allowed.join(', ')}`);
  return format;
}

export function describe(summary: ItemSummary): string[] {
  return [summary.id, String(summary.count), summary.name ?? '', summary.enchantments ?? ''];
}

export function bytes(value: string | null): Buffer | undefined {
  return value ? Buffer.from(value, 'base64') : undefined;
}

/** Decodes a base64 item array column (inventory, armor, ender chest); empty for null. */
export function decodeArray(value: string | null): (Tag | null)[] {
  const buf = bytes(value);
  return buf ? decodeItemArray(buf) : [];
}

export function snbtOf(tag: Tag): string {
  return stringify(tag, { pretty: true });
}

/** Prints a titled slot table; `label` names a slot index. */
export function printSlots(title: string, items: (Tag | null)[], label: (i: number) => string): void {
  const rows = items.flatMap((item, i) => (item ? [[label(i), ...describe(summarize(item))]] : []));
  log(bold(title));
  log(
    rows.length === 0
      ? dim('  (empty)')
      : table(['slot', 'item', { header: 'count', align: 'right' }, 'name', 'enchantments'], rows, { indent: 2 }),
  );
}

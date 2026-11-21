import { bold, dim, keyValue, relPath, table } from '../output.ts';
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Command } from '../command.ts';
import { queryJson } from '../db.ts';
import { askText, interactive, pickFrom, pickMany } from '../prompt.ts';
import { CONFIG_DIR, DevError, ROOT, RUN, fail, log, warn } from '../util.ts';
import { dataVersion } from './dataversion.ts';
import { type Format, decodeArray, describe, formatArg, printSlots } from './format.ts';
import { resolvePlayer } from './players.ts';
import {
  ARMOR_ORDER,
  ARMOR_SLOTS,
  type ItemSummary,
  decodeItem,
  decodeItemArray,
  encodeItem,
  encodeItemArray,
  looksLikeItemArray,
  slotLabel,
  summarize,
} from './items.ts';
import { type Tag, decompress, get, readNbt, toPlainJson } from './nbt.ts';
import { listChunks, readChunk } from './region.ts';
import { parse as parseSnbt, stringify } from './snbt.ts';
import { looksLikeUuid, mojangByName, mojangByUuid, offlineUuid, parseUuid, toIntArray, toMostLeast, uuidVersion } from './uuid.ts';

// ---------------------------------------------------------------------------------------------------------------
// mcdev mc nbt / item / encode / uuid
// ---------------------------------------------------------------------------------------------------------------

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function readInput(source: string): Promise<Buffer> {
  if (source === '-') return readStdin();
  const file = source.startsWith('@') ? source.slice(1) : source;
  if (!existsSync(file)) throw new DevError(`No such file: ${file}`);
  return readFileSync(file);
}

/** Maps `playerdata:<player>[@server]` and `level:<server>` to files in the dev run directory. */
async function nbtSource(source: string, serverNames: string[]): Promise<string> {
  const player = /^playerdata:(.+?)(?:@(.+))?$/.exec(source);
  if (player) {
    const resolved = await resolvePlayer(player[1]);
    const server = player[2] ?? (await chooseServer(serverNames));
    // Newer Minecraft versions keep player files in world/players/data, older ones in world/playerdata
    const candidates = [join(RUN, server, 'world', 'players', 'data'), join(RUN, server, 'world', 'playerdata')].map((dir) =>
      join(dir, `${resolved.uuid}.dat`),
    );
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
  }
  const level = /^level:(.+)$/.exec(source);
  if (level) return join(RUN, level[1]!, 'world', 'level.dat');
  return source;
}

async function chooseServer(names: string[]): Promise<string> {
  if (names.length === 1) return names[0]!;
  return pickFrom('Which server?', names.map((n) => ({ name: n, value: n })), 'A server (use playerdata:<player>@<server>)');
}

async function nbtCommand(serverNames: string[], args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { path: { type: 'string' }, format: { type: 'string' }, chunk: { type: 'string' }, compact: { type: 'boolean' } },
    allowPositionals: true,
  });
  const source = positionals[0] ?? (await askText('NBT file (or playerdata:<player>@<server>, level:<server>, - for stdin)', {}, 'An NBT file'));
  const file = await nbtSource(source, serverNames);
  let data: Buffer;
  if (file.endsWith('.mca')) {
    let chunk = values.chunk;
    if (!chunk) {
      const chunks = listChunks(file);
      chunk = await pickFrom('Which chunk?', chunks.map((c) => ({ name: `${c.x},${c.z}`, value: `${c.x},${c.z}` })), '--chunk x,z');
    }
    const [x, z] = chunk.split(',').map(Number);
    if (x === undefined || z === undefined || Number.isNaN(x) || Number.isNaN(z)) fail('--chunk must look like 3,14');
    data = readChunk(file, x, z);
  } else {
    data = decompress(await readInput(file));
  }
  const root = readNbt(data);
  const tag = values.path ? get(root.tag, values.path) : root.tag;
  if (!tag) throw new DevError(`Nothing at path ${values.path}`);
  const format = values.format ?? 'snbt';
  if (format === 'json') log(JSON.stringify(toPlainJson(tag), null, 2));
  else if (format === 'snbt') log(stringify(tag, { pretty: !values.compact }));
  else fail('--format must be snbt or json');
}

function looksLikeHex(text: string): boolean {
  return text.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(text);
}

async function itemCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { format: { type: 'string' }, compact: { type: 'boolean' } },
    allowPositionals: true,
  });
  const source = positionals[0] ?? fail('Usage: mcdev mc item <base64|hex|@file|-> [--format snbt|json|table]');
  const raw = source === '-' || source.startsWith('@') ? await readInput(source) : Buffer.from(source);
  const trimmed = raw.toString('utf8').trim();
  // Text input is base64 or hex; a file may also hold the raw bytes
  const buf = raw[0] === 0x1f || raw[0] === 0x01
    ? raw
    : looksLikeHex(trimmed)
      ? Buffer.from(trimmed, 'hex')
      : Buffer.from(trimmed, 'base64');
  const format = values.format ?? 'snbt';
  const show = (tag: Tag | null) => (tag === null ? 'empty' : format === 'json' ? JSON.stringify(toPlainJson(tag)) : stringify(tag, { pretty: !values.compact }));
  if (looksLikeItemArray(buf)) {
    const items = decodeItemArray(buf);
    if (format === 'table') {
      printSlots(`Item array (${items.length} slots)`, items, (i) => String(i));
      return;
    }
    items.forEach((item, i) => log(`${i}: ${show(item)}`));
  } else {
    const item = decodeItem(buf);
    log(format === 'table' ? describe(summarize(item)).join('  ') : show(item));
  }
}

async function encodeCommand(configVersion: () => Promise<number>, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { array: { type: 'boolean' }, hex: { type: 'boolean' } },
    allowPositionals: true,
  });
  const text = positionals[0] ?? (await askText('SNBT item', {}, 'An SNBT item like {id:"minecraft:stone",count:1}'));
  const tag = parseSnbt(text);
  const version = await configVersion();
  let out: Buffer;
  if (values.array) {
    if (tag.type !== 'list') fail('--array expects a list of items, using {} for empty slots');
    out = encodeItemArray(tag.value.map((t) => (t.type === 'compound' && Object.keys(t.value).length === 0 ? null : t)), version);
  } else {
    out = encodeItem(tag, version);
  }
  log(values.hex ? out.toString('hex') : out.toString('base64'));
}

async function uuidCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { offline: { type: 'boolean' } }, allowPositionals: true });
  const input = positionals.join(' ') || (await askText('Name or UUID', {}, 'A player name or UUID'));
  const rows: [string, string][] = [];
  const addUuid = (uuid: string) => {
    const { most, least } = toMostLeast(uuid);
    rows.push(['uuid', uuid], ['undashed', uuid.replaceAll('-', '')], ['int array', `[I;${toIntArray(uuid).join(',')}]`]);
    rows.push(['most/least', `${most}L / ${least}L`], ['version', `${uuidVersion(uuid)} (${uuidVersion(uuid) === 3 ? 'offline mode' : uuidVersion(uuid) === 4 ? 'online/random' : 'other'})`]);
  };
  let uuid: string | undefined;
  if (looksLikeUuid(input)) {
    uuid = parseUuid(input);
    addUuid(uuid);
  } else {
    rows.push(['name', input], ['offline uuid', offlineUuid(input)]);
  }
  const lookup = uuid ?? offlineUuid(input);
  try {
    const dbRows = queryJson<{ uuid: string; display_name: string | null }>(
      `select uuid::text, display_name from players where uuid::text = :'u' or lower(display_name) = lower(:'n')`,
      { u: lookup, n: uuid ? '' : input },
    );
    for (const p of dbRows) rows.push(['dev database', `${p.display_name ?? '(unnamed)'}  ${p.uuid}`]);
    if (dbRows.length === 0) rows.push(['dev database', '(not found)']);
  } catch {
    rows.push(['dev database', '(unavailable)']);
  }
  if (!values.offline) {
    try {
      const profile = uuid ? await mojangByUuid(uuid) : await mojangByName(input);
      rows.push(['mojang', profile ? `${profile.name}  ${profile.id}` : '(no such account)']);
    } catch (error) {
      warn(`Mojang lookup failed: ${(error as Error).message}`);
    }
  }
  log(keyValue(rows));
}

// ---------------------------------------------------------------------------------------------------------------

export function mcCommands(getVersion: () => Promise<number>, serverNames: () => string[]): Command[] {
  return [
    {
      name: 'mc nbt',
      usage: '<source>',
      summary: 'Decode NBT, a region chunk, player data or level.dat',
      details: 'Source: a file, - for stdin, playerdata:<player>@<server> or level:<server>.',
      options: [
        { flag: '--path <path>', summary: 'Select a sub-tag, e.g. a.b[0]' },
        { flag: '--format <name>', summary: 'snbt or json' },
        { flag: '--chunk <x,z>', summary: 'Region chunk to read' },
        { flag: '--compact', summary: 'Single-line SNBT' },
      ],
      run: (_c, a) => nbtCommand(serverNames(), a),
    },
    { name: 'mc item', usage: '<data>', summary: 'Decode a Paper item blob', details: 'Data: base64, hex, @file or - for stdin.', options: [{ flag: '--format <name>', summary: 'snbt, json or table' }, { flag: '--compact', summary: 'Single-line SNBT' }], run: (_c, a) => itemCommand(a) },
    { name: 'mc encode', usage: '<snbt>', summary: 'Encode SNBT as a Paper item blob', options: [{ flag: '--array', summary: 'Encode an item array' }, { flag: '--hex', summary: 'Print hex instead of base64' }], run: (_c, a) => encodeCommand(getVersion, a) },
    { name: 'mc uuid', usage: '<name|uuid>', summary: 'Convert UUID forms and look a player up', options: [{ flag: '--offline', summary: 'Skip the Mojang lookup' }], run: (_c, a) => uuidCommand(a) },
  ];
}

export async function configDataVersion(config: Parameters<typeof dataVersion>[0]): Promise<number> {
  return dataVersion(config);
}

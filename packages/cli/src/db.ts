import { dim, relPath, step, streamRow } from './output.ts';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type DevConfig, env } from './config.ts';
import { changelogId, migrationsOf } from './db-migrations.ts';
import { emit } from './extension/hooks.ts';
import { confirmAction } from './prompt.ts';
import { CONFIG_DIR, capture, fail, log, run } from './util.ts';

export const SNAPSHOTS = join(CONFIG_DIR, 'db', 'snapshots');

export function pgEnv(database?: string): Record<string, string> {
  const { db } = env();
  return {
    PGHOST: db.host,
    PGPORT: db.port,
    PGUSER: db.user,
    PGPASSWORD: db.password,
    PGDATABASE: database ?? db.name,
    PGOPTIONS: '-c client_min_messages=warning',
    MCDEV_DB_HOST: db.host,
    MCDEV_DB_PORT: db.port,
    MCDEV_DB_NAME: db.name,
    MCDEV_DB_USER: db.user,
    MCDEV_DB_PASSWORD: db.password,
  };
}

export function dbReachable(): boolean {
  return capture('pg_isready', [], { env: pgEnv() }).status === 0;
}

/** Runs psql with inherited stdio; extra args are passed straight through (`mcdev db psql -c '...'`). */
export function psql(args: string[], database?: string): void {
  run('psql', args, { env: pgEnv(database) });
}

function query(sql: string, database?: string): string {
  const result = capture('psql', ['-X', '-tA', '-c', sql], { env: pgEnv(database) });
  if (result.status !== 0) {
    fail(`psql failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

/**
 * Runs a query and returns its rows as objects. The SQL is sent on stdin so psql interpolates variables:
 * reference user input as :'name' and pass it in `vars`, never by string concatenation. Binary columns should be
 * selected as translate(encode(col, 'base64'), E'\\n', '') (encode wraps lines).
 */
export function queryJson<T>(sql: string, vars: Record<string, string> = {}): T[] {
  const args = ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(vars)) {
    args.push('-v', `${name}=${value}`);
  }
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${sql.trim().replace(/;$/, '')}) t;`;
  const result = capture('psql', args, { env: pgEnv(), input: wrapped });
  if (result.status !== 0) {
    fail(`psql failed: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout.trim() || '[]') as T[];
}

/** Runs a SQL script (stdin, so :'var' works) and fails on the first error. */
export function runSql(sql: string, vars: Record<string, string> = {}): void {
  const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(vars)) {
    args.push('-v', `${name}=${value}`);
  }
  const result = capture('psql', args, { env: pgEnv(), input: sql });
  if (result.status !== 0) {
    fail(`psql failed: ${result.stderr.trim()}`);
  }
}

export interface ResetOptions {
  config: DevConfig;
  through?: string;
  yes: boolean;
  all: boolean;
  /** Skip the `afterDbReset` hooks (extensions load fixtures there) */
  noFixtures?: boolean;
  stopAll: () => Promise<void>;
}

/**
 * Rebuilds the dev database: drops the schema, applies changelogs up to `through` (default: all) with
 * the matching seed data (`<seed_dir>/<changelog id>.sql`, then `local.sql`), runs the `afterDbReset` hooks, then
 * checks that only the changelogs that were not applied remain.
 */
export async function reset(options: ResetOptions): Promise<void> {
  const { config } = options;
  const migrations = config.db?.migrations ?? fail('db reset needs [db.migrations] in .mcdevtools/config.toml');
  const provider = migrationsOf(config);
  const seeds = join(CONFIG_DIR, migrations.seed_dir);
  const others = (config.db?.databases ?? []).slice(1);
  const target = options.through ? `changelog ${options.through}` : 'the latest changelog';
  if (!(await confirmAction(`This DROPS the dev database${options.all && others.length > 0 ? `s (including ${others.join(', ')})` : ''} and reseeds it through ${target}. Continue?`, options.yes))) {
    log('Aborted.');
    return;
  }
  await options.stopAll();
  await emit('beforeDbReset', config);

  const files = await provider.files(config);
  if (options.through && !files.some((file) => changelogId(file) === options.through)) {
    fail(`Unknown changelog ${options.through}. Available: ${files.map(changelogId).join(', ')}`);
  }
  const applying = files.filter((file) => !options.through || changelogId(file) <= options.through);

  const drop = `drop schema public cascade; create schema public;`;
  run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', drop], { env: pgEnv() });
  if (options.all) {
    for (const database of others) {
      run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', drop], { env: pgEnv(database) });
    }
  }

  step('Applying changelogs');
  const row = streamRow([{ min: 5 }, {}]);
  for (const file of applying) {
    const id = changelogId(file);
    await provider.applyFile(config, file);
    const seed = join(seeds, `${id}.sql`);
    const seeded = existsSync(seed);
    if (seeded) {
      run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', seed], { env: pgEnv() });
    }
    log(`  ${row([id, seeded ? 'applied, seeded' : 'applied'])}`);
  }
  const local = join(seeds, 'local.sql');
  if (existsSync(local)) {
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', local], { env: pgEnv() });
    log(`  ${row(['local', 'seeded'])}`);
  }

  if (!options.noFixtures) {
    await emit('afterDbReset', config, options.through);
  }

  const remaining = new Set(files.filter((file) => !applying.includes(file)));
  const unrun = await provider.pending(config);
  const unexpected = unrun.filter((line) => !remaining.has(line.slice(line.indexOf(':') + 1)));
  if (unexpected.length > 0) {
    fail(
      `After migrating, the migration tool still wants to run changesets that are not in a later changelog:\n  ${unexpected.join('\n  ')}\n` +
        `Their recorded file path differs from the one in ${migrations.changelog}, so the proxy would re-run them.`,
    );
  }
  const last = changelogId(applying[applying.length - 1]!);
  log(`Database at changelog ${last}${remaining.size > 0 ? `; ${[...remaining].map(changelogId).join(', ')} apply on the next proxy start` : ''}.`);
}

/** Recreates the database at its current changelog position with fresh seed data. */
export async function reseed(config: DevConfig, yes: boolean, stopAll: () => Promise<void>): Promise<void> {
  const applied = migrationsOf(config).applied(config);
  const through = applied.length > 0 ? changelogId(applied[applied.length - 1]!) : undefined;
  await reset({ config, through, yes, all: false, stopAll });
}

export async function snapshot(name: string): Promise<void> {
  await mkdir(SNAPSHOTS, { recursive: true });
  const file = join(SNAPSHOTS, `${name}.dump`);
  run('pg_dump', ['-Fc', '-f', file], { env: pgEnv() });
  log(`Saved ${relPath(file)}`);
}

/** pg_restore of a custom-format dump into `database` (existing objects are dropped first). */
export function restoreDump(file: string, database: string): void {
  run('pg_restore', ['--clean', '--if-exists', '--no-owner', '-d', database, file], { env: pgEnv(database) });
}

/** pg_dump of `database` in custom format. */
export function dumpDatabase(file: string, database: string): void {
  run('pg_dump', ['-Fc', '-f', file], { env: pgEnv(database) });
}

export async function restore(name: string, yes: boolean, stopAll: () => Promise<void>): Promise<void> {
  const file = join(SNAPSHOTS, `${name}.dump`);
  if (!existsSync(file)) {
    const available = existsSync(SNAPSHOTS) ? (await readdir(SNAPSHOTS)).join(', ') : 'none';
    fail(`No snapshot "${name}" (available: ${available})`);
  }
  if (!(await confirmAction(`Restore snapshot "${name}" over the dev database?`, yes))) {
    log('Aborted.');
    return;
  }
  await stopAll();
  restoreDump(file, env().db.name);
  log(`Restored ${name}.`);
}

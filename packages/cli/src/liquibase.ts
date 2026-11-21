import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevConfig, MigrationsConfig } from './config.ts';
import { pgEnv } from './db.ts';
import { LIQUIBASE_RUNNER, gradle } from './java.ts';
import type { MigrationProvider } from './db-migrations.ts';
import { dim } from './output.ts';
import { ROOT, capture, fail, log } from './util.ts';

function settings(config: DevConfig): MigrationsConfig {
  return config.db?.migrations ?? fail('This project has no [db.migrations] section in .mcdevtools/config.toml');
}

/** Runs mcdevtools' Liquibase runner (java/liquibase-runner) against the project's changelogs. */
function runner(config: DevConfig, args: string[]): string {
  const migrations = settings(config);
  const result = capture(LIQUIBASE_RUNNER, [...args, '--search-path', join(ROOT, migrations.search_path), '--changelog', migrations.changelog], { env: pgEnv() });
  if (result.status !== 0) {
    fail(`liquibase ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function query(sql: string): string {
  const result = capture('psql', ['-X', '-tA', '-c', sql], { env: pgEnv() });
  if (result.status !== 0) {
    fail(`psql failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

/** Liquibase changelogs (XML/YAML/SQL files listed by a master changelog) applied by the bundled runner. */
export const LIQUIBASE: MigrationProvider = {
  async files(config) {
    log(dim('Building migration tool'));
    gradle([':liquibase-runner:installDist']);
    return runner(config, ['files']).split('\n').filter(Boolean);
  },
  ids(config) {
    const migrations = settings(config);
    const master = readFileSync(join(ROOT, migrations.search_path, migrations.changelog), 'utf8');
    return [...master.matchAll(/file="[^"]*?([\w-]+)\.\w+"/g)].map((match) => match[1]!);
  },
  async applyFile(config, file) {
    runner(config, ['update-file', file]);
  },
  initialised() {
    return query(`select to_regclass('public.databasechangelog') is not null`) === 't';
  },
  applied(config) {
    return LIQUIBASE.initialised(config) ? query(`select distinct filename from databasechangelog order by 1`).split('\n').filter(Boolean) : [];
  },
  async pending(config) {
    return runner(config, ['unrun']).split('\n').filter(Boolean);
  },
};

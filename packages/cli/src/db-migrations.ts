import type { DevConfig } from './config.ts';
import { fail } from './util.ts';

/**
 * Applies a project's schema migrations to the dev database. `[db.migrations].tool` selects one; liquibase is built
 * in (see liquibase.ts). `mcdev db reset` drives it file by file so seed data can be loaded between changelogs.
 */
export interface MigrationProvider {
  /** Changelog files in order, as the tool names them (e.g. `db/changelog/001.xml`); may build the tool first */
  files(config: DevConfig): Promise<string[]>;
  /** The same ids without building anything: read from the master changelog */
  ids(config: DevConfig): string[];
  /** Applies one file to the database */
  applyFile(config: DevConfig, file: string): Promise<void>;
  /** Files the database has applied */
  applied(config: DevConfig): string[];
  /** Whether the tool has ever run against the database */
  initialised(config: DevConfig): boolean;
  /** Lines `<changeset id>:<file>` of changesets that would still run */
  pending(config: DevConfig): Promise<string[]>;
}

/** The id seeds and `--through` use: a changelog's file name without its extension. */
export function changelogId(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1).replace(/\.\w+$/, '');
}

const PROVIDERS = new Map<string, MigrationProvider>();

export function registerMigrationProvider(name: string, provider: MigrationProvider): void {
  if (PROVIDERS.has(name)) {
    fail(`Migration provider "${name}" is registered twice`);
  }
  PROVIDERS.set(name, provider);
}

/** The provider configured under [db.migrations]; fails with the known names when there is none. */
export function migrationsOf(config: DevConfig): MigrationProvider {
  const tool = config.db?.migrations?.tool;
  if (!tool) {
    fail('This project has no [db.migrations] section in .mcdevtools/config.toml');
  }
  return PROVIDERS.get(tool) ?? fail(`Unknown migration tool "${tool}". Known: ${[...PROVIDERS.keys()].join(', ')}`);
}

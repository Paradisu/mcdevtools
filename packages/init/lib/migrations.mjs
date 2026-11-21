// @ts-check

/**
 * Config format migrations, applied by `mcdev update` to `.mcdevtools/config.toml` in order. Each takes the file
 * text of format `from` and returns text of format `from + 1`; keep them textual so comments survive. There are
 * none yet: the schema is format 1.
 * @type {{ from: number, note: string, apply(text: string): string }[]}
 */
export const MIGRATIONS = [];

/** The CURRENT format of the schema this checkout reads. */
export const CURRENT_FORMAT = 1 + MIGRATIONS.length;

/**
 * @param {string} text
 * @returns {number} the `format = N` of the file; 1 when absent
 */
export function readFormat(text) {
  const match = /^format\s*=\s*(\d+)/m.exec(text);
  return match ? Number(match[1]) : 1;
}

/**
 * Runs every migration the file still needs.
 * @param {string} text
 * @param {{ migrations?: typeof MIGRATIONS }} [options]
 * @returns {{ text: string, applied: string[] }}
 */
export function migrateConfigText(text, options = {}) {
  const migrations = options.migrations ?? MIGRATIONS;
  let format = readFormat(text);
  const applied = [];
  for (const migration of migrations.filter((m) => m.from >= format).sort((a, b) => a.from - b.from)) {
    text = migration.apply(text);
    format = migration.from + 1;
    text = /^format\s*=/m.test(text) ? text.replace(/^format\s*=\s*\d+/m, `format = ${format}`) : `format = ${format}\n${text}`;
    applied.push(migration.note);
  }
  return { text, applied };
}

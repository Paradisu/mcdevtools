import { parseArgs } from 'node:util';
import { existsSync, readdirSync } from 'node:fs';
import type { Command } from './command.ts';
import type { DevConfig } from './config.ts';
import * as db from './db.ts';
import { changelogId, migrationsOf } from './db-migrations.ts';
import { dim } from './output.ts';
import { askOptional, askText, interactive, pickFrom } from './prompt.ts';

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function snapshotNames(): string[] {
  return existsSync(db.SNAPSHOTS)
    ? readdirSync(db.SNAPSHOTS)
        .filter((file) => file.endsWith('.dump'))
        .map((file) => file.slice(0, -'.dump'.length))
    : [];
}

async function changelogChoice(config: DevConfig): Promise<string | undefined> {
  const ids = (await migrationsOf(config).files(config)).map(changelogId);
  return pickFrom(
    'Reset through which changelog?',
    ids.map((n, i) => ({ name: i === ids.length - 1 ? `${n} ${dim('latest')}` : n, value: i === ids.length - 1 ? undefined : n })),
  );
}

/** The `db` commands; they exist only when the project has a [db] section. `db reset` and `db seed` also need [db.migrations]. */
export function dbCommands(config: DevConfig): Command[] {
  if (!config.db) {
    return [];
  }
  return [
    {
      name: 'db reset',
      usage: '',
      summary: 'Rebuild the database with seed data and fixtures',
      options: [
        { flag: '--through <00N>', summary: 'Stop at this changelog (default: latest)' },
        { flag: '--all', summary: 'Also reset the other databases' },
        { flag: '--no-fixtures', summary: 'Skip the fixtures extensions load after a reset' },
        { flag: '--yes', summary: 'Do not ask for confirmation' },
      ],
      run: async (ctx, args) => {
        const { values } = parseArgs({
          args,
          options: {
            through: { type: 'string' },
            all: { type: 'boolean' },
            yes: { type: 'boolean' },
            'no-fixtures': { type: 'boolean' },
          },
        });
        const others = (ctx.config.db?.databases ?? []).slice(1);
        let through = values.through;
        let all = values.all ?? false;
        if (args.length === 0 && interactive()) {
          through = await changelogChoice(ctx.config);
          all = others.length > 0 && (await askOptional(`Also reset ${others.join(', ')}?`, false));
        }
        return db.reset({ config: ctx.config, through, all, yes: values.yes ?? false, noFixtures: values['no-fixtures'] ?? false, stopAll: ctx.stopAll });
      },
    },
    {
      name: 'db seed',
      usage: '',
      summary: 'Reseed at the current changelog',
      options: [
        { flag: '--yes', summary: 'Do not ask for confirmation' },
      ],
      run: (ctx, args) => {
        const { values } = parseArgs({ args, options: { yes: { type: 'boolean' } } });
        return db.reseed(ctx.config, values.yes ?? false, ctx.stopAll);
      },
    },
    {
      name: 'db snapshot',
      usage: '<name>',
      summary: 'Save the database to .mcdevtools/db/snapshots',
      run: async (_ctx, args) =>
        db.snapshot(args[0] ?? (await askText('Snapshot name', { default: `snap-${timestamp()}` }, 'A snapshot name'))),
    },
    {
      name: 'db restore',
      usage: '<name>',
      summary: 'Restore a snapshot',
      options: [
        { flag: '--yes', summary: 'Do not ask for confirmation' },
      ],
      run: async (ctx, args) => {
        const { values, positionals } = parseArgs({ args, options: { yes: { type: 'boolean' } }, allowPositionals: true });
        const name =
          positionals[0] ??
          (await pickFrom(
            'Restore which snapshot?',
            snapshotNames().map((n) => ({ name: n, value: n })),
            'A snapshot name',
          ));
        return db.restore(name, values.yes ?? false, ctx.stopAll);
      },
    },
    {
      name: 'db psql',
      usage: '[psql args...]',
      summary: 'Open psql',
      details: 'Extra arguments are passed to psql.',
      passthrough: true,
      run: (_ctx, args) => db.psql(args),
    },
  ];
}

# Extensions

Anything specific to one project lives in an extension: a TypeScript package in `.mcdevtools/extensions/<name>/` that registers itself with the CLI. Part of the [development environment](environment.md).

- [What an extension can do](#what-an-extension-can-do)
- [Creating one](#creating-one)
- [The API](#the-api)
- [Hooks](#hooks)
- [Rules](#rules)
- [Example: the Paradisu extension](#example-the-paradisu-extension)

## What an extension can do

| Need | Use |
| --- | --- |
| A project command (`mcdev myproject deploy`) | `registerCommand`, `registerHelpSection` |
| A server type the core does not know | `registerPlatform` |
| A plugin source (an internal artifact server) | `registerPluginSource` |
| Variables for preset configs (`${MY_VAR}`) | `registerTemplateVars` |
| A different migration tool, or schema-specific commands | `registerMigrationProvider`, commands with `@mcdevtools/cli/db` |
| A capture export format, a tunnel provider | `registerExporter`, `registerShareProvider` |
| Resolving player names for `mc nbt playerdata:<name>` | `registerPlayerResolver` |
| Reacting to setup, start, share and database reset | `on(event, handler)` ([hooks](#hooks)) |
| Settings of its own | a `[<extension name>]` table in `config.toml`, read with `api.settings()` |

## Creating one

```bash
npx github:Paradisu/mcdevtools init --extension myproject   # on a project that already uses mcdevtools: re-running is safe
```

creates `.mcdevtools/extensions/myproject/` (`package.json`, `tsconfig.json`, `src/index.ts`) and lists it in `extensions`. The package is part of the pnpm workspace, so your editor sees the whole project at once: types of `@mcdevtools/cli` come from the submodule through the workspace link, and "go to definition" opens the real source. Run `pnpm install` once, then `pnpm -r typecheck`.

```ts
import { defineExtension } from '@mcdevtools/cli/extension';

export default defineExtension({
  name: 'myproject',
  setup(api) {
    api.registerCommand({
      name: 'myproject hello',
      usage: '',
      summary: 'Say hello',
      run: ({ config }) => console.log(`${config.instances.length} instances`),
    });
    api.registerHelpSection('My project', ['myproject']);
  },
});
```

The entry point is whatever `package.json` says in `exports` (or `main`). `extensions` in `config.toml` accepts a directory relative to `.mcdevtools/` (`"extensions/myproject"`), or a package name that resolves from the project root (an extension shared between projects, installed with pnpm).

Extensions run as TypeScript directly under Node 24 (type stripping), so only erasable syntax is allowed: no `enum`, `namespace` or parameter properties, and relative imports end in `.ts`.

## The API

`setup(api)` receives an `ExtensionApi` ([source](../packages/cli/src/extension/index.ts)):

| Member | Purpose |
| --- | --- |
| `project`, `config` | The project paths (`root`, `configDir`, `toolRoot`) and the effective config |
| `settings()` | The `[<extension name>]` table of the config |
| `registerCommand(command)` | A `Command` (same shape as the built-in ones: `name` of one or two words, `usage`, `summary` of at most 60 characters, `options`, `run(ctx, args)`) |
| `registerHelpSection(title, prefixes)` | Lists commands whose first word is in `prefixes` under a heading in `mcdev help` |
| `registerPlatform(def)` | A `PlatformDef` ([types](../packages/cli/src/platforms/types.ts)): how to resolve and download its jar, how it starts, stops and signals readiness, which plugin family it belongs to. `[[instances]] type = "<type>"` then selects it |
| `registerPluginSource(name, resolve)` | `source = "<name>"` for `[[plugins]]` |
| `registerTemplateVars(provider)` | Returns variables for every template of an instance; later providers win |
| `registerMigrationProvider(name, provider)` | `[db.migrations] tool = "<name>"` |
| `registerExporter`, `registerShareProvider` | Capture export formats and tunnel services |
| `registerPlayerResolver(resolver)` | Player names for `mc nbt` |
| `on(event, handler)` | [Hooks](#hooks) |
| `sendConsole(instance, line)` | Send a line to a running instance's console |

Helpers for commands are importable from the package (they are plain functions, not registries):

| Import | Contains |
| --- | --- |
| `@mcdevtools/cli/output` | `table`, `columns`, `keyValue`, `status`, `dim`, `bold` ... (see [tool.md](tool.md#output-style)) |
| `@mcdevtools/cli/prompt` | `pickFrom`, `askText`, `confirmAction`, ... (they stay silent under `--no-input`) |
| `@mcdevtools/cli/util` | `ROOT`, `CONFIG_DIR`, `RUN`, `fail`, `log`, `warn`, `DevError` |
| `@mcdevtools/cli/db` | `queryJson`, `runSql`, `psql`, `pgEnv`, `dumpDatabase`, `restoreDump` |
| `@mcdevtools/cli/mc` | NBT, SNBT, item and UUID codecs and the shared formatting of `mc` commands |

## Hooks

| Event | When |
| --- | --- |
| `afterSetup(config)` | `mcdev setup` finished downloading |
| `beforeStart(config, instances)` / `afterStart(config, instances)` | Around `start`, with the selected instances |
| `shareAddressesChanged(config, proxy, addresses)` | A tunnel changed the public addresses; `proxy` was re-rendered and is running. Reload project config here |
| `afterShareStart(config, state)` | `mcdev share start` opened its tunnels; print warnings here |
| `beforeDbReset(config)` / `afterDbReset(config, through)` | Around `mcdev db reset` (load fixtures in the second) |

Handlers run in registration order and are awaited.

## Rules

- **Register through `api`, import only helpers.** Never import the registries or singletons of the CLI directly: the extension and the CLI must agree on one set of registrations.
- **Never write into `.mcdevtools/run`.** It is regenerated. Config worth keeping goes in `.mcdevtools/templates/` (committed) or `templates.local/` (personal).
- **A failing extension stops the CLI** with a message naming it, so a broken one is never silently skipped. Keep `setup` fast: it runs on every `mcdev` invocation.
- **Keep project secrets out of `config.toml`**; use `config.local.toml` or the environment.

## Example: the Paradisu extension

[ParadisuPlugin](https://github.com/Paradisu/ParadisuPlugin) uses all of the above in `.mcdevtools/extensions/paradisu`: template variables for its preset configs (`CONTEXT_*`, the proxy's and Limbo's public addresses), a `shareAddressesChanged` handler that runs `vparadisu reload`, an `afterShareStart` warning, the commands that read its database schema (`mc players`, `mc inventory`, `mc dump`, `mc columns`, `db fixtures`), a player resolver and an `afterDbReset` handler that loads fixtures.

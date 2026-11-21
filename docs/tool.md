# Working on mcdevtools

For changes to the CLI, the Java tools or the init tool in this repository. To *use* mcdevtools, see the [development environment](environment.md); to extend a project, see [extensions](extensions.md).

- [Layout](#layout)
- [Rules](#rules)
- [Adding a command](#adding-a-command)
- [Output style](#output-style)
- [Extension points](#extension-points)
- [Testing a change in a real project](#testing-a-change-in-a-real-project)

## Layout

```
bin/mcdev                 bash launcher (installs dependencies on first use, then runs the CLI)
packages/cli/             the mcdev CLI ("@mcdevtools/cli"); TypeScript run directly by Node 24
  src/  test/  templates/  scaffold/  zellij/  layouts/
packages/init/            "npx github:Paradisu/mcdevtools init|update": plain JavaScript, no dependencies
java/                     standalone Gradle build: capture plugin, Liquibase runner (also an included build of projects)
devcontainer/             the image Dockerfile, the mcdev wrapper, the adopter template
docs/
```

`packages/cli/src`:

| Path | Role |
| --- | --- |
| `cli.ts` | Command registry and `main()`; network commands (`start`, `console`, `logs`, ...) |
| `command.ts` | The `Command` and `OptionDoc` types |
| `project.ts`, `util.ts` | Finding the project (`.mcdevtools/config.toml`), paths (`ROOT`, `TOOL_ROOT`, `CONFIG_DIR`, `RUN`, `CACHE`), `fail`, `log`, `warn`, process and download helpers |
| `config.ts`, `legacy-config.ts` | The config schema, defaults, loading and merging; converting the pre-extraction format |
| `topology.ts` | Networks, proxies, backends, standalone instances and their validation |
| `platforms/` | The platform registry and the built-ins ([platforms](platforms.md)); `families.ts` maps plugin families to Modrinth loaders |
| `versions.ts`, `downloads.ts` | Version resolution, plugin sources, downloads and `resolved.json` |
| `templates.ts`, `instances.ts` | Rendering templates into `.mcdevtools/run`, starting, stopping and listing instances |
| `extension/` | The extension API (`index.ts`), loader (`load.ts`) and hooks (`hooks.ts`) |
| `help.ts`, `prompt.ts`, `output.ts` | Help text (sections registered by modules and extensions), every prompt (silent under `--no-input`, `CI`, `MCDEV_NO_INPUT`, no TTY), every printing helper |
| `supervisor.ts` | Per-instance supervisor and console socket (protocol in the header comment) |
| `zellij.ts`, `hotswap.ts` | `mcdev ui` / `web`; JVM flags for enhanced redefinition and HotswapAgent |
| `db.ts`, `db-commands.ts`, `db-migrations.ts`, `liquibase.ts` | The `db` commands, the migration provider interface and the built-in Liquibase provider |
| `java.ts` | Locations of the Java tools and running their Gradle build |
| `profile.ts` | `mcdev profile` and `mcdev override` |
| `mc/` | Minecraft data codecs (NBT, SNBT, items, UUIDs) and the generic `mc` commands |
| `capture/` | `mcdev capture` ([details](capture.md#how-it-works-and-extending-it)) |
| `share/` | `mcdev share` and the tunnel providers |

## Rules

- Only erasable TypeScript syntax (no `enum`, `namespace`, parameter properties). Relative imports end in `.ts`. `packages/init` is plain JavaScript with JSDoc types (it runs from `node_modules`, where Node does not strip types).
- Check with `pnpm typecheck` and `pnpm test` (all packages), and `cd java && ./gradlew spotlessApply build` for Java. The tests cover config loading and validation, the extension loader, the codecs, capture (dump format, filters, wizards, exports), share, output, hotswap and the init/update tool against throwaway git repositories. Add a test beside the module you change when it is pure logic.
- Keep `PNPM_VERSION` in `devcontainer/Dockerfile` equal to `packageManager` in `package.json`.
- Nothing in this repository may know about a particular project. Project-specific behavior belongs in that project's [extension](extensions.md); if an extension cannot do it, add the missing hook or registry here.

## Adding a command

1. Add a `Command` (see `command.ts`) to the array of the right module and make sure `cli.ts` includes that array. `summary` is at most 60 characters, imperative, without a trailing period; `usage` holds positionals only; every flag goes in `options` (one line each); extra explanation goes in `details`.
2. Make sure the command's name starts with a prefix listed in `SECTIONS` in [help.ts](../packages/cli/src/help.ts) (or register one with `registerHelpSection`), otherwise it is listed under "Other".
3. Parse arguments with `parseArgs` from `node:util`, as the `console` and `logs` commands in [cli.ts](../packages/cli/src/cli.ts) do. Pick an instance, a changelog or another id with the shared helpers (`instanceArg`, the pickers in `capture/wizard.ts`) so a terminal gets a menu and a script gets an error.
4. Prompt only through [prompt.ts](../packages/cli/src/prompt.ts). A destructive command takes `--yes` and refuses without it when it cannot ask. With `--no-input` nothing may ever prompt.
5. Print through [output.ts](../packages/cli/src/output.ts) ([Output style](#output-style)); fail with `fail(...)` from `util.ts` for user errors.
6. Document the command in [environment.md](environment.md) (or the page of its group).

## Output style

Everything `dev` prints goes through [output.ts](../dev/src/output.ts) so that menus and tables look the same everywhere:

1. Tabular data uses `table()` (header row), `columns()` (menu labels), `keyValue()` (label/value blocks) or `streamRow()` (lines that arrive one at a time). Never align with `padEnd`/`padStart`; they break on colors and wide names.
2. Table headers are written lower case in code and shown UPPERCASE, columns are separated by two spaces and numbers are right-aligned. An empty result is one plain sentence (`No captures.`), never an empty table.
3. Color is minimal and never the only signal: bold for headings and table headers, dim for secondary text (hints, `Same as:`), green/yellow/red only for status words (`status()`) and the `warning:`/`error:` prefixes. It switches off for pipes, `NO_COLOR` and `TERM=dumb`.
4. Status words are lower case: `running`, `stopped`, `disabled`, `starting`, `ok`, `failed`, `missing`, `stale`, `live`, `off`.
5. Command summaries are at most 60 characters, imperative, without parentheticals. Put flags in `options` (one line each) and detail in `details`; `usage` holds positional arguments only.
6. Print only what the user cannot already know: the result (a new path or id) and problems. Never echo what they just chose, counts they just saw in a picker, how-to-use hints or reminders after success, or details of work that is expected to just work. A warning is the problem, a semicolon and the fix. `next(...)` is only for the fix to a problem, never a tour of follow-up commands.
7. Show paths repo-relative (`relPath()`), sizes with `formatBytes()` and durations with `formatDuration()`. `step()` prints a bold phase heading, `sameAs()` the dim `Same as:` line of a guided run.
8. Machine-readable output (`--format json|snbt|raw`, `mc encode`) stays unstyled.

```ts
log(table(['id', { header: 'size', align: 'right' }], rows));
next('mcdev capture show latest');
```

## Extension points

- **Platforms:** [platforms](platforms.md#writing-a-platform). **Plugin sources:** `registerPluginSource`, built-ins in `versions.ts`. **Migration tools:** `MigrationProvider` in `db-migrations.ts`.
- **Share providers:** implement `ProviderFactory` (header of `packages/cli/src/share/provider.ts`), import the service's SDK lazily (it is an optional dependency), register it in `share/providers/index.ts`, and select it with `share.provider` or `mcdev share start --provider <name>`. Tokens live in `config.local.toml` or the environment, never in `config.toml` or profiles.
- **Capture export formats:** implement `Exporter` (`capture/exporters/types.ts`) in a new file and register it in `exporters/index.ts`; `jsonl.ts` is the smallest example. Packet-layout code for Flashback and ReplayMod lives in `exporters/play.ts` and `exporters/blocks.ts`.
- **Dump format:** changing a record needs a `FORMAT` bump in both `DumpWriter.java` and `packages/cli/src/capture/format.ts`; readers keep reading old formats.
- **Profiles:** the archive layout is versioned by `format` in `profile.toml` (`FORMAT` in `profile.ts`; 2 pins versions per instance, 1 is converted on import). Changing the layout means bumping it and still reading older ones. Imports treat the archive as untrusted; keep the validation and review screen intact.
- **Config format:** the schema is `format = 1`. A change that breaks existing configs needs a migration in `packages/init/lib/migrations.mjs` (run by `mcdev update`) and a bump of the scaffold's `format`.

## Testing a change in a real project

Point a project's submodule at your working copy and `update` to it: `git -C dev remote set-url origin /path/to/your/mcdevtools`, commit there, then `mcdev update`. For the devcontainer image, `docker build -f devcontainer/Dockerfile -t mcdevtools-devcontainer:local .` and run it as the project's `dev` service. The init tool can be tried on a scratch repository with `node packages/init/bin/mcdevtools.mjs init --url /path/to/your/mcdevtools --no-install` run inside it.

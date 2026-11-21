# AGENTS.md

Guidance for AI coding agents working on mcdevtools. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/](docs/environment.md). Keep AGENTS.md and CONTRIBUTING.md consistent when changing conventions.

## Project

mcdevtools: a local development network for Minecraft plugin projects. One CLI (`mcdev`, TypeScript on Node 24 + pnpm), Java helpers (Gradle), an init/update tool (`npx github:Paradisu/mcdevtools init`) and a dev container image. Projects use it as a git submodule (`dev/`) with their own config and extensions in `.mcdevtools/`.

## Modules

| Path | Role |
| --- | --- |
| `packages/cli` | The `mcdev` CLI (`@mcdevtools/cli`). Exports `./extension`, `./mc`, `./output`, `./prompt`, `./db`, `./util` for extensions; templates, scaffold, zellij config |
| `packages/init` | `init` / `update` / wiring: plain JavaScript (JSDoc types), no dependencies |
| `java/capture` | Packet capture plugin (one jar for Paper, Velocity and Limbo; `mcdevtools-capture.jar`). No project dependencies |
| `java/liquibase-runner` | Liquibase runner used by `mcdev db`; reads changelogs from a search path |
| `java/build-logic` | Convention plugin `mcdevtools.java-conventions` |
| `devcontainer` | Image Dockerfile, `mcdev` wrapper, adopter `template/` |
| `docs` | The documentation |

Nothing here may name a particular project. Project-specific behavior belongs in that project's extension: add the missing hook or registry here instead.

## Workflow

1. **Read first:** the matching page in [docs/](docs/tool.md) and a similar existing module. Copy its structure.
2. **Change** the code, matching the surrounding style.
3. **Check:** `pnpm typecheck && pnpm test`; for Java `cd java && ./gradlew spotlessApply build`.
4. **Check at runtime** when behavior changes: run it in a real project (see [Testing a change in a real project](docs/tool.md#testing-a-change-in-a-real-project)). Typecheck and tests prove it compiles, not that a network starts. Never claim a `mcdev` flow worked unless you ran it.
5. **Update the docs** (below).
6. **Report** what you ran and its result, and what you could not verify.

## Rules

- Only erasable TypeScript (no `enum`, `namespace`, parameter properties); relative imports end in `.ts`. `packages/init` is JavaScript with `// @ts-check`.
- Print through `packages/cli/src/output.ts` (`table`, `columns`, `keyValue`, `streamRow`, `status`, `next`); never pad columns by hand. Command summaries are at most 60 characters; flags go in `options`, `usage` holds positionals only. Prompt only through `prompt.ts`; nothing may prompt under `--no-input`, `CI`, `MCDEV_NO_INPUT` or without a TTY.
- **Never run** `mcdev ui`, `mcdev web start`, `mcdev console <name>` without `--send`, `mcdev logs ... -f` or `mcdev share start --foreground` from an agent: they take over the terminal or never exit. Use `mcdev logs <name>` and `mcdev console <name> --send "<command>"`.
- Registries are filled through the extension API (`packages/cli/src/extension/`): platforms, plugin sources, exporters, share providers, template variables, migration providers, player resolvers, commands, help sections, hooks. Built-ins register through the same functions.
- **Versioned formats** must keep reading older versions: the capture dump (`FORMAT` in `DumpWriter.java` and `packages/cli/src/capture/format.ts`, bumped on both sides), profiles (`FORMAT` in `profile.ts`; 1 is converted by `legacy-config.ts`) and the config (`format`; migrations in `packages/init/lib/migrations.mjs`). Profile imports treat the archive as untrusted: keep the validation and review screen.
- **Capture** must never block or break a connection: keep `CaptureEngine.onFrame` allocation-light, non-blocking and catching everything. If a Minecraft/Paper/Velocity/Limbo update breaks injection, fix `netty/PipelineLayout.java` (handler names), `CapturePaper.register()`, `CaptureVelocity.hook()` or `CaptureLimbo.onConnect()` (all reflective). Packet names come from Mojang's data generator: a Minecraft bump needs `mcdev capture protocol --refresh` and an instance restart, not Java changes.
- **Share providers** implement `ProviderFactory` (`share/provider.ts`), are registered in `share/providers/index.ts` and import their SDK lazily (optional dependency).
- Java: Gradle (Kotlin DSL), version catalog in `java/gradle/libs.versions.toml` (no hard-coded versions in module build files), Palantir Java Format via Spotless (do not hand-format or add license headers), configuration cache enabled (read values with `providers.gradleProperty(...)`, never capture `project` in task actions). `./gradlew spotlessApply build` after editing Java.
- Keep `PNPM_VERSION` in `devcontainer/Dockerfile` equal to `packageManager` in `package.json`.

## Updating dependencies

- Node: pin exact versions in `package.json` files; run `pnpm install` to refresh `pnpm-lock.yaml`.
- Java: edit `java/gradle/libs.versions.toml` `[versions]` only. New Minecraft version: bump `paper-api` and `velocity-api` (and `limbo` when it publishes a matching build), then `mcdev setup --refresh`, `mcdev capture protocol --refresh` and `mcdev capture doctor` in a project.
- Look versions up from the real source, do not guess: Maven Central `maven-metadata.xml`; `paper-api` / `velocity-api` at `https://repo.papermc.io/repository/maven-public/`; `limbo` from the `<version>` in `https://github.com/LOOHP/Limbo/blob/master/pom.xml` (check `.../Limbo/<version>/Limbo-<version>.pom` exists at `repo.loohpjames.com`).

## Documentation

**Documentation is part of the change.** A task is not finished while a doc that describes the changed behavior is wrong or missing. Keep docs short and factual.

| Change | Update |
| --- | --- |
| Command, flag, config key, workflow | The command's `summary`/`options`, [docs/environment.md](docs/environment.md) and the page of its group |
| Extension API, hook, registry | [docs/extensions.md](docs/extensions.md) |
| Platform | [docs/platforms.md](docs/platforms.md) |
| New module or major class | The module tables in [docs/tool.md](docs/tool.md) and here |
| Convention | [CONTRIBUTING.md](CONTRIBUTING.md) **and** the rule here |
| `init` / `update` behavior | The README and the `--help` text in `packages/init/bin/mcdevtools.mjs` |

Public methods get Javadoc; non-obvious modules get a header comment.

## Before you finish

1. `pnpm typecheck && pnpm test` pass (and `cd java && ./gradlew spotlessApply build` for Java).
2. A new registry or hook is reachable from `ExtensionApi` and documented.
3. A changed config key keeps old configs working (default, or a migration in `migrations.mjs`).
4. Runtime checks done in a real project, or the reason they were not.
5. Docs updated.
6. Your summary states what you could not verify.

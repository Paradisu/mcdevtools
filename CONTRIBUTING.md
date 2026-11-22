# Contributing to mcdevtools

mcdevtools is a development network for Minecraft plugin projects: a CLI (`mcdev`), Java helpers, an init/update tool and a dev container image. Coding agents: [AGENTS.md](AGENTS.md) (the same rules, shorter). Keep both consistent when changing conventions.

## Setup

```bash
pnpm install            # Node 24+; pnpm version is "packageManager" in package.json
pnpm typecheck && pnpm test
cd java && ./gradlew spotlessApply build
```

The easiest place to work is the dev container image of this repository's users: `docker build -f devcontainer/Dockerfile -t mcdevtools-devcontainer:local .` (Java 25, Node, pnpm, psql, zellij, sdkman).

## Where things live

See the layout in [docs/tool.md](docs/tool.md#layout). In short: `packages/cli` (the CLI), `packages/init` (`init`/`update`), `java/` (capture agent and Limbo plugin, Liquibase runner, testkit and its in-game runner), `devcontainer/`, `docs/`.

## Principles

1. **Generic core, projects extend.** Nothing here names a project. A project's commands, server types, template variables and hooks live in its `.mcdevtools/extensions/`; if the extension API cannot express what a project needs, add the missing registry or hook ([docs/extensions.md](docs/extensions.md)).
2. **Same experience everywhere.** Prompting, output style and `--no-input` behavior are uniform ([docs/tool.md](docs/tool.md#output-style)).
3. **Old data keeps working.** Capture dumps, profiles, configs and the test environment file are versioned and older versions stay readable (or are rejected with a message that says which tool to update).
4. **Say what was verified.** Typecheck and tests prove it compiles; run the flow in a real project and report what you could not.

## Making a change

1. Find the page in [docs/](docs/tool.md) for what you are changing and a similar module; copy its structure.
2. Change the code. Erasable TypeScript only, relative imports end in `.ts`, print through `output.ts`, prompt through `prompt.ts`.
3. `pnpm typecheck && pnpm test`; for Java `./gradlew spotlessApply build` (Spotless adds license headers and formats).
4. Try it in a project: [Testing a change in a real project](docs/tool.md#testing-a-change-in-a-real-project).
5. Update the docs in the same change (table in [AGENTS.md](AGENTS.md#documentation)).

## Releases

mcdevtools is consumed as a git submodule, so there is no publish step: projects update to a commit, branch or tag with `mcdev update [--ref <x>]`. Tag a release when the config format changes or a project needs a pinned, known-good version. A breaking change to the config needs a migration in `packages/init/lib/migrations.mjs`.

# mcdevtools

A local development network for Minecraft plugin projects, driven by one CLI (`mcdev`).

- Runs a proxy, backends and standalone servers from your working copy: downloads the servers and plugins, builds your project, deploys the jar, applies preset configs and supervises the consoles.
- Debugging and hot reload (JetBrains Runtime, HotswapAgent), zellij console workspaces, public tunnels, shareable setups.
- Packet capture on every server type (a plugin where there is a plugin API, a Java agent where there is not), with export to Flashback, ReplayMod, Sniffcraft and JSON lines.
- Optional PostgreSQL and Redis with seeded migrations (Liquibase built in).
- Server types: Purpur, Paper, Folia and other Paper forks, Velocity, BungeeCord, Waterfall, ViaProxy, Fabric, Forge, NeoForge, SpongeVanilla and Limbo, in networks with several proxies or standalone, each on its own JDK if needed.
- Extensible: a project adds its own commands, server types and hooks in TypeScript, in `.mcdevtools/extensions/`.

It was extracted from [ParadisuPlugin](https://github.com/Paradisu/ParadisuPlugin), which uses it as a git submodule.

## Add it to a project

In a git repository (the project's own build can be Gradle, but does not have to be):

```bash
npx github:Paradisu/mcdevtools init
```

This adds the submodule at `dev/`, creates `.mcdevtools/config.toml`, wires a pnpm workspace (for IDE support of extensions) and, in a Gradle project, an included build for the Java tools. Options: `--path`, `--ref`, `--extension <name>`, `--devcontainer`, `--no-gradle`, `--no-pnpm`, `--no-install` (see `--help`). Every step checks first, so running it again is safe.

Then edit `.mcdevtools/config.toml`: point `[build]` at your artifacts and `[[instances]]` at the servers you want.

```bash
mcdev setup     # resolve versions, download servers and plugins
mcdev start     # build, deploy, start; prints "Ready. Join at localhost:25565"
mcdev status
mcdev console lobby --send "plugins"
mcdev stop
```

`mcdev` is `dev/bin/mcdev`. The dev container image puts it on the `PATH` (`npx github:Paradisu/mcdevtools init --devcontainer` copies a ready-made `.devcontainer/`); elsewhere, run it by path or symlink it.

Update later with `mcdev update` (moves the submodule, re-applies the wiring, migrates the config format, stages the new commit).

## Requirements

Node 24+ and pnpm. The server runtimes, JetBrains Runtime 25, PostgreSQL client, zellij and sdkman are in the dev container image `ghcr.io/paradisu/mcdevtools-devcontainer`; outside it you provide Java (and `psql`/`zellij` if you use those features) yourself.

## Documentation

- [Development environment](docs/environment.md): commands, configuration, debugging, consoles, database, troubleshooting.
- [Extensions](docs/extensions.md): adding project-specific commands, server types, hooks.
- [Platforms](docs/platforms.md): the server types and how forwarding works.
- [Packet capture](docs/capture.md) and [sharing](docs/sharing.md).
- [Working on mcdevtools](docs/tool.md) and [CONTRIBUTING.md](CONTRIBUTING.md); coding agents: [AGENTS.md](AGENTS.md).

## License

AGPL-3.0, see [LICENSE](LICENSE).

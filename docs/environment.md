# Development environment

`mcdev` runs a network from your working copy: proxies, backends and standalone servers, optionally with PostgreSQL and Redis. This page is the reference. Related pages: [extensions](extensions.md) · [platforms](platforms.md) · [sharing](sharing.md) · [packet capture](capture.md) · [working on the tool](tool.md).

- [Getting started](#getting-started)
- [The `mcdev` command](#the-mcdev-command)
- [Configuring the network](#configuring-the-network)
- [Templates](#templates)
- [Debugging and hot reload](#debugging-and-hot-reload)
- [Consoles and logs](#consoles-and-logs)
- [Database and migration testing](#database-and-migration-testing)
- [Minecraft data tools](#minecraft-data-tools)
- [Troubleshooting](#troubleshooting)
- [The published image](#the-published-image)

## Getting started

1. In your project: `npx github:Paradisu/mcdevtools init` (see the [README](../README.md)). In a dev container (`--devcontainer` copies a ready-made configuration) `postCreateCommand` runs `mcdev bootstrap`, which builds the project, downloads the servers and, with `[db.migrations]`, seeds the database. It never fails container creation; fix the cause of any warning and run it again.
2. Edit `.mcdevtools/config.toml`: `[build]` (your artifacts) and `[[instances]]`.
3. `mcdev start`, then join `localhost:25565`. Starting servers means you accept the [Minecraft EULA](https://aka.ms/MinecraftEULA): set `accept_eula = true` in `.mcdevtools/config.local.toml` (gitignored; `config.local.toml.example` lists the common overrides). Online mode is on by default, so use a licensed account, or set `online_mode = false` to let any username join.

## The `mcdev` command

Run `mcdev` for a menu, a group name (`mcdev db`, `mcdev capture`, `mcdev share`, `mcdev mc`, `mcdev profile`, `mcdev web`) for that group's menu, `mcdev help` for all commands by section, `mcdev help <group|command>` (or `mcdev <command> --help`) for options. Extensions add commands and sections.

- **Prompting:** missing arguments are asked for on a terminal. With arguments, with `--no-input`, with `CI` set, with `MCDEV_NO_INPUT=1` or without a terminal, `mcdev` never prompts.
- **Destructive commands** (`db reset`, `db seed`, `db restore`, `capture rm`, `profile import`) take `--yes`; without a terminal and without it they refuse instead of waiting.
- **Colors** switch off for pipes, `NO_COLOR` and `TERM=dumb`.
- **Project:** `mcdev` finds the project from the working directory (the nearest `.mcdevtools/config.toml`); `MCDEV_PROJECT=<dir>` overrides it.

### Network

| Command | What it does |
| --- | --- |
| `mcdev bootstrap` | Build, download and seed (runs on container creation) |
| `mcdev setup [--refresh]` | Resolve versions and download servers and plugins into `.mcdevtools/.cache`, and install the sdkman JDKs the instances name |
| `mcdev build` | Run `[build].command`, and build the capture tools when capture is enabled |
| `mcdev start [names] [--no-build] [--ui]` | Build, deploy to every instance, apply preset configs and run them under the console supervisor. Prints `Ready. Join at ...` when done |
| `mcdev stop [names]` | Send the platform's stop command; the JVM is killed after 60 s |
| `mcdev restart [names] [--no-build]` | Stop, rebuild and start |
| `mcdev status` | Instances with type, state, pids and ports, and the sharing state |
| `mcdev console <name> [--read-only] [--wait]` | Attach to a console; Ctrl-C detaches and the server keeps running |
| `mcdev console <name> --send <line> [--timeout s]` | Run one console command without a terminal and print its output (default 3 s) |
| `mcdev logs <name> [-f] [--console]` | The last lines of the server's log (`-f` follows; `--console`: the raw console output) |
| `mcdev reset-world <name>` | Delete a stopped instance's worlds (types that have worlds) |
| `mcdev clean [--all]` | Delete `.mcdevtools/run` (`--all` also deletes `.mcdevtools/.cache`) |
| `mcdev update [--ref r]` | Update mcdevtools itself |
| `mcdev config migrate <file> [--out f]` | Convert a pre-mcdevtools `dev.toml` to the instances format |

### Consoles

| Command | What it does |
| --- | --- |
| `mcdev ui [layout\|kill] [--background]` | Open the zellij workspace of live consoles |
| `mcdev web start\|stop\|status` / `mcdev web token [--read-only]` | Serve that workspace to a browser ([details](sharing.md#browser-access-to-the-consoles-mcdev-web)) |

### Database (with `[db]`)

| Command | What it does |
| --- | --- |
| `mcdev db reset [--through id] [--all] [--no-fixtures] [--yes]` | Rebuild the database up to a changelog with seed data (`--all` also resets the other databases of `[db].databases`) |
| `mcdev db seed [--yes]` | Reseed at the current changelog position |
| `mcdev db snapshot <name>` / `mcdev db restore <name> [--yes]` | Save and restore the database |
| `mcdev db psql [args]` | Run psql against the main database |

`db reset` and `db seed` need `[db.migrations]`. `--no-fixtures` skips the `afterDbReset` hooks that extensions use to load data.

### Other groups

| Command | See |
| --- | --- |
| `mcdev share start\|stop\|status\|logs\|providers` | [Sharing](sharing.md#public-tunnels-mcdev-share) |
| `mcdev capture start\|stop\|status\|watch\|list\|show\|packet\|export\|formats\|rm\|protocol\|doctor` | [Packet capture](capture.md) |
| `mcdev profile export\|import\|inspect\|list`, `mcdev override <instance> <path>` | [Profiles](sharing.md#sharing-a-setup-profiles) |
| `mcdev mc nbt\|item\|encode\|uuid` | [Minecraft data tools](#minecraft-data-tools) |

## Configuring the network

The config is [`.mcdevtools/config.toml`](../packages/cli/scaffold/config.toml) (committed). Override anything in the gitignored `.mcdevtools/config.local.toml`: tables merge, and `[[instances]]`, `[[networks]]` and `[[plugins]]` entries merge by `name` / `key`, so a local file can flip `enabled` on one instance without restating it. Everything not set has a default; `format = 1` is the schema version that `mcdev update` migrates.

| Key / table | Controls |
| --- | --- |
| `accept_eula`, `public_host`, `online_mode` | EULA acceptance; the address clients use to reach this machine (proxies transfer players through it); proxy online mode (backends trust the forwarded identity) |
| `extensions` | Extension entry points: directories under `.mcdevtools/` (`"extensions/myproject"`) or packages resolvable from the project root. See [extensions](extensions.md) |
| `[versions]` | `minecraft = "auto"` or a version. `auto` reads the Gradle version catalog named in `[versions.auto]` (`catalog = "gradle/libs.versions.toml"`, `minecraft_from = "paper-api"`, `velocity_from = "velocity-api"`), so bumping `paper-api` updates the dev network too. Without a catalog, set it explicitly |
| `[build]` | `command = ["./gradlew", "-q", "shadowJar"]` run before every start; `[[build.artifacts]]` with `path` (relative to the project root) and `platforms` (plugin families `paper`, `velocity`, `limbo`): copied into matching instances on every start |
| `[java]` | `enhanced_redefinition`, `hotswap_agent`, `hotswap_plugins`, `extra_flags`, and `[java.defaults]` (JDK per instance type) |
| `[db]`, `[db.migrations]`, `[redis]` | See [Database](#database-and-migration-testing). Without `[db]` nothing database-related exists and `start` does not wait for PostgreSQL |
| `[[networks]]` | `name`, `forwarding` (`auto`, `modern`, `legacy`, `none`), optional `online_mode` |
| `[[instances]]` | One server process: see below |
| `[[plugins]]` | Downloaded plugins: see below |
| `[ui]`, `[web]` | zellij layout and session (the session defaults to the project folder's name); web console port and bind |
| `[share]` | Tunnel provider, targets (default: every proxy and standalone instance), renewal, PROXY protocol |
| `[capture]` | Packet capture: `enabled`, `gzip_level`, `max_size`, `queue_capacity` |

### Instances and networks

An instance has a `name` (also its folder under `.mcdevtools/run/`), a `type` ([platform](platforms.md): `purpur`, `paper`, `folia`, `paper-fork`, `velocity`, `waterfall`, `bungeecord`, `viaproxy`, `fabric`, `forge`, `neoforge`, `sponge`, `limbo`), `port`, `debug_port` (JDWP), `memory`, `enabled`, `first_start_commands`, and optionally:

- `network = "<name>"`: part of that network. A proxy needs one; a backend in a network is listed in its proxy's server list (`try = true` puts it in the `try` order); an instance without a network is **standalone** (Limbo, or any server you want to start but not route to).
- `version`, `build`: `"auto"` (the default) or an exact value to pin: a Minecraft version / build number for `purpur`, `paper` and `folia`, a Velocity version / build id for `velocity`, a Limbo build for `limbo`.
- `java`: the JDK to run on, a sdkman candidate id or an absolute path ([platforms](platforms.md)); `[java.defaults]` sets one per instance type.
- `public_port`: the port clients use when it differs from `port` (a remapped container port).
- `world_preset` (backends): `redstone_ready` (flat: bedrock, 3 stone, 116 sandstone), `void` or `default`.
- Any other key is kept for extensions (`instance.config.extra`), for example a project-specific `context`.

A network may have several proxies, and `forwarding` is `auto`, `modern`, `legacy` or `none` (see [platforms](platforms.md)). Ports and names must be unique; `mcdev` validates this at startup and names the offending instance.

### Plugins

Add a `[[plugins]]` entry with `source`:

- `"modrinth"` (and `slug`; resolved for the current game version; `allow_prerelease` or `game_version_fallback` help when only betas or older tags exist),
- `"url"` (`url`, or `urls.<family>`),
- `"jenkins"` (`job_url`; its latest successful build is used, `artifact_pattern` picks the jar),
- `"github"` (`repo = "owner/name"`; the latest release's jar, `asset_pattern` picks the asset; set `GITHUB_TOKEN` to avoid the anonymous API rate limit),
- `"local"` (`path` relative to the project root),
- or a source an [extension](extensions.md) registered.

`platforms` lists the plugin families the jar is installed on (`paper` for Bukkit-family backends, `velocity`, `limbo`). Plugins that depend on each other must all be listed. `config_dir` names the plugin's data folder per family when it differs from the key.

## Templates

Preset configs are rendered into each instance on every start, overwriting what is there, so Paper and the plugins can rewrite their files but the templates always win. Edit the templates, not the files in `.mcdevtools/run`.

Layers, later ones win; each has the same layout:

1. mcdevtools' own (`packages/cli/templates`): the base config of each family (`proxy/`, `paper-common/`, `limbo/`).
2. The project's: `.mcdevtools/templates/` (committed).
3. Personal overrides: `.mcdevtools/templates.local/` (gitignored; `mcdev override <instance> <path>` saves a changed runtime file there; profiles carry them).

In each layer: `<base>/` (the instance's family base), `servers/<instance name>/` (one instance), and `plugins/<key>/<family>/` (copied into the plugin's data folder). Generate a plugin's real defaults by running it once, then trim them down.

`${NAME}` placeholders are filled from the variables below plus anything extensions add with `registerTemplateVars`:

| Variable | Value |
| --- | --- |
| `PROJECT_NAME` | The project folder's name |
| `SERVER_NAME`, `SERVER_PORT`, `PUBLIC_HOST` | The instance's name and port; `public_host` |
| `PROXY_PORT` | The instance's own port for a proxy; the network's proxy port for a backend |
| `PUBLIC_HOST_<NAME>`, `PUBLIC_PORT_<NAME>` | Public address of every instance (name upper-cased, `-` as `_`); a live `mcdev share` tunnel replaces it |
| `HAPROXY_PROTOCOL` | Whether this instance's tunnel sends PROXY protocol headers |
| `ONLINE_MODE`, `FORWARDING_MODE`, `FORWARDING_SECRET`, `FORWARDING_SECRET_FILE` | From the instance's network; the secret is generated once per network in `.mcdevtools/run/networks/<name>/` |
| `VELOCITY_SERVERS`, `VELOCITY_TRY` | The network's backends as Velocity `[servers]` lines and its `try` list |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_URL`, `REDIS_HOST` | From `MCDEV_DB_*` / `MCDEV_REDIS_HOST` |
| `LEVEL_TYPE`, `GENERATOR_SETTINGS` | From the instance's `world_preset` |

## Debugging and hot reload

Every instance listens for a debugger on its `debug_port`. Use **Run and Debug** in VS Code with an attach configuration per instance in `.vscode/launch.json` (give it a `projectName` so the debugger knows which Gradle project to build on hot replace). The image uses JetBrains Runtime with `-XX:+AllowEnhancedClassRedefinition` and `java.debug.settings.hotCodeReplace` is `auto`: edit a method and save, and VS Code pushes the recompiled class into the running server. Enhanced redefinition also allows adding and removing methods and fields. Resource changes need `mcdev restart <name>`, as does anything the debugger refuses to redefine.

Set `hotswap_agent = true` under `[java]` to additionally enable HotswapAgent. [hotswap.ts](../packages/cli/src/hotswap.ts) loads only the plugins the build needs (a dependency on `org.hibernate.orm` in the Gradle version catalog enables HibernateJakarta, plus two JVM-level fixes) and none on platforms that run none of your code; add more by name with `hotswap_plugins`.

## Consoles and logs

Every instance runs under a small detached supervisor (`mcdev _supervise <name>`, [supervisor.ts](../packages/cli/src/supervisor.ts)) that owns the JVM's stdin/stdout, writes `.mcdevtools/run/<name>/.dev/console.log` (the previous run is kept as `console.prev.log`; a crash leaves `exit.json` and `supervisor.log` next to it) and serves the console on a unix socket.

- `mcdev console <name>` attaches: it replays recent output, keeps a command history, and detaches on Ctrl-C or Ctrl-D without touching the server. Servers run with `-Dterminal.jline=false`, so there is no tab completion. `--read-only` only watches; `--wait` waits for the server and reconnects after a restart (what the zellij panes use).
- `mcdev console <name> --send "<command>"` runs one command without a terminal, prints what the console wrote during `--timeout` seconds (default 3, ANSI colors stripped when piped) and exits. It fails if the instance is not running or exits meanwhile. Commands that need a player sender cannot be run this way.
- `mcdev logs <name>` prints the last 200 lines of `.mcdevtools/run/<name>/logs/latest.log`; `--console` prints the supervisor's raw console log; `-f` follows (never exits).

`mcdev ui` opens a [zellij](https://zellij.dev) workspace made only of console clients, so closing or killing it (`mcdev ui kill`) never affects the servers. The default layout `network` has a *consoles* tab (proxies and standalone servers stacked, then one pane per enabled backend), a *db* tab (psql, with `[db]`) and a *shell* tab; `tabs` has one tab per instance. Layouts are generated from the enabled instances. Add your own as `.mcdevtools/layouts/<name>.kdl` (committed) or `.mcdevtools/layouts.local/<name>.kdl` (gitignored), then `mcdev ui <name>`. Inside zellij, `mcdev ui <layout>` adds the layout as a tab. Detach with Ctrl-o d; Ctrl-q closes the workspace (the servers keep running). Set `ui.default_layout` / `ui.session` in the config.

## Database and migration testing

```toml
[db]
kind = "postgres"
databases = ["app", "other"]   # the first is the main database; the rest are reset by `db reset --all` and dumped by profiles
required = true                # `start` waits for it

[db.migrations]
tool = "liquibase"             # built in; extensions can register others
search_path = "src/main/resources"  # changelog paths resolve against this directory (relative to the project root)
changelog = "db/migrations.xml"     # the master changelog, relative to search_path
seed_dir = "db/seed"                # relative to .mcdevtools

[redis]
enabled = true
```

Connection settings come from `MCDEV_DB_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASSWORD` and `MCDEV_REDIS_HOST` (defaults: `localhost`, `5432`, and the main database's name for name, user and password). The dev container's compose file sets them for its `postgres` and `redis` services.

Seed data lives in `<seed_dir>/<id>.sql`, one file per changelog (the file name without its extension), written against the schema as of that changelog. `mcdev db reset` applies each changelog with the migration tool, loads its seed, then `local.sql` if present (personal rows, gitignored by convention), runs the `afterDbReset` hooks and finally checks that no already-applied changeset would be re-run.

To test a new changelog against realistic data:

1. `mcdev db reset --through <previous changelog>`
2. `mcdev start`: your application applies the new changelog on startup, as in production.

When you add a changelog that changes data shape, add `<seed_dir>/<id>.sql` for the new columns or tables.

The built-in `liquibase` tool is the runner in [`java/liquibase-runner`](../java/liquibase-runner): it reads changelogs from `search_path` (not from your project's classpath) and needs no dependency on your build. The first `db reset` builds it with Gradle.

## Minecraft data tools

`mcdev mc` decodes Minecraft's binary formats; the part that reads a project's own database schema is added by that project's extension.

- `mcdev mc nbt <file|->` decodes gzip/zlib/plain NBT, `.mca` chunks (`--chunk x,z`) and has shortcuts `playerdata:<player>@<server>` and `level:<server>` (`--path Data.LevelName`, `--format json` for jq). Player names resolve through the project's player resolver (an extension can register one); without one, use a UUID or `offline:<name>`.
- `mcdev mc item <base64|hex|@file|->` decodes an item blob (a single item or an array, as Paper's `ItemStack#serializeAsBytes` / `#serializeItemsAsBytes` write them); `mcdev mc encode '<snbt>' [--array]` produces one. Items are stamped with the DataVersion of the downloaded server jar (`data_version` in the config overrides it).
- `mcdev mc uuid <name|uuid|[I;…]>` converts UUID forms (dashed, undashed, int array, most/least), computes the offline-mode UUID and looks the player up at Mojang (`--offline` skips the network).

The codecs ([packages/cli/src/mc](../packages/cli/src/mc)) are covered by tests. Extensions import them from `@mcdevtools/cli/mc`.

## Troubleshooting

- **"additional privileges requested" in the Dev Containers log:** newer Docker Compose builds through bake, which refuses the Dockerfile the devcontainer CLI generates in `/tmp`. Build the image yourself (`docker build -f dev/devcontainer/Dockerfile -t mcdevtools-devcontainer:local dev`) and run it with an image-only compose service. If you add a `build:` section to a compose service, set `BUILDX_BAKE_ENTITLEMENTS_FS=0` (or `COMPOSE_BAKE=false`) in the environment VS Code was started from.
- **Gradle hangs for two minutes and fails with "The settings are not yet available":** another Gradle process was holding lock files in a shared `.gradle` directory. The compose template mounts container-only volumes over `.gradle`, so a Gradle daemon or Java extension on the host no longer interferes.
- **Gradle fails with "Cannot create directory '…/.gradle/…'":** the container user's UID was changed to match yours (as on GitHub runners) or Docker created the volume as root, so it is not writable. `mcdev bootstrap` and every Gradle run `mcdev` makes repair the known `.gradle` directories (`<project>/.gradle`, `build-logic/.gradle`, and the same two under `dev/java`) with `sudo chown`. To start over, remove the volumes with the container stopped.
- **"Supplied javaHome is not a valid folder: /home/<you>/.sdkman/…" in the container:** a Java extension on the host wrote `.project`, `.classpath` and `.settings/` (with your host `java.home`) into the shared checkout. Set `java.import.generatesMetadataFilesAtProjectRoot` to `false` (the template does), delete the files, run **Java: Clean Java Language Server Workspace** in the container and reload.
- **A plugin fails with `UnsatisfiedLinkError … libX11.so.6`:** the image has no X11 libraries and a `DISPLAY` forwarded into the container (WSLg) makes the JDK try the X11 toolkit. `mcdev` starts every server with `-Djava.awt.headless=true`; if you start one by hand, add it too.
- **`mcdev`/`gradlew` say `bad interpreter` / `not found` on Windows:** Git converted the shell scripts to CRLF. Force LF for `*.sh`, `gradlew` and `bin/mcdev` in the project's `.gitattributes` (mcdevtools' own does), then re-checkout. Clone into the WSL filesystem for fast file access in the container.
- **`mcdev bootstrap` printed warnings:** it never fails container creation. Fix the cause (usually no network) and run it again; it is safe to repeat.
- **A server does not stop:** `mcdev stop` sends the stop command and kills the JVM after 60 seconds. Look at `mcdev console <name>` or `mcdev logs <name> --console` for what it is waiting on.
- **`mcdev status` says stopped but a java process is running:** the supervisor died (its crash output is in `.mcdevtools/run/<name>/.dev/supervisor.log`). Kill the java process and start again. Stale pid files after a container restart are cleaned automatically.
- **zellij says the socket path is too long:** set `ZELLIJ_SOCKET_DIR` to a short directory such as `/tmp/zj`.
- **"No .mcdevtools/config.toml":** you are outside the project, or it is not set up: `npx github:Paradisu/mcdevtools init`.
- **Capture misbehaves:** run `mcdev capture doctor` ([details](capture.md#troubleshooting)). **Sharing problems:** see [sharing.md](sharing.md).

## The published image

[`.github/workflows/devcontainer.yml`](../.github/workflows/devcontainer.yml) builds the image for amd64 and arm64, smoke-tests it, and publishes it to `ghcr.io/paradisu/mcdevtools-devcontainer` (`latest` from the default branch, branch and commit tags, and a weekly rebuild for Debian updates). Besides JetBrains Runtime 25, Node, pnpm, zellij, `psql` and the GitHub CLI it has [sdkman](https://sdkman.io) (`SDKMAN_DIR=/usr/local/sdkman`) for servers that need another JDK: JetBrains Runtime stays the default Java. The `mcdev` wrapper in the image finds the project and runs the checkout's own launcher, so every project uses the mcdevtools version it pinned. To test an image change before it is merged, set `MCDEVTOOLS_DEVCONTAINER_TAG=<branch>` in `.devcontainer/.env`. Pinned versions (JetBrains Runtime, Node, pnpm) are `ARG`s at the top of the [Dockerfile](../devcontainer/Dockerfile); keep `PNPM_VERSION` equal to `packageManager` in `package.json`.

# Platforms

A **platform** is a kind of server `mcdev` can run: how to find and download its jar, how to start and stop it, how to tell it is ready. An `[[instances]]` entry selects one with `type`. Part of the [development environment](environment.md).

## Built in

| `type` | Role | Plugin family | Download | Stop / ready | Notes |
| --- | --- | --- | --- | --- | --- |
| `purpur` | backend (server) | `paper` | [Purpur](https://purpurmc.org) API, newest build for the Minecraft version | `stop` / `Done (` | A Paper fork, like most production servers. `version` is the Minecraft version, `build` a Purpur build number |
| `velocity` | proxy | `velocity` | [PaperMC Fill](https://fill.papermc.io), newest build of the version derived from the catalog | `shutdown` / `Done (`; reload with `velocity reload` | Modern forwarding. `version` e.g. `4.2.1-SNAPSHOT`, `build` a Fill build id |
| `limbo` | standalone server | `limbo` | [Modrinth `limbo-server`](https://modrinth.com/mod/limbo-server) | `stop` / `Limbo server listening` | A lightweight waiting-room server. Built for exactly one Minecraft version per release; starts first. No HotswapAgent, no project artifacts, no EULA |

**Roles.** A *proxy* fronts a [network](environment.md#instances-and-networks); a *server* is a backend (when it has `network = ...`) or standalone. Start order is fixed: standalone servers, then proxies (which may run database migrations before they bind their port), then backends.

**Plugin families** are what `[[plugins]] platforms` and `[[build.artifacts]] platforms` name, and what `plugins/<key>/<family>/` template folders are named after. `paper` covers every Bukkit-family backend, so a new Paper fork reuses all existing plugin configs.

**Forwarding.** A network's secret is generated once and shared by its proxy and backends (`${FORWARDING_SECRET}` and `${FORWARDING_SECRET_FILE}` in templates). Only `modern` forwarding is supported today.

**Limits today.** At most one proxy per network; no Fabric, Forge, Sponge, Folia, BungeeCord or ViaProxy yet. They can be added by an [extension](extensions.md) with `registerPlatform`, or to the core in `packages/cli/src/platforms/`: copy `purpur.ts`, add its resolver and launch details, register it in `platforms/index.ts`, and add a base template folder if its family is new. Packet capture needs the platform's netty pipeline layout in `java/capture` ([how it works](capture.md#how-it-works-and-extending-it)).

## Writing a platform

`PlatformDef` ([types.ts](../packages/cli/src/platforms/types.ts)) lists everything the CLI asks:

- `resolve(ctx, instance)` returns the artifact to download (`name`, `url`, a checksum when the API gives one, `version`, `build`). `ctx.minecraft()` is the network's Minecraft version and `ctx.catalog()` the project's Gradle version catalog.
- `cacheName` is the file name in `.mcdevtools/.cache/servers`; instances with the same type, version and build share one download.
- `family`, `role`, `startOrder`, `stopCommand`, `readyPattern` (a regular expression over the log), `timestampedLogs`, `waitForPort`, `terminalFlags` and `nogui` (launch flags), `hotswap`, `worlds`, `installsProjectArtifacts`, `needsEula`, and an optional `reloadCommand`.

Test a new platform with `mcdev setup`, `mcdev start <name>`, `mcdev capture doctor <name>`.

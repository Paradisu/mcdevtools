# Platforms

A **platform** is a kind of server `mcdev` can run: how to find and download its jar, how to start and stop it, how to tell it is ready. An `[[instances]]` entry selects one with `type`. Part of the [development environment](environment.md).

## Built in

| `type` | Role | Plugin family | Download | Stop / ready | Notes |
| --- | --- | --- | --- | --- | --- |
| `purpur` | backend (server) | `paper` | [Purpur](https://purpurmc.org) API, newest build for the Minecraft version | `stop` / `Done (` | A Paper fork, like most production servers. `version` is the Minecraft version, `build` a Purpur build number |
| `paper` | backend | `paper` | [PaperMC Fill](https://fill.papermc.io) `paper`, newest build for the Minecraft version | `stop` / `Done (` | `version` is the Minecraft version, `build` a Fill build id |
| `folia` | backend | `paper` | PaperMC Fill `folia` | `stop` / `Done (` | Regionised multithreading: plugins must declare `folia-supported: true` (the capture plugin does) |
| `paper-fork` | backend | `paper` | The `jar` key of the instance: a path relative to the project root (copied again on every `mcdev setup`) or an `https://` URL | `stop` / `Done (` | Any other Paper-like server (Pufferfish, Leaf, your own build). `version` is only a label |
| `waterfall` | proxy | `bungee` | PaperMC Fill `waterfall` (newest version) | `end` / `Listening on`; reload `greload` | Legacy forwarding. Waterfall is end-of-life: its command modules (`/glist`, ...) can no longer be downloaded, so prefer `bungeecord` |
| `bungeecord` | proxy | `bungee` | BungeeCord's Jenkins (`hub.spigotmc.org`), last successful build or `build = "<n>"` | `end` / `Listening on`; log `proxy.log.0` | Legacy forwarding |
| `viaproxy` | proxy | `viaproxy` | GitHub releases of [ViaVersion/ViaProxy](https://github.com/ViaVersion/ViaProxy) | `stop` / `Binding` | Lets clients of other versions join. Forwards to `target = "<instance>"` (default: another proxy, else a backend, of its network); `target_version = "..."` is passed as `--target-version`. Takes no part in forwarding |
| `fabric` | backend | `fabric` | [Fabric meta](https://meta.fabricmc.net) server launcher (newest stable loader and installer); `build` pins the loader | `stop` / `Done (` | Mods in `mods/`, configs in `config/`. Forwarding `none` |
| `forge` | backend | `forge` | Forge installer (`promotions_slim.json`: `build = "latest"`, `"recommended"` or a Forge version), run once with `--installServer` | `stop` / `Done (` | Forge 1.17 and newer. Forge often lags Minecraft: set `version = "<minecraft version>"` on the instance. Needs the JDK its Minecraft version needs (`java = "..."`) |
| `neoforge` | backend | `neoforge` | NeoForge installer from `maven.neoforged.net` (`1.21.4` is `21.4.x`, `26.3` is `26.3.0.x`; betas only if nothing else exists), run once with `--installServer` | `stop` / `Done (` | As Forge |
| `sponge` | backend | `sponge` | SpongeVanilla `universal` jar from `dl-api.spongepowered.org` for the Minecraft version | `stop` / `Done (` | Mods in `mods/`, configs in `config/` |
| `velocity` | proxy | `velocity` | [PaperMC Fill](https://fill.papermc.io), newest build of the version derived from the catalog | `shutdown` / `Done (`; reload with `velocity reload` | Modern forwarding. `version` e.g. `4.2.1-SNAPSHOT`, `build` a Fill build id |
| `limbo` | standalone server | `limbo` | [Modrinth `limbo-server`](https://modrinth.com/mod/limbo-server) | `stop` / `Limbo server listening` | A lightweight waiting-room server. Built for exactly one Minecraft version per release; starts first. No HotswapAgent, no project artifacts, no EULA |

**Roles.** A *proxy* fronts a [network](environment.md#instances-and-networks); a *server* is a backend (when it has `network = ...`) or standalone. Start order is fixed: standalone servers, then proxies (which may run database migrations before they bind their port), then backends.

**Plugin families** are what `[[plugins]] platforms` and `[[build.artifacts]] platforms` name, and what `plugins/<key>/<family>/` template folders are named after. `paper` covers every Bukkit-family backend, so a new Paper fork reuses all existing plugin configs.

**Forwarding.** A network's secret is generated once and shared by all its proxies and backends (`${FORWARDING_SECRET}` and `${FORWARDING_SECRET_FILE}` in templates). The mode comes from the network's `forwarding` (`auto`, `modern`, `legacy` or `none`): `auto` takes the best mode every member supports (modern, then legacy, then none), and an explicit mode that a member cannot do is reported by name. Velocity and the Bukkit-family backends can do all three (`legacy` sets `bungeecord: true` in `spigot.yml`), BungeeCord and Waterfall only legacy, Limbo, ViaProxy and the mod loaders none. With `none` the backends run in offline mode behind the proxy, so players get offline UUIDs.

**Several proxies.** A network may have any number of proxies (each with its own port, debug port and share target); every proxy routes to the same backends. In capture output the backends' peer is then just `proxy`, since a backend connection alone does not say which proxy it came from.

**JDKs.** `java = "<id>"` on an instance (or `[java.defaults] <type> = "<id>"`) runs it on another JDK: a [sdkman](https://sdkman.io) candidate id such as `21.0.13.1+2-tem` (see `sdk list java`), or an absolute `JAVA_HOME`. `mcdev setup` installs missing sdkman candidates (`mcdev start` offers to on a terminal, and otherwise fails with the exact `sdk install` command); sdkman's default JDK is never changed. The hot-reload flags (enhanced redefinition, HotswapAgent) are only used on a JDK that accepts them (JetBrains Runtime), and the capture plugin, which is built for Java 25, is only installed on Java 25 or newer.

**Packet capture** works on `purpur`, `paper`, `folia`, `paper-fork`, `velocity` and `limbo` (the capture plugin installs only there); `mcdev capture` leaves the other platforms out. Supporting another needs its netty pipeline layout in `java/capture` ([how it works](capture.md#how-it-works-and-extending-it)).

**Limits today.** Forge and NeoForge older than 1.17 (the `unix_args.txt` launch style), forwarding for the mod loaders (it needs a mod on the backend), and hot reload on anything but the Bukkit family.

## Writing a platform

`PlatformDef` ([types.ts](../packages/cli/src/platforms/types.ts)) lists everything the CLI asks:

- `resolve(ctx, instance)` returns the artifact to download (`name`, `url`, a checksum when the API gives one, `version`, `build`). `ctx.minecraft()` is the network's Minecraft version and `ctx.catalog()` the project's Gradle version catalog.
- `prepare` (installers) and `launch` (custom arguments), `pluginsDir` / `configDir` (`mods`, `config`), `forwarding`, `capture`, `logFile` and `launch` are optional. `cacheName` is the file name in `.mcdevtools/.cache/servers`; instances with the same type, version and build share one download.
- `family`, `role`, `startOrder`, `stopCommand`, `readyPattern` (a regular expression over the log), `timestampedLogs`, `waitForPort`, `terminalFlags` and `nogui` (launch flags), `hotswap`, `worlds`, `installsProjectArtifacts`, `needsEula`, and an optional `reloadCommand`.

Test a new platform with `mcdev setup`, `mcdev start <name>`, `mcdev capture doctor <name>`.

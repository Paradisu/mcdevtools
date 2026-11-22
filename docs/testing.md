# Testing with bots (`mcdev bot`, `mcdev test`)

Headless Minecraft players for the development network: join, chat, run commands, walk, open and click menus, and read what the server sent back. They are driven from the shell (`mcdev bot`), from JUnit tests (`mcdev test run`), or from the in-game manual runner (`mcdev manual`). Bots speak the **latest protocol only** (MCProtocolLib, kept in step with the Minecraft version of the project). Related pages: [environment](environment.md) · [packet capture](capture.md) · [extensions](extensions.md) · [working on the tool](tool.md).

- [Quick start](#quick-start)
- [Bots](#bots)
- [JUnit tests](#junit-tests)
- [Running tests and reading results](#running-tests-and-reading-results)
- [Packet captures and replays](#packet-captures-and-replays)
- [Manual tests](#manual-tests)
- [GameTests](#gametests)
- [Online mode and accounts](#online-mode-and-accounts)
- [After a Minecraft update](#after-a-minecraft-update)
- [Configuration](#configuration)
- [How it works, and extending it](#how-it-works-and-extending-it)
- [Limits and troubleshooting](#limits-and-troubleshooting)

## Quick start

```bash
mcdev start
mcdev bot start alice --to lobby --via direct   # a player named alice joins the lobby backend
mcdev bot do alice msg "hello"                  # chat
mcdev bot do alice cmd list                     # run a command
mcdev bot do alice chat 5                       # what alice has read
mcdev bot do alice gui                          # the open menu and its items
mcdev bot stop --all
```

Every `bot do` prints plain text and exits 1 when the command failed, so a script or an LLM can use it without parsing.

## Bots

### How a bot joins

| Route | When | Needs |
| --- | --- | --- |
| **Direct** (`--via direct`, `via(Via.DIRECT)`) | A backend of a network with Velocity modern or legacy forwarding, or a standalone server | Nothing: the bot **forges the proxy's player forwarding** with the network's secret (`.mcdevtools/run/networks/<net>/forwarding.secret`), so any name works and the proxy's online mode does not matter |
| **Proxy** (`--via proxy`) | The network's proxy, to test what the proxy does (transfers, commands, routing) | An offline-mode proxy, or a [Microsoft account](#online-mode-and-accounts) |

Default target: an offline-mode proxy when one runs, otherwise the first running backend directly (never an online-mode proxy without an account, and never a standalone server while a backend runs). Bots follow **transfers** (for example to Limbo and back) and answer cookie requests.

Bots are real players. The server keeps their data **by name**: an inventory, a LuckPerms entry or a plugin's database row from an earlier run is still there. Give a test a fresh name when it counts items, or clean up in `@AfterEach`.

### Commands

`mcdev bot start <name> [--to instance] [--via proxy|direct] [--account name] [--wait s]` starts a bot process and waits for the join; `bot do <name> <command...>` sends it one command (`--json` for the raw reply, `--timeout s`; options go before the command); `bot list`, `bot stop [name|--all]`, `bot logs <name>`. State lives in `.mcdevtools/run/.test/bots/<name>/`.

| Bot command | What it does |
| --- | --- |
| `status` | Connection, server, position, health, game mode, open screen |
| `msg <text>` (or a leading `.`), `cmd <command>` (or a leading `/`) | Chat, run a command |
| `chat [n] [--since seq]`, `wait-chat <regex> [s]` | Chat, system messages, action bar, titles and the disconnect reason, with sequence numbers; wait for a line |
| `packets [n] [--type text] [--dir in\|out]`, `wait-packet <Name> [s]`, `events [n]` | Recent packets (movement and chunk data are only counted), wait for one, connection events |
| `gui [--tooltip slot]`, `menu inventory` | The open container with every item (id, count, name, lore), or the player's inventory |
| `click <slot> [left\|right\|shift\|shift-right\|drop\|drop-stack\|hotbar:<1-9>]`, `text "<s>"`, `sign <l1> ...`, `close` | Click a slot (the server's answer is awaited), type into an anvil, write a sign, close |
| `dialog`, `action <id>` | The last server dialog (raw) and a custom click action |
| `move <x> <y> <z>`, `look <yaw> <pitch>`, `hotbar <0-8>`, `use`, `interact <x> <y> <z> [face]`, `break <x> <y> <z>`, `attack <entityId>`, `drop` | Move in a straight line, turn, use the held item, click or break a block, attack |
| `sidebar`, `tab`, `bossbars`, `title` | Scoreboard sidebar, tab list, boss bars, last title, as text |
| `connect [instance]`, `disconnect`, `quit` | Join again, leave, stop the bot process |

### Limits

No world model, physics or pathfinding (a move is a straight line at 0.2 blocks per tick; the server decides what is valid), no rendering, chat is unsigned (the dev backends do not enforce secure chat), dialogs are not interpreted. A click is not predicted: after `click`, wait for the server's updates (`Screen.await` in Java, or `gui` again), because one click usually causes several.

## JUnit tests

Tests live in your project and depend on the testkit through the included build (`includeBuild("dev/java") { name = "mcdevtools" }`):

```kotlin
// integration-tests/build.gradle.kts
testing {
    suites {
        register<JvmTestSuite>("integrationTest") {
            useJUnitJupiter(libs.versions.junit)
            dependencies { implementation("net.paradisu.mcdevtools:testkit") }
            targets.all { testTask.configure { outputs.upToDateWhen { false } } }
        }
    }
}
```

Keep the suite out of `check`: it needs a running network. A project repository that resolves the testkit's dependencies must allow their repositories (`repo.opencollab.dev` for `org.geysermc.mcprotocollib`, `org.cloudburstmc.math` and `com.nukkitx.fastutil`).

```java
@McDevTest
class WarpTest {
    @Test
    void warpTeleports(Network network, Bots bots) {
        Bot bot = bots.join(BotOptions.named("itWarp").target("lobby").via(Via.DIRECT));
        McAssertions.assertConsole(network.instance("lobby"), "lp user itWarp permission set paradisu.warp true", "itWarp");
        McAssertions.assertChat(bot, "Teleported", () -> bot.command("warp spawn"));
    }
}
```

| | |
| --- | --- |
| `@McDevTest` | Class annotation. Provides the parameters `Network`, `Bots`, `Artifacts` and `TestEnvironment`; runs tests on one thread (a capture session is per instance) |
| `Network` | `instance(name)` gives a console (`console(cmd)`, `console(cmd, pattern, timeout)`), `consoleOutput()`, `logLines()` since the test began |
| `Bots` | `join(name)`, `join(BotOptions)`, `joinAll(n, prefix)`; all bots are disconnected after the test |
| `Bot` | `chat`, `command`, `chat()` / `packets()` / `events()` logs with `mark()`, `since`, `await`; `screen()`, `inventory()`, `click`, `awaitScreen`, `moveToAndWait`, `sidebar()`, ... |
| `McAssertions` | `assertChat`, `assertNoChat`, `assertPacket`, `assertConsole`, `assertLog`; failures list what did arrive |
| `@AllowLog("regex")` | Excuse log lines from the error check (class or method) |
| `@OnInstances("lobby")` | Limit what is recorded and checked to these instances |
| `@Capture(mode, export)` | Override the [capture](#packet-captures-and-replays) of a test |
| `@ManualReview("what to look at")` | Also have a person look at it: capture always kept and exported, pending until `mcdev test review` |
| `GameTests.run(instance, selector, timeout, quiet)` | Run `/test run` and fail on the reporter's failure lines ([GameTests](#gametests)) |

Log and chat marks matter: take `chat().mark()` before acting and wait only for lines after it, so earlier traffic never satisfies an assertion (`assertChat(bot, regex, action)` does this for you).

**The log check.** After each test the console and log of every recorded instance are read; a line matching `[test] log_fail_patterns` (default `\bERROR\b` and `Exception`, with the stack trace that follows) fails the test unless it matches `log_ignore_patterns` or an `@AllowLog`.

**Evidence.** Every test writes `.mcdevtools/test-results/<run>/<Class>/<method>/`: `console-<instance>.txt`, `log-<instance>.txt`, `bot-<name>-chat.txt`, `-packets.txt` (the last 500) and `-events.txt`, and `artifacts.json` (status, failure, log errors, capture id and export paths, review). An LLM can read these straight from disk.

## Running tests and reading results

| Command | What it does |
| --- | --- |
| `mcdev test run [--tests pattern] [--capture mode] [--export formats] [--no-start]` | Start the network if nothing runs, run `[test] command` with the environment in `MCDEV_TEST_ENV`, read the JUnit reports and write `summary.json`. Exits 1 on a failure |
| `mcdev test results [run] [--json]` | The table, and for every failure the message, log and console excerpts, evidence folder and replay files. `latest` by default |
| `mcdev test review [run] [Class#method pass\|fail --note text]` | List tests that await a manual review, or record the verdict |
| `mcdev test env [--json]` | The environment the tests read: instances, ports, sockets, logs, online mode |
| `mcdev test doctor` | [After a Minecraft update](#after-a-minecraft-update) |

From an IDE no wrapper is needed: the testkit finds the project by walking up to `.mcdevtools/config.toml` and asks `mcdev test env --json` (or reads `MCDEV_TEST_ENV` / `-Dmcdevtools.test.env`).

## Packet captures and replays

Each test records a [packet capture](capture.md) of its instances (needs `[capture] enabled = true`; without it the test runs and `artifacts.json` says why there is none). `[test] capture` decides what is kept: `on-failure` (default: a failing test keeps its capture), `always` or `never`; `[test] export` lists the formats made from a kept capture (`flashback`, `replaymod`, `sniffcraft`, `jsonl`), filtered to the test's bots. Open a Flashback or ReplayMod export in a client on the same Minecraft version to watch what happened. `--capture` and `--export` on `test run` override the config; `capture start|stop|export` take `--json` for scripts.

## Manual tests

Write a manual test only when a person has to judge it: how something looks or feels, or what a real client does with it (clicking chat, rendering, sounds, pacing). Anything a bot can check, such as command results, permissions, chat delivery, menus, sync and transfers, belongs in a JUnit test, where it runs on every change; a manual test for it is slower and checks less. If you can write the expected result as an assertion, write the assertion.

Suites are `.mcdevtools/tests/manual/<suite>.toml` (`[test] manual_dir`):

```toml
title = "Chat"
on = "lobby"                       # optional: the instance whose runner is used
[[tests]]
id = "list-click"
title = "The warp list reads as clickable and a click warps"
setup = ["lp user {player} permission set paradisu.warp true"]   # console commands; {player} is the tester
steps = ["Run /warps", "Could a new player tell the names can be clicked?", "Click one name"]
expect = "The names are easy to tell apart, and the click teleports you or says why it cannot"
cleanup = ["lp user {player} clear"]
```

Set `[test] in_game = true` and restart the Paper instances: the runner plugin (`java/testkit-paper`, `/mcdevtest`) is installed and builds with `mcdev build`. Then:

```bash
mcdev manual list
mcdev manual run smoke --player alice          # alice joins; the run starts
```

Each test appears in chat with **[PASS] [FAIL] [SKIP] [REDO]** buttons (or `/mcdevtest pass|fail|skip|redo`). FAIL asks for a note in chat. REDO runs cleanup and setup again. Buttons carry the test number, so a stale click is rejected. The command prints each verdict as it comes, records **one capture of the whole run** (kept and exported when a test fails or with `--capture always`; start it before the player joins for a replay that opens), and writes `summary.json` and `manual-<suite>.xml`. Ctrl-C ends the run and keeps the verdicts. `/mcdevtest list|run <suite> [test]|status|abort` also starts runs from inside the game; those are written to the same results folder. For a person to review something automated, use `@ManualReview` instead.

## GameTests

- **Any server (Paper, Purpur, ...):** `GameTests.run(network.instance("lobby"), "mymod:*", Duration.ofMinutes(2), Duration.ofSeconds(5))` runs vanilla's `/test run` and fails on the reporter's `<test> failed at <pos>!` lines, on a selector that matches nothing and on "No tests to run". Vanilla reports through the console, so a run counts as finished when the console has been quiet for `quiet`.
- **Fabric:** `mcdev test gametest <instance> [--selector filter]` starts a dedicated instance (give it `enabled = false` so `mcdev start` skips it) with `-Dfabric-api.gametest`, `-Dfabric-api.gametest.report-file` and the filter, waits for it to stop, and reads the JUnit report into the same `summary.json` as other runs. Forge and NeoForge start their GameTest servers differently and are not wired.

## Online mode and accounts

Bots reach backends without an account (see [How a bot joins](#how-a-bot-joins)). To test through an online-mode proxy, sign a Microsoft account in once: `mcdev bot login <account>` prints a code to enter at microsoft.com/link, and saves the session under `.mcdevtools/.cache/accounts/` (owner-only, refreshed on use, never in the config or `env.json`). Then `mcdev bot start alice --to proxy --account <account>` or `Accounts.options(env, "<account>")` in Java. The bot takes the account's player name. Without an account an online-mode proxy is refused with a message that says so.

## After a Minecraft update

1. Bump `mcprotocollib` in `java/gradle/libs.versions.toml` to the build for the new Minecraft version (Maven metadata at `repo.opencollab.dev/main/org/geysermc/mcprotocollib/protocol/`).
2. `mcdev test doctor`: it compares the library's protocol number with the server's and joins every running instance. A mismatch names both versions.
3. `mcdev test run`: the integration tests are the regression check. If a bot misbehaves, `mcdev bot do <name> packets` and `mcdev capture` show what the server sent.

Protocol changes that already needed code: since 1.21.2 the server accepts one position packet per client tick and learns where a tick ends from `ServerboundClientTickEndPacket` (a bot that omits it is kicked with "Invalid move player packet received"); modern forwarding is answered in the login phase.

## Configuration

```toml
[test]
command = ["./gradlew", ":integration-tests:integrationTest"]   # run by `mcdev test run` (--tests pattern is appended)
reports = "integration-tests/build/test-results/integrationTest"  # glob (** and *) of the folders with the JUnit XML
capture = "on-failure"        # always | on-failure | never
export = ["flashback"]
log_fail_patterns = ["\\bERROR\\b", "Exception"]
log_ignore_patterns = []
in_game = false               # install the in-game manual test runner on Paper instances
manual_dir = "tests/manual"   # relative to .mcdevtools
```

All keys have defaults. `.mcdevtools/test-results/` is git-ignored (the managed block of `.gitignore`).

## How it works, and extending it

| Path | Role |
| --- | --- |
| `java/testkit` | The library and the `testkit` tool. `bot/` (`Bot`, `EventLog`, `ForwardingResponder`, `screen/`), `daemon/` (`BotDaemon`, `Commands`), `junit/` (extension, handles, assertions, `GameTests`), `capture/CaptureRecorder`, `auth/Accounts`, `env/` (`TestEnvironment`, `Protocol`), `net/` (`ConsoleClient`, `LogWatcher`), `cli/` (`doctor`, `login`) |
| `java/testkit-paper` | The in-game runner plugin: `ManualRun` state machine, `ControlServer` socket, `/mcdevtest` |
| `packages/cli/src/testing/` | `env.ts` (the environment file), `bot.ts`, `run.ts`, `results.ts`, `junit.ts`, `manual.ts`, `manual-run.ts`, `gametest*.ts`, `commands.ts` |

- **`env.json`** (`.mcdevtools/run/.test/env.json`, `format: 1`) is the only contract between the CLI and the Java side; `TestEnvironment.FORMAT` and `ENV_FORMAT` change together and the reader rejects other versions. `protocol.json` carries the item and entity names the bots use (regenerated once when it lacks them).
- **Bot daemon protocol:** newline-delimited JSON on a unix socket: `{"id":1,"line":"gui"}` returns `{"id":1,"ok":true,"output":"..."}` or `{"ok":false,"error":"..."}`. A new bot command is one `add(...)` in `daemon/Commands.java` (with a `help` text).
- **Runner protocol:** `{"cmd":"run","runId","suite","tests","player"}` streams `accepted`, `waiting`, `begin`, `verdict`, `done` events; `abort`, `status` and `list` answer once.
- Packet handlers of a bot run on the network thread: keep them quick and never block. Logs (`EventLog`) are bounded.

## Limits and troubleshooting

- **A bot is kicked with "Invalid move player packet received":** it moved without ending its client tick; see [After a Minecraft update](#after-a-minecraft-update). Check `mcdev bot do <name> events`.
- **"proxy is online-mode, so the bot needs a Microsoft account":** join a backend with `--via direct`, or sign an account in.
- **"Instance X is not running or not in scope":** start it (`mcdev start`), or check `@OnInstances`.
- **A test sees items or permissions it did not set up:** the player's data persists by name; use a new name per run.
- **A capture did not start:** another capture is running on that instance (`mcdev capture stop`), or `[capture] enabled` is false.
- **Replays of a mid-session capture do not open:** they lack the join; capture from before the player connects.
- Tests share the instances: one test at a time, and bots and plugins state outlive a test unless it cleans up.

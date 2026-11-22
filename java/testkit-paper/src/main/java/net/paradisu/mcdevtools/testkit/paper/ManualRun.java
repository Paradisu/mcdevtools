/*
 * mcdevtools: development tools for Minecraft plugin projects. Copyright (C) 2026 Paradisu. https://github.com/Paradisu/mcdevtools
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

package net.paradisu.mcdevtools.testkit.paper;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * One manual test run for one player: it shows each test in chat with clickable PASS / FAIL / SKIP / REDO buttons,
 * waits for the verdict, runs the test's setup and cleanup as console commands, and records the results.
 *
 * <p>All methods run on the server thread. Buttons carry the test's number, so a click on an earlier test's buttons is
 * ignored instead of answering the current test.
 */
final class ManualRun {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    /** A recorded verdict. */
    record Result(String test, String title, String result, String note, long durationMs) {}

    private enum State {
        WAITING_FOR_PLAYER,
        RUNNING,
        AWAITING_NOTE,
        DONE
    }

    private final McDevTestPlugin plugin;
    private final String runId;
    private final Suites.Suite suite;
    private final List<Suites.ManualTest> tests;
    private final String playerName;
    private final Path resultsDir;
    private final Consumer<JsonObject> events;
    private final List<Result> results = new ArrayList<>();
    private volatile State state = State.WAITING_FOR_PLAYER;
    private int index;
    private Instant testStarted = Instant.now();
    private final Instant runStarted = Instant.now();

    ManualRun(
            McDevTestPlugin plugin,
            String runId,
            Suites.Suite suite,
            List<Suites.ManualTest> tests,
            String playerName,
            Path resultsDir,
            Consumer<JsonObject> events) {
        this.plugin = plugin;
        this.runId = runId;
        this.suite = suite;
        this.tests = tests;
        this.playerName = playerName;
        this.resultsDir = resultsDir;
        this.events = events;
    }

    String playerName() {
        return playerName;
    }

    String runId() {
        return runId;
    }

    boolean done() {
        return state == State.DONE;
    }

    /** Whether the next chat message of the player is the note for a failed test (safe to ask from any thread). */
    boolean awaitingNote() {
        return state == State.AWAITING_NOTE;
    }

    /** Starts now when the player is online, otherwise when they join. */
    void start() {
        event("accepted", "total", tests.size(), "suite", suite.name(), "player", playerName);
        if (player() != null) {
            begin();
        } else {
            event("waiting", "player", playerName);
        }
    }

    private Player player() {
        return Bukkit.getPlayerExact(playerName);
    }

    /** The player joined this server. */
    void onJoin(Player joined) {
        if (!joined.getName().equalsIgnoreCase(playerName)) {
            return;
        }
        if (state == State.WAITING_FOR_PLAYER) {
            begin();
        } else if (state == State.RUNNING) {
            present(joined); // came back: show the current test again
        }
    }

    private void begin() {
        state = State.RUNNING;
        startTest();
    }

    private Suites.ManualTest current() {
        return tests.get(index);
    }

    private void startTest() {
        Suites.ManualTest test = current();
        testStarted = Instant.now();
        runAll(test.setup());
        event("begin", "index", index + 1, "total", tests.size(), "test", test.id(), "title", test.title());
        Player p = player();
        if (p != null) {
            present(p);
        }
    }

    private void runAll(List<String> commands) {
        for (String command : commands) {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command.replace("{player}", playerName));
        }
    }

    private void present(Player p) {
        Suites.ManualTest test = current();
        int n = index + 1;
        p.sendMessage(Component.empty());
        p.sendMessage(Component.text("Manual test " + n + "/" + tests.size() + " · ", NamedTextColor.GRAY)
                .append(Component.text(test.title(), NamedTextColor.GOLD, TextDecoration.BOLD)));
        for (int i = 0; i < test.steps().size(); i++) {
            p.sendMessage(Component.text("  " + (i + 1) + ". ", NamedTextColor.DARK_GRAY)
                    .append(Component.text(test.steps().get(i), NamedTextColor.WHITE)));
        }
        p.sendMessage(Component.text("  Expect: ", NamedTextColor.GREEN)
                .append(Component.text(test.expect(), NamedTextColor.WHITE)));
        p.sendMessage(button("[PASS]", NamedTextColor.GREEN, "pass", n, "It behaved as expected")
                .append(Component.text(" "))
                .append(button("[FAIL]", NamedTextColor.RED, "fail", n, "Something was wrong; you can describe it"))
                .append(Component.text(" "))
                .append(button("[SKIP]", NamedTextColor.GRAY, "skip", n, "Cannot test this now"))
                .append(Component.text(" "))
                .append(button("[REDO]", NamedTextColor.YELLOW, "redo", n, "Reset and show this test again")));
        p.sendActionBar(Component.text("Test " + n + "/" + tests.size() + " · " + test.id(), NamedTextColor.GOLD));
    }

    private static Component button(String label, NamedTextColor color, String verdict, int n, String hover) {
        return Component.text(label, color, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/mcdevtest " + verdict + " " + n))
                .hoverEvent(HoverEvent.showText(Component.text(hover, color)));
    }

    /**
     * A verdict from the player.
     *
     * @param verdict {@code pass}, {@code fail}, {@code skip} or {@code redo}
     * @param n the test number the button belonged to, or 0 for "the current test"
     * @return a message for the player when the verdict was not accepted, else null
     */
    String verdict(String verdict, int n) {
        if (state == State.AWAITING_NOTE) {
            return "Describe what went wrong in chat first (or type - for no note).";
        }
        if (state != State.RUNNING) {
            return "No test is waiting for a verdict.";
        }
        if (n != 0 && n != index + 1) {
            return "That was test " + n + "; the current test is " + (index + 1) + ".";
        }
        switch (verdict) {
            case "pass" -> finish("pass", "");
            case "skip" -> finish("skip", "");
            case "redo" -> {
                runAll(current().cleanup());
                startTest();
            }
            case "fail" -> {
                state = State.AWAITING_NOTE;
                Player p = player();
                if (p != null) {
                    p.sendMessage(
                            Component.text("What went wrong? Type it in chat (or - for no note).", NamedTextColor.RED));
                }
            }
            default -> {
                return "Unknown verdict " + verdict;
            }
        }
        return null;
    }

    /**
     * The player's next chat message after FAIL.
     *
     * @param message the text
     * @return true when the message was taken as the note
     */
    boolean onChat(String message) {
        if (state != State.AWAITING_NOTE) {
            return false;
        }
        finish("fail", message.equals("-") ? "" : message);
        return true;
    }

    private void finish(String result, String note) {
        Suites.ManualTest test = current();
        long ms = Duration.between(testStarted, Instant.now()).toMillis();
        runAll(test.cleanup());
        results.add(new Result(test.id(), test.title(), result, note, ms));
        event("verdict", "test", test.id(), "result", result, "note", note, "durationMs", ms);
        Player p = player();
        if (p != null) {
            p.sendMessage(Component.text("Recorded " + result + " for " + test.id(), NamedTextColor.GRAY));
        }
        index++;
        if (index >= tests.size()) {
            complete();
        } else {
            state = State.RUNNING;
            startTest();
        }
    }

    /**
     * Ends the run early; what was recorded so far is kept.
     *
     * @param reason why it ended
     */
    void abort(String reason) {
        if (state == State.DONE) {
            return;
        }
        if (state == State.RUNNING || state == State.AWAITING_NOTE) {
            runAll(current().cleanup());
        }
        event("aborted", "reason", reason);
        complete();
    }

    private void complete() {
        state = State.DONE;
        long pass = results.stream().filter(r -> r.result().equals("pass")).count();
        long fail = results.stream().filter(r -> r.result().equals("fail")).count();
        long skip = results.stream().filter(r -> r.result().equals("skip")).count();
        write();
        Player p = player();
        if (p != null) {
            p.sendMessage(Component.text(
                    "Manual run finished: " + pass + " passed, " + fail + " failed, " + skip + " skipped.",
                    fail > 0 ? NamedTextColor.RED : NamedTextColor.GREEN));
            p.sendActionBar(Component.empty());
        }
        event("done", "passed", pass, "failed", fail, "skipped", skip);
    }

    /**
     * Writes {@code <results>/<run>/summary.json} in the format {@code mcdev test results} reads, so a run started in
     * game is listed like any other. {@code mcdev manual run} overwrites it with capture information added.
     */
    private void write() {
        if (resultsDir == null) {
            return;
        }
        try {
            Path dir = resultsDir.resolve(runId);
            Files.createDirectories(dir);
            Map<String, Object> totals = new LinkedHashMap<>();
            totals.put(
                    "passed",
                    results.stream().filter(r -> r.result().equals("pass")).count());
            totals.put(
                    "failed",
                    results.stream().filter(r -> r.result().equals("fail")).count());
            totals.put(
                    "skipped",
                    results.stream().filter(r -> r.result().equals("skip")).count());
            List<Map<String, Object>> cases = new ArrayList<>();
            for (Result r : results) {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("className", suite.name());
                c.put("name", r.test());
                c.put("seconds", r.durationMs() / 1000.0);
                c.put(
                        "result",
                        r.result().equals("pass") ? "passed" : r.result().equals("fail") ? "failed" : "skipped");
                if (!r.note().isEmpty()) {
                    c.put("message", r.note());
                }
                cases.add(c);
            }
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("format", 1);
            doc.put("runId", runId);
            doc.put("kind", "manual");
            doc.put("startedAt", runStarted.toString());
            doc.put("durationMs", Duration.between(runStarted, Instant.now()).toMillis());
            doc.put("command", List.of("mcdevtest", "run", suite.name()));
            doc.put("totals", totals);
            doc.put("tests", cases);
            Files.writeString(dir.resolve("summary.json"), GSON.toJson(doc), StandardCharsets.UTF_8);
        } catch (IOException e) {
            plugin.getLogger().warning("Could not write the manual results: " + e.getMessage());
        }
    }

    /**
     * One line describing the run, for {@code /mcdevtest status}.
     *
     * @return the description
     */
    String describe() {
        return runId + ": suite " + suite.name() + ", player " + playerName + ", test "
                + Math.min(index + 1, tests.size()) + "/" + tests.size() + " ("
                + state.name().toLowerCase().replace('_', ' ') + ")";
    }

    private void event(String type, Object... keyValues) {
        JsonObject o = new JsonObject();
        o.addProperty("t", type);
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            Object v = keyValues[i + 1];
            if (v instanceof Number n) {
                o.addProperty((String) keyValues[i], n);
            } else {
                o.addProperty((String) keyValues[i], String.valueOf(v));
            }
        }
        if (events != null) {
            events.accept(o);
        }
    }
}

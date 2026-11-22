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

import com.google.gson.JsonObject;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

/**
 * mcdevtools' in-game test runner. It shows manual tests to a player with PASS / FAIL buttons, and lets {@code mcdev
 * test manual run} drive the same runs over a unix socket, so they get captures and JUnit reports. Installed on Paper
 * family instances by mcdev when {@code [test] in_game = true}; configured by system properties:
 * {@code mcdevtools.test.socket}, {@code mcdevtools.test.suites} and {@code mcdevtools.test.results}.
 */
public final class McDevTestPlugin extends JavaPlugin implements Listener {
    private Path suitesFile;
    private Path resultsDir;
    private ControlServer server;
    private final Map<String, ManualRun> runs = new HashMap<>();

    @Override
    public void onEnable() {
        suitesFile = path("mcdevtools.test.suites");
        resultsDir = path("mcdevtools.test.results");
        getServer().getPluginManager().registerEvents(this, this);
        var command = getCommand("mcdevtest");
        if (command != null) {
            command.setExecutor(this);
        }
        Path socket = path("mcdevtools.test.socket");
        if (socket != null) {
            try {
                server = new ControlServer(this, socket);
                server.start();
            } catch (IOException e) {
                getLogger().warning("Could not open the control socket " + socket + ": " + e.getMessage());
            }
        }
    }

    @Override
    public void onDisable() {
        if (server != null) {
            server.close();
        }
    }

    private static Path path(String property) {
        String value = System.getProperty(property);
        return value == null || value.isBlank() ? null : Path.of(value);
    }

    Path suitesFile() {
        return suitesFile;
    }

    /**
     * Starts a run. Must be called on the server thread.
     *
     * @param runId the id of the run
     * @param suiteName the suite
     * @param testIds the tests to run, or empty for all
     * @param player the player's name
     * @param events receives the run's events, may be null
     * @return an error message, or null when the run started
     */
    String startRun(String runId, String suiteName, List<String> testIds, String player, Consumer<JsonObject> events) {
        runs.values().removeIf(ManualRun::done);
        if (runs.containsKey(player.toLowerCase(Locale.ROOT))) {
            return player + " is already in a manual run";
        }
        Suites.Suite suite;
        try {
            suite = Suites.load(suitesFile).get(suiteName);
        } catch (IOException e) {
            return e.getMessage();
        }
        if (suite == null) {
            return "No manual suite named '" + suiteName + "'";
        }
        List<Suites.ManualTest> tests = new ArrayList<>();
        for (Suites.ManualTest test : suite.tests()) {
            if (testIds.isEmpty() || testIds.contains(test.id())) {
                tests.add(test);
            }
        }
        if (tests.isEmpty()) {
            return "Suite '" + suiteName + "' has no matching tests";
        }
        ManualRun run = new ManualRun(this, runId, suite, tests, player, resultsDir, events);
        runs.put(player.toLowerCase(Locale.ROOT), run);
        run.start();
        return null;
    }

    /**
     * Ends a player's run. Must be called on the server thread.
     *
     * @param player the player's name
     * @return whether a run was ended
     */
    boolean abort(String player) {
        ManualRun run = runs.remove(player.toLowerCase(Locale.ROOT));
        if (run == null) {
            return false;
        }
        run.abort("aborted");
        return true;
    }

    /**
     * Describes the active runs. Must be called on the server thread.
     *
     * @return one line per run
     */
    List<String> describeRuns() {
        runs.values().removeIf(ManualRun::done);
        return runs.values().stream().map(ManualRun::describe).toList();
    }

    private ManualRun runOf(String player) {
        return runs.get(player.toLowerCase(Locale.ROOT));
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        ManualRun run = runOf(event.getPlayer().getName());
        if (run != null) {
            // let the join finish before chat is sent to the player
            getServer().getScheduler().runTaskLater(this, () -> run.onJoin(event.getPlayer()), 20L);
        }
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncChatEvent event) {
        ManualRun run = runOf(event.getPlayer().getName());
        if (run != null && run.awaitingNote()) {
            event.setCancelled(true);
            String text = PlainTextComponentSerializer.plainText().serialize(event.message());
            getServer().getScheduler().runTask(this, () -> run.onChat(text));
        }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String sub = args.length == 0 ? "help" : args[0].toLowerCase(Locale.ROOT);
        switch (sub) {
            case "list" -> list(sender);
            case "status" -> {
                List<String> lines = describeRuns();
                sender.sendMessage(
                        Component.text(lines.isEmpty() ? "No manual run is active." : String.join("\n", lines)));
            }
            case "run" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage(
                            "Only a player can run manual tests in game; use `mcdev manual run` from the console.");
                } else if (args.length < 2) {
                    sender.sendMessage(Component.text("Usage: /mcdevtest run <suite> [test]", NamedTextColor.RED));
                } else {
                    String id = "manual-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
                    String error = startRun(
                            id, args[1], args.length > 2 ? List.of(args[2]) : List.of(), player.getName(), null);
                    if (error != null) {
                        sender.sendMessage(Component.text(error, NamedTextColor.RED));
                    }
                }
            }
            case "pass", "fail", "skip", "redo" -> {
                ManualRun run = sender instanceof Player p ? runOf(p.getName()) : null;
                if (run == null) {
                    sender.sendMessage(Component.text("You are not in a manual run.", NamedTextColor.RED));
                } else {
                    int n = 0;
                    if (args.length > 1) {
                        try {
                            n = Integer.parseInt(args[1]);
                        } catch (NumberFormatException ignored) {
                            // no test number: the current test
                        }
                    }
                    String problem = run.verdict(sub, n);
                    if (problem != null) {
                        sender.sendMessage(Component.text(problem, NamedTextColor.RED));
                    }
                }
            }
            case "abort" -> {
                boolean ended = sender instanceof Player p && abort(p.getName());
                sender.sendMessage(Component.text(ended ? "Manual run ended." : "You are not in a manual run."));
            }
            default ->
                sender.sendMessage(Component.text(
                        "/mcdevtest list | run <suite> [test] | pass | fail | skip | redo | abort | status"));
        }
        return true;
    }

    private void list(CommandSender sender) {
        try {
            var suites = Suites.load(suitesFile);
            if (suites.isEmpty()) {
                sender.sendMessage(Component.text("No manual suites (add .mcdevtools/tests/manual/*.toml)."));
            }
            suites.values().forEach(suite -> {
                sender.sendMessage(Component.text(suite.name() + " - " + suite.title(), NamedTextColor.GOLD));
                suite.tests().forEach(t -> sender.sendMessage(Component.text("  " + t.id() + ": " + t.title())));
            });
        } catch (IOException e) {
            sender.sendMessage(Component.text(e.getMessage(), NamedTextColor.RED));
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return List.of("list", "run", "pass", "fail", "skip", "redo", "abort", "status").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase(Locale.ROOT)))
                    .toList();
        }
        return List.of();
    }
}

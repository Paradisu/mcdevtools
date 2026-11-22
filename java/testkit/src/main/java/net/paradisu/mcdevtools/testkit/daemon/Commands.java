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

package net.paradisu.mcdevtools.testkit.daemon;

import net.paradisu.mcdevtools.testkit.bot.Bot;
import net.paradisu.mcdevtools.testkit.bot.ChatLine;
import net.paradisu.mcdevtools.testkit.bot.EventLog;
import net.paradisu.mcdevtools.testkit.bot.PacketEntry;
import net.paradisu.mcdevtools.testkit.bot.screen.ItemView;
import net.paradisu.mcdevtools.testkit.bot.screen.Screen;
import org.geysermc.mcprotocollib.protocol.data.game.entity.object.Direction;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The command table of a bot daemon, modelled on HeadlessMC's specifics commands ({@code gui}, {@code click},
 * {@code text}, {@code close}, {@code menu}, {@code msg}, {@code /}): each command takes words and returns the text a
 * person or an LLM reads.
 */
final class Commands {
    /** One command: usage, help and the action. */
    private record Command(String usage, String help, Function<Args, String> run) {}

    /** The words after the command name. */
    static final class Args {
        private final List<String> words;

        Args(List<String> words) {
            this.words = words;
        }

        List<String> all() {
            return words;
        }

        String word(int i, String name) {
            if (i >= words.size()) {
                throw new CommandException("Missing <" + name + ">");
            }
            return words.get(i);
        }

        int integer(int i, String name) {
            try {
                return Integer.parseInt(word(i, name));
            } catch (NumberFormatException e) {
                throw new CommandException("<" + name + "> must be a whole number, got '" + words.get(i) + "'");
            }
        }

        double number(int i, String name) {
            try {
                return Double.parseDouble(word(i, name));
            } catch (NumberFormatException e) {
                throw new CommandException("<" + name + "> must be a number, got '" + words.get(i) + "'");
            }
        }

        /** The value after a flag such as {@code --type}, or null. */
        String flag(String flag) {
            int i = words.indexOf(flag);
            return i >= 0 && i + 1 < words.size() ? words.get(i + 1) : null;
        }

        boolean has(String flag) {
            return words.contains(flag);
        }

        String rest(int from) {
            return from >= words.size() ? "" : String.join(" ", words.subList(from, words.size()));
        }
    }

    private final Map<String, Command> table = new LinkedHashMap<>();
    private final BotHolder holder;

    /** Gives commands the current bot, which {@code connect} can replace. */
    interface BotHolder {
        Bot bot();

        Bot connect(String instance);

        void quit();
    }

    Commands(BotHolder holder) {
        this.holder = holder;
        register();
    }

    private Bot bot() {
        Bot bot = holder.bot();
        if (bot == null || !bot.inGame()) {
            throw new CommandException("The bot is not connected; use `connect [instance]`");
        }
        return bot;
    }

    private void add(String name, String usage, String help, Function<Args, String> run) {
        table.put(name, new Command(usage, help, run));
    }

    /**
     * Runs one command line.
     *
     * @param line the line, for example {@code click 13 right}
     * @return the output
     */
    String execute(String line) {
        String trimmed = line.strip();
        if (trimmed.isEmpty()) {
            throw new CommandException("Empty command; try `help`");
        }
        if (trimmed.startsWith("/")) {
            bot().command(trimmed.substring(1));
            return "ran /" + trimmed.substring(1);
        }
        if (trimmed.startsWith(".")) {
            String text = trimmed.substring(1).strip();
            bot().chat(text);
            return "said: " + text;
        }
        List<String> words = Tokenizer.split(trimmed);
        Command command = table.get(words.get(0));
        if (command == null) {
            throw new CommandException("Unknown command '" + words.get(0) + "'; try `help`");
        }
        return command.run().apply(new Args(words.subList(1, words.size())));
    }

    private static Duration seconds(Args a, int index, int fallback) {
        return Duration.ofSeconds(index < a.all().size() ? a.integer(index, "seconds") : fallback);
    }

    private static String lines(List<String> lines) {
        return lines.isEmpty() ? "(none)" : String.join("\n", lines);
    }

    private void register() {
        add("help", "", "List the commands", a -> table.entrySet().stream()
                .map(e -> String.format(
                        "%-34s %s",
                        (e.getKey() + " " + e.getValue().usage()).strip(),
                        e.getValue().help()))
                .collect(Collectors.joining("\n", "Commands (a leading / runs a command, a leading . chats):\n", "")));
        add("status", "", "Connection state, server, position, health, open screen", a -> {
            Bot b = holder.bot();
            return b == null ? "state=disconnected" : b.status();
        });
        add("connect", "[instance]", "Join (again) after a disconnect", a -> {
            Bot b = holder.connect(a.all().isEmpty() ? null : a.word(0, "instance"));
            return b.status();
        });
        add("disconnect", "", "Leave the server (the daemon keeps running)", a -> {
            Bot b = holder.bot();
            if (b != null) {
                b.disconnect();
            }
            return "disconnected";
        });
        add("quit", "", "Leave the server and stop the daemon", a -> {
            holder.quit();
            return "bye";
        });
        add("msg", "<text>", "Send a chat message (same as a leading .)", a -> {
            bot().chat(a.rest(0));
            return "said: " + a.rest(0);
        });
        add("cmd", "<command>", "Run a command (same as a leading /)", a -> {
            bot().command(a.rest(0));
            return "ran /" + a.rest(0);
        });
        add("chat", "[n] [--since <seq>]", "Chat, titles and system messages (default last 10)", a -> {
            Bot b = holder.bot();
            if (b == null) {
                throw new CommandException("No bot");
            }
            String since = a.flag("--since");
            List<EventLog.Entry<ChatLine>> entries = since != null
                    ? b.chat().entriesSince(Long.parseLong(since))
                    : b.chat().last(a.all().isEmpty() || a.word(0, "n").startsWith("--") ? 10 : a.integer(0, "n"));
            return lines(
                    entries.stream().map(e -> "#" + e.seq() + " " + e.value()).toList());
        });
        add("wait-chat", "<regex> [seconds]", "Wait for a chat line matching the regex (default 10 s)", a -> {
            Bot b = bot();
            ChatLine line = b.awaitChat(
                    Pattern.compile(a.word(0, "regex")),
                    seconds(a, 1, 10),
                    b.chat().mark());
            return line.toString();
        });
        add("packets", "[n] [--type <text>] [--dir in|out]", "Recent packets (default last 20)", a -> {
            Bot b = holder.bot();
            if (b == null) {
                throw new CommandException("No bot");
            }
            String type = a.flag("--type");
            String dir = a.flag("--dir");
            int n = a.all().isEmpty() || a.word(0, "n").startsWith("--") ? 20 : a.integer(0, "n");
            List<String> out = new ArrayList<>();
            for (EventLog.Entry<PacketEntry> e : b.packets().last(2000)) {
                PacketEntry p = e.value();
                if ((type == null || p.name().toLowerCase().contains(type.toLowerCase()))
                        && (dir == null || p.inbound() == dir.equals("in"))) {
                    out.add("#" + e.seq() + " " + p);
                }
            }
            return lines(out.subList(Math.max(0, out.size() - n), out.size()));
        });
        add("wait-packet", "<SimpleName> [seconds]", "Wait for a received packet by class name", a -> {
            Bot b = bot();
            String name = a.word(0, "SimpleName");
            PacketEntry entry = b.packets()
                    .await(
                            p -> p.inbound() && p.name().equals(name),
                            seconds(a, 1, 10),
                            b.packets().mark(),
                            "packet " + name);
            return entry.toString();
        });
        add("events", "[n]", "Connection events (default last 20)", a -> {
            Bot b = holder.bot();
            if (b == null) {
                throw new CommandException("No bot");
            }
            return lines(b.events().last(a.all().isEmpty() ? 20 : a.integer(0, "n")).stream()
                    .map(e -> "#" + e.seq() + " " + e.value())
                    .toList());
        });
        add("gui", "[--tooltip <slot>]", "Describe the open screen and its slots", a -> {
            Bot b = bot();
            Screen s = b.screen();
            if (s == null) {
                return "No screen is open (the player's own inventory: `menu inventory`)";
            }
            String tip = a.flag("--tooltip");
            if (tip != null) {
                ItemView item = s.slot(Integer.parseInt(tip));
                return item == null ? "Slot " + tip + " is empty" : item.tooltip();
            }
            return s.describe();
        });
        add("menu", "[inventory]", "Show the player's own inventory (container 0)", a -> bot().inventory()
                .describe());
        add("click", "<slot> [left|right|shift|shift-right|drop|drop-stack|hotbar:<1-9>]", "Click a slot", a -> {
            Bot b = bot();
            Screen s = b.click(a.integer(0, "slot"), a.all().size() > 1 ? a.word(1, "kind") : "left");
            return s.describe();
        });
        add("text", "\"<string>\"", "Type into an anvil's rename field", a -> {
            bot().renameItem(a.word(0, "string"));
            return "typed: " + a.word(0, "string");
        });
        add("sign", "<line1> [line2] [line3] [line4]", "Write the sign that is being edited", a -> {
            bot().writeSign(a.all());
            return "sign written";
        });
        add("close", "", "Close the open screen", a -> {
            bot().closeScreen();
            return "closed";
        });
        add("dialog", "", "The last dialog the server showed (raw)", a -> {
            Bot b = bot();
            return b.dialog().isEmpty() ? "No dialog was shown" : b.dialog();
        });
        add("action", "<id>", "Answer a dialog with a custom action id", a -> {
            bot().customAction(a.word(0, "id"));
            return "sent action " + a.word(0, "id");
        });
        add("move", "<x> <y> <z> [seconds]", "Walk to a point in a straight line", a -> {
            Bot b = bot();
            b.moveToAndWait(a.number(0, "x"), a.number(1, "y"), a.number(2, "z"), seconds(a, 3, 30));
            return b.status();
        });
        add("look", "<yaw> <pitch>", "Turn the player", a -> {
            bot().look((float) a.number(0, "yaw"), (float) a.number(1, "pitch"));
            return "looking";
        });
        add("hotbar", "<0-8>", "Select a hotbar slot", a -> {
            bot().selectHotbar(a.integer(0, "slot"));
            return "selected " + a.integer(0, "slot");
        });
        add("use", "", "Use the held item", a -> {
            bot().useItem();
            return "used";
        });
        add("interact", "<x> <y> <z> [face]", "Right-click a block (face: up, down, north, south, east, west)", a -> {
            Direction face =
                    a.all().size() > 3 ? Direction.valueOf(a.word(3, "face").toUpperCase()) : Direction.UP;
            bot().interactBlock(a.integer(0, "x"), a.integer(1, "y"), a.integer(2, "z"), face);
            return "interacted";
        });
        add("break", "<x> <y> <z>", "Break a block (creative mode)", a -> {
            bot().breakBlock(a.integer(0, "x"), a.integer(1, "y"), a.integer(2, "z"));
            return "dug";
        });
        add("attack", "<entityId>", "Attack an entity", a -> {
            bot().attack(a.integer(0, "entityId"));
            return "attacked";
        });
        add("drop", "", "Drop the held item", a -> {
            bot().dropSelected();
            return "dropped";
        });
        add("sidebar", "", "The sidebar scoreboard lines", a -> lines(bot().sidebar()));
        add("tab", "", "The tab list header, players and footer", a -> lines(bot().tabList()));
        add("bossbars", "", "The boss bar titles", a -> lines(bot().bossBars()));
        add("title", "", "The last title and subtitle", a -> lines(bot().titles()));
    }
}

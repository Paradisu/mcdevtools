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

package net.paradisu.mcdevtools.testkit.junit;

import net.paradisu.mcdevtools.testkit.bot.Bot;
import net.paradisu.mcdevtools.testkit.bot.ChatLine;
import org.geysermc.mcprotocollib.network.packet.Packet;

import java.time.Duration;
import java.util.regex.Pattern;

/** Assertions for what a bot saw and what the servers printed. Failures list what did arrive. */
public final class McAssertions {
    private static final Duration DEFAULT = Duration.ofSeconds(10);

    private McAssertions() {}

    /**
     * Asserts that a chat line matching the regex arrives (ignoring earlier chat).
     *
     * @param bot the bot
     * @param regex the pattern, searched in the plain text
     * @param action what triggers it; chat that arrives while it runs counts
     * @return the matching line
     */
    public static ChatLine assertChat(Bot bot, String regex, Runnable action) {
        long mark = bot.chat().mark();
        action.run();
        return bot.awaitChat(Pattern.compile(regex), DEFAULT, mark);
    }

    /**
     * Asserts that a chat line matching the regex arrives within a time, counting only chat after the mark.
     *
     * @param bot the bot
     * @param regex the pattern
     * @param timeout how long to wait
     * @param from a mark from {@code bot.chat().mark()}
     * @return the line
     */
    public static ChatLine assertChat(Bot bot, String regex, Duration timeout, long from) {
        return bot.awaitChat(Pattern.compile(regex), timeout, from);
    }

    /**
     * Asserts that no chat matching the regex arrives during a window.
     *
     * @param bot the bot
     * @param regex the pattern
     * @param window how long to watch
     */
    public static void assertNoChat(Bot bot, String regex, Duration window) {
        long mark = bot.chat().mark();
        try {
            Thread.sleep(window.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        Pattern pattern = Pattern.compile(regex);
        bot.chat().since(mark).stream()
                .filter(l -> pattern.matcher(l.plain()).find())
                .findFirst()
                .ifPresent(l -> {
                    throw new AssertionError("Expected no chat matching /" + regex + "/ but got: " + l);
                });
    }

    /**
     * Asserts that a packet of a type arrives after the action.
     *
     * @param bot the bot
     * @param type the packet class
     * @param action what triggers it
     * @param <T> the packet type
     * @return the packet
     */
    public static <T extends Packet> T assertPacket(Bot bot, Class<T> type, Runnable action) {
        long mark = bot.packets().mark();
        action.run();
        return bot.awaitPacket(type, p -> true, DEFAULT, mark);
    }

    /**
     * Asserts that a console command's output matches.
     *
     * @param instance the instance
     * @param command the console command
     * @param regex the pattern expected in the output
     * @return the output
     */
    public static String assertConsole(Network.Instance instance, String command, String regex) {
        return instance.console(command, Pattern.compile(regex), DEFAULT);
    }

    /**
     * Asserts that an instance has logged a line matching the regex since the test began.
     *
     * @param instance the instance
     * @param regex the pattern
     */
    public static void assertLog(Network.Instance instance, String regex) {
        Pattern pattern = Pattern.compile(regex);
        long deadline = System.nanoTime() + DEFAULT.toNanos();
        while (System.nanoTime() < deadline) {
            if (instance.logLines().stream().anyMatch(l -> pattern.matcher(l).find())) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        throw new AssertionError("Log of " + instance.name() + " has no line matching /" + regex + "/");
    }
}

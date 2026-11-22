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
import net.paradisu.mcdevtools.testkit.bot.BotOptions;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.IntStream;

/** Creates the bots of one test and disconnects them all when the test ends. */
public final class Bots implements AutoCloseable {
    private final TestEnvironment env;
    private final List<Bot> bots = new ArrayList<>();

    Bots(TestEnvironment env) {
        this.env = env;
    }

    /**
     * Joins the default target (an offline proxy when there is one, otherwise the first backend directly).
     *
     * @param name the player name
     * @return the joined bot
     */
    public Bot join(String name) {
        return join(BotOptions.named(name));
    }

    /**
     * Joins with explicit options.
     *
     * @param options the options
     * @return the joined bot
     */
    public Bot join(BotOptions options) {
        Bot bot = Bot.connect(env, options);
        synchronized (bots) {
            bots.add(bot);
        }
        return bot;
    }

    /**
     * Joins several bots in parallel, named {@code prefix1} ... {@code prefixN}.
     *
     * @param count how many
     * @param prefix the name prefix (keep it short: names are at most 16 characters)
     * @return the joined bots
     */
    public List<Bot> joinAll(int count, String prefix) {
        List<CompletableFuture<Bot>> futures = IntStream.rangeClosed(1, count)
                .mapToObj(i -> CompletableFuture.supplyAsync(() -> join(prefix + i)))
                .toList();
        return futures.stream().map(CompletableFuture::join).toList();
    }

    /**
     * The bots that were created in this test.
     *
     * @return the bots
     */
    public List<Bot> all() {
        synchronized (bots) {
            return new ArrayList<>(bots);
        }
    }

    @Override
    public void close() {
        all().forEach(Bot::close);
    }
}

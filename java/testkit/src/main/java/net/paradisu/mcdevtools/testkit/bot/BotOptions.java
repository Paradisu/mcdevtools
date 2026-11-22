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

package net.paradisu.mcdevtools.testkit.bot;

import net.paradisu.mcdevtools.testkit.env.TestEnvironment.Via;
import org.geysermc.mcprotocollib.auth.GameProfile;

import java.time.Duration;

/** Settings for one {@link Bot}. Build with {@link #named(String)}. */
public final class BotOptions {
    String name;
    Via via;
    String target;
    GameProfile profile;
    String accessToken;
    String locale = "en_us";
    int viewDistance = 2;
    boolean autoRespawn = true;
    int packetLog = 2000;
    Duration connectTimeout = Duration.ofSeconds(30);

    private BotOptions() {}

    /**
     * Starts options for a bot.
     *
     * @param name the player name
     * @return the options
     */
    public static BotOptions named(String name) {
        BotOptions o = new BotOptions();
        o.name = name;
        return o;
    }

    /**
     * How to reach the target. Default: through an offline-mode proxy when there is one, otherwise directly.
     *
     * @param via the route
     * @return this
     */
    public BotOptions via(Via via) {
        this.via = via;
        return this;
    }

    /**
     * The instance to join.
     *
     * @param instance the instance name
     * @return this
     */
    public BotOptions target(String instance) {
        this.target = instance;
        return this;
    }

    /**
     * Joins as a real Microsoft account (needed to pass an online-mode proxy).
     *
     * @param profile the account's game profile
     * @param accessToken its Minecraft access token
     * @return this
     */
    public BotOptions account(GameProfile profile, String accessToken) {
        this.profile = profile;
        this.accessToken = accessToken;
        return this;
    }

    /**
     * The client locale. Default {@code en_us}.
     *
     * @param locale the locale
     * @return this
     */
    public BotOptions locale(String locale) {
        this.locale = locale;
        return this;
    }

    /**
     * The view distance the bot asks for. Default 2; small values keep chunk traffic low.
     *
     * @param chunks the distance in chunks
     * @return this
     */
    public BotOptions viewDistance(int chunks) {
        this.viewDistance = chunks;
        return this;
    }

    /**
     * Whether to respawn when dead. Default true.
     *
     * @param autoRespawn the flag
     * @return this
     */
    public BotOptions autoRespawn(boolean autoRespawn) {
        this.autoRespawn = autoRespawn;
        return this;
    }

    /**
     * How many packets to keep for inspection. Default 2000.
     *
     * @param size the ring size
     * @return this
     */
    public BotOptions packetLog(int size) {
        this.packetLog = size;
        return this;
    }

    /**
     * How long to wait for the join to finish. Default 30 seconds.
     *
     * @param timeout the timeout
     * @return this
     */
    public BotOptions connectTimeout(Duration timeout) {
        this.connectTimeout = timeout;
        return this;
    }

    /**
     * The player name.
     *
     * @return the name
     */
    public String name() {
        return name;
    }

    /**
     * The configured route, or null for the default.
     *
     * @return the route
     */
    public Via viaOrNull() {
        return via;
    }

    /**
     * The account profile, or null for an offline bot.
     *
     * @return the profile
     */
    public GameProfile profileOrNull() {
        return profile;
    }

    /**
     * The account access token, or null for an offline bot.
     *
     * @return the token
     */
    public String accessTokenOrNull() {
        return accessToken;
    }
}

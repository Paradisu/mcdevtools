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

import java.time.Instant;

/**
 * A packet seen by a bot.
 *
 * @param inbound true when received from the server, false when sent
 * @param name the packet class's simple name
 * @param packet the packet, or null for bulky packets (chunks, light, entity movement) that are only counted
 * @param time when it was seen
 */
public record PacketEntry(boolean inbound, String name, Object packet, Instant time) {
    @Override
    public String toString() {
        String text = packet == null ? "" : " " + packet;
        if (text.length() > 500) {
            text = text.substring(0, 500) + "...";
        }
        return (inbound ? "<- " : "-> ") + name + text;
    }
}

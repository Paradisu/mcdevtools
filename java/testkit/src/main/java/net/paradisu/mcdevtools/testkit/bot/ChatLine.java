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
 * Something the player would read: chat, a system message, the action bar, a title or a disconnect reason.
 *
 * @param kind what it is
 * @param plain the text without formatting
 * @param sender the player's name for chat, otherwise empty
 * @param time when it arrived
 */
public record ChatLine(Kind kind, String plain, String sender, Instant time) {
    /** The kind of line. */
    public enum Kind {
        SYSTEM,
        PLAYER,
        ACTION_BAR,
        TITLE,
        SUBTITLE,
        DISCONNECT
    }

    @Override
    public String toString() {
        return kind + (sender.isEmpty() ? "" : " <" + sender + ">") + ": " + plain;
    }
}

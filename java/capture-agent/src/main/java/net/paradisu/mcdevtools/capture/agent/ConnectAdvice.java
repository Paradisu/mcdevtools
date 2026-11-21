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

package net.paradisu.mcdevtools.capture.agent;

import net.bytebuddy.asm.Advice;

import java.util.function.Consumer;

/** Woven into {@code Bootstrap.init(channel)} after it added the platform's handler. Only JDK types. */
final class ConnectAdvice {
    private ConnectAdvice() {}

    @Advice.OnMethodExit
    @SuppressWarnings("unchecked")
    static void exit(@Advice.Argument(0) Object channel) {
        try {
            Object hook = System.getProperties().get("mcdevtools.capture.hook.connected");
            if (hook instanceof Consumer) {
                ((Consumer<Object>) hook).accept(channel);
            }
        } catch (Throwable ignored) {
            // capture must never break a connection
        }
    }
}

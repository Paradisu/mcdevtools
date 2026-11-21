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

/**
 * Woven into the start of {@code ServerBootstrapAcceptor.channelRead(ctx, msg)}: {@code msg} is the accepted child
 * channel. It runs before the method adds the platform's initializer and before it registers the channel with its
 * worker thread, so the capture handler is in place before the worker can read a single byte (hooking after the method
 * races the worker, which may already have run the initializer and read the first packets). Only JDK types, see
 * {@link CaptureAgent}.
 */
final class AcceptAdvice {
    private AcceptAdvice() {}

    @Advice.OnMethodEnter
    @SuppressWarnings("unchecked")
    static void exit(@Advice.Argument(1) Object msg) {
        try {
            Object hook = System.getProperties().get("mcdevtools.capture.hook.accepted");
            if (hook instanceof Consumer) {
                ((Consumer<Object>) hook).accept(msg);
            }
        } catch (Throwable ignored) {
            // capture must never break a connection
        }
    }
}

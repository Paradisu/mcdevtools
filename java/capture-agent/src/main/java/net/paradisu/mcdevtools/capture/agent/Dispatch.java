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

import java.lang.reflect.Method;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Routes a channel to the capture bridge loaded next to the netty that created it. */
final class Dispatch {
    private static final Map<ClassLoader, Method[]> BRIDGES = new ConcurrentHashMap<>();
    private static final ClassLoader BOOT = new ClassLoader(null) {};

    private Dispatch() {}

    static void accepted(Object channel) {
        call(channel, 0);
    }

    static void connected(Object channel) {
        call(channel, 1);
    }

    private static void call(Object channel, int which) {
        try {
            ClassLoader nettyLoader = channel.getClass().getClassLoader();
            Method[] methods =
                    BRIDGES.computeIfAbsent(nettyLoader == null ? BOOT : nettyLoader, key -> load(nettyLoader));
            if (methods != null && methods.length > 0) {
                methods[which].invoke(null, channel);
            }
        } catch (Throwable t) {
            System.err.println("[McDevCapture] WARNING: could not hook a channel: " + t);
        }
    }

    private static Method[] load(ClassLoader nettyLoader) {
        try {
            Class<?> bridge = new BundleLoader(nettyLoader).loadClass("net.paradisu.mcdevtools.capture.agent.Bridge");
            return new Method[] {bridge.getMethod("accepted", Object.class), bridge.getMethod("connected", Object.class)
            };
        } catch (Throwable t) {
            System.err.println("[McDevCapture] WARNING: could not load the capture handlers: " + t);
            return new Method[0];
        }
    }
}

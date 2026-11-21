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

package net.paradisu.mcdevtools.capture.core;

import net.paradisu.mcdevtools.capture.control.ControlServer;

import java.nio.file.Path;

/**
 * The capture engine of the Java agent: created once per JVM from the {@code mcdevtools.capture.*} system properties,
 * together with its control socket. Lives in the core (no netty), so every netty class loader shares this one instance.
 */
public final class AgentEngine {
    private static CaptureEngine engine;
    private static boolean tried;

    private AgentEngine() {}

    /** Starts the engine and its control socket (idempotent); returns null when capture is off or failed to start. */
    public static synchronized CaptureEngine start() {
        if (tried) {
            return engine;
        }
        tried = true;
        String socket = System.getProperty("mcdevtools.capture.socket");
        if (socket == null || socket.isEmpty()) {
            return null;
        }
        CaptureLog log = new CaptureLog() {
            @Override
            public void info(String message) {
                System.out.println("[McDevCapture] " + message);
            }

            @Override
            public void warn(String message) {
                System.err.println("[McDevCapture] WARNING: " + message);
            }
        };
        String platform = System.getProperty("mcdevtools.capture.platform", "agent");
        try {
            CaptureEngine created = new CaptureEngine(
                    platform, "1", ProtocolHints.load(System.getProperty("mcdevtools.capture.protocol")), log);
            ControlServer server = new ControlServer(created, Path.of(socket));
            server.start();
            // Closes the control socket and flushes a running recording when the server stops
            Runtime.getRuntime()
                    .addShutdownHook(new Thread(
                            () -> {
                                created.shutdown();
                                server.close();
                            },
                            "McDevCapture-shutdown"));
            log.info("Packet capture ready (control socket " + socket + ")");
            engine = created;
        } catch (Exception e) {
            log.warn("Packet capture could not start: " + e);
        }
        return engine;
    }
}

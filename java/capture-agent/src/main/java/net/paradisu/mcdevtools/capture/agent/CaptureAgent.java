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

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.Advice;
import net.paradisu.mcdevtools.capture.core.AgentEngine;

import java.lang.instrument.Instrumentation;
import java.util.function.Consumer;

import static net.bytebuddy.matcher.ElementMatchers.named;
import static net.bytebuddy.matcher.ElementMatchers.takesArguments;

/**
 * Dev-only packet capture for servers and proxies that have no capture plugin (BungeeCord, ViaProxy, Fabric, Forge,
 * NeoForge, Sponge). Started with {@code -javaagent}: it starts the capture engine and control socket at once, and
 * instruments netty so every accepted (and, for proxies, every outbound) channel gets the capture handlers.
 *
 * <p>The advice woven into netty touches only JDK types: it calls a {@link Consumer} found in the system properties,
 * which works whatever class loader (or module layer) netty lives in. {@link Dispatch} then loads the handler classes
 * in a loader that can see that netty.
 */
public final class CaptureAgent {
    static final String ACCEPTED = "mcdevtools.capture.hook.accepted";
    static final String CONNECTED = "mcdevtools.capture.hook.connected";

    private CaptureAgent() {}

    /**
     * Agent entry point.
     *
     * @param args unused
     * @param instrumentation the JVM's instrumentation
     */
    public static void premain(String args, Instrumentation instrumentation) {
        String socket = System.getProperty("mcdevtools.capture.socket");
        if (socket == null || socket.isEmpty()) {
            System.out.println("[McDevCapture] mcdevtools.capture.socket is not set; packet capture is inactive");
            return;
        }
        try {
            AgentEngine.start();
            Consumer<Object> accepted = Dispatch::accepted;
            Consumer<Object> connected = Dispatch::connected;
            System.getProperties().put(ACCEPTED, accepted);
            System.getProperties().put(CONNECTED, connected);

            AgentBuilder builder = new AgentBuilder.Default()
                    .with(AgentBuilder.RedefinitionStrategy.DISABLED)
                    .with(new AgentBuilder.Listener.Adapter() {
                        @Override
                        public void onError(
                                String typeName,
                                ClassLoader classLoader,
                                net.bytebuddy.utility.JavaModule module,
                                boolean loaded,
                                Throwable throwable) {
                            System.err.println(
                                    "[McDevCapture] WARNING: could not instrument " + typeName + ": " + throwable);
                        }
                    })
                    .type(named("io.netty.bootstrap.ServerBootstrap$ServerBootstrapAcceptor"))
                    .transform((b, type, loader, module, domain) ->
                            b.visit(Advice.to(AcceptAdvice.class).on(named("channelRead"))));
            if (Boolean.getBoolean("mcdevtools.capture.backend")) {
                builder = builder.type(named("io.netty.bootstrap.Bootstrap"))
                        .transform((b, type, loader, module, domain) -> b.visit(
                                Advice.to(ConnectAdvice.class).on(named("init").and(takesArguments(1)))));
            }
            builder.installOn(instrumentation);
        } catch (Throwable t) {
            System.err.println("[McDevCapture] WARNING: the capture agent could not start: " + t);
        }
    }
}

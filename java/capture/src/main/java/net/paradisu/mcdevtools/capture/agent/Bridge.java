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

import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import net.paradisu.mcdevtools.capture.core.AgentEngine;
import net.paradisu.mcdevtools.capture.core.CaptureEngine;
import net.paradisu.mcdevtools.capture.core.Leg;
import net.paradisu.mcdevtools.capture.netty.NettyInjector;
import net.paradisu.mcdevtools.capture.netty.PipelineLayout;

/**
 * Entry points the Java agent calls (by reflection, from the class loader that owns netty) for every channel netty
 * accepts or connects. Adds a one-shot handler behind the platform's own initializer; once the codecs exist it detects
 * the platform's {@link PipelineLayout} and installs the capture handlers. Never throws.
 */
public final class Bridge {
    private static volatile boolean warnedLayout;

    private Bridge() {}

    /** A server socket accepted a connection (a client of this server or proxy). */
    public static void accepted(Object channel) {
        hook(channel, Leg.FRONTEND);
    }

    /** An outbound connection is being set up (a proxy connecting to a backend). */
    public static void connected(Object channel) {
        hook(channel, Leg.BACKEND);
    }

    private static void hook(Object channel, Leg leg) {
        try {
            CaptureEngine engine = AgentEngine.start();
            if (engine != null) {
                ((Channel) channel).pipeline().addLast("mcdevtools_capture_init", new Deferred(engine, leg));
            }
        } catch (Throwable ignored) {
            // capture must never break a connection
        }
    }

    /**
     * Added in front of the platform's initializer. Netty fires {@code channelRegistered} once the initializer has run
     * (so the codecs exist) and before the channel reads anything, which is the moment to install the capture handlers.
     */
    private static final class Deferred extends ChannelInboundHandlerAdapter {
        private final CaptureEngine engine;
        private final Leg leg;

        Deferred(CaptureEngine engine, Leg leg) {
            this.engine = engine;
            this.leg = leg;
        }

        @Override
        public void channelRegistered(ChannelHandlerContext ctx) throws Exception {
            try {
                PipelineLayout layout = NettyInjector.detect(ctx.pipeline());
                if (Boolean.getBoolean("mcdevtools.capture.debug")) {
                    engine.log()
                            .info("debug: " + leg + " layout=" + (layout == null ? null : layout.name()) + " pipeline="
                                    + ctx.pipeline().names());
                }
                if (layout != null) {
                    NettyInjector.inject(ctx.channel(), leg, layout, engine);
                } else if (leg == Leg.FRONTEND && !warnedLayout) {
                    warnedLayout = true;
                    engine.log()
                            .warn("capture: no known codec handler in "
                                    + ctx.pipeline().names() + "; add a PipelineLayout");
                }
            } catch (Throwable t) {
                engine.log().warn("capture: could not hook a channel: " + t);
            } finally {
                try {
                    ctx.pipeline().remove(this);
                } catch (Throwable ignored) {
                    // already removed
                }
            }
            ctx.fireChannelRegistered();
        }
    }
}

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

package net.paradisu.mcdevtools.capture.netty;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.ByteBufHolder;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelOutboundHandlerAdapter;
import io.netty.channel.ChannelPromise;
import net.paradisu.mcdevtools.capture.core.CaptureEngine;
import net.paradisu.mcdevtools.capture.core.ConnectionInfo;
import net.paradisu.mcdevtools.capture.core.Direction;

/** Taps outbound frames just after they were encoded; forwards everything unchanged. */
final class CaptureOutboundHandler extends ChannelOutboundHandlerAdapter {
    private final CaptureEngine engine;
    private final ConnectionInfo info;
    private final PipelineLayout layout;
    /** Direction of the inbound tap of the same connection, needed to move both taps together */
    private final Direction inboundDirection;

    private final Direction direction;
    private boolean failed;

    CaptureOutboundHandler(
            CaptureEngine engine,
            ConnectionInfo info,
            PipelineLayout layout,
            Direction inboundDirection,
            Direction direction) {
        this.engine = engine;
        this.info = info;
        this.layout = layout;
        this.inboundDirection = inboundDirection;
        this.direction = direction;
    }

    @Override
    public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) throws Exception {
        if (!failed) {
            try {
                if (info.remote == null) {
                    info.remote = CaptureInboundHandler.describe(ctx.channel().remoteAddress());
                }
                ByteBuf content = msg instanceof ByteBuf buf
                        ? buf
                        : msg instanceof ByteBufHolder holder ? holder.content() : null;
                if (content != null) {
                    // A compression handler appeared behind us: this frame was compressed on its way here (the new tap
                    // is past it,
                    // so it never sees this frame), later ones are not
                    boolean moved =
                            NettyInjector.reanchorOnHandlers(ctx, engine, info, layout, inboundDirection, false);
                    ByteBuf frame = moved ? CompressedFrame.decode(content) : content;
                    if (frame != null) {
                        engine.onFrame(info, direction, new ByteBufReader(frame));
                    }
                }
            } catch (Throwable t) {
                failed = true;
                info.ignored = true;
                engine.log().warn("capture disabled for connection " + info.id + ": " + t);
            }
        }
        ctx.write(msg, promise);
    }
}

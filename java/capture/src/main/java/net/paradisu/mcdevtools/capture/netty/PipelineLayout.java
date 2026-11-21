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

import java.util.List;
import java.util.function.Predicate;

/**
 * Where capture handlers sit in a platform's netty pipeline. This is the only place pipeline handler names live.
 *
 * <p>Invariant: the inbound capture handler sits immediately before the packet decoder and the outbound one immediately
 * before the packet encoder, in pipeline list order. Inbound data flows head to tail and outbound data tail to head, so
 * both then see decoded frames, {@code [packet id][payload]}, after decryption and decompression and before compression
 * and encryption. If a platform renames its handlers, {@code dev capture doctor} shows the live pipeline; fix the names
 * here.
 *
 * @param name platform label for log messages
 * @param decoderAnchors candidate decoder handler names, first match wins
 * @param encoderAnchors candidate encoder handler names, first match wins
 * @param reanchorEvent user events after which the platform inserts handlers next to the codecs (compression), so the
 *     capture handlers must move back to just before them
 * @param inboundReanchorHandlers handler names that, once they appear, were inserted next to the inbound codec by a
 *     platform that fires no event (BungeeCord's {@code decompress}); the inbound frame being read is compressed
 * @param outboundReanchorHandlers the same for the outbound codec (BungeeCord's older separate {@code compress})
 */
public record PipelineLayout(
        String name,
        List<String> decoderAnchors,
        List<String> encoderAnchors,
        Predicate<Object> reanchorEvent,
        List<String> inboundReanchorHandlers,
        List<String> outboundReanchorHandlers) {

    /**
     * Vanilla names from {@code net.minecraft.network.HandlerNames}, used by Paper, Purpur, Fabric, Forge, NeoForge and
     * Sponge. Codecs are replaced in place, and compression is added after the splitter, so nothing moves.
     */
    public static final PipelineLayout VANILLA = new PipelineLayout(
            "vanilla",
            List.of("decoder", "inbound_config"),
            List.of("encoder", "outbound_config"),
            event -> false,
            List.of(),
            List.of());

    /**
     * BungeeCord and Waterfall: {@code packet-decoder}/{@code packet-encoder}. Enabling compression inserts
     * {@code decompress}/{@code compress} right before them without an event.
     */
    public static final PipelineLayout BUNGEE = new PipelineLayout(
            "bungee",
            List.of("packet-decoder"),
            List.of("packet-encoder"),
            event -> false,
            List.of("decompress"),
            List.of("compress"));

    /**
     * ViaProxy (Lenni0451's netty pipeline: {@code encryption, sizer, flow-control, compression, via-codec, ...,
     * packet-codec}). {@code via-codec} translates between protocol versions; right before it the frames are decrypted
     * and decompressed, in the protocol of the network side. One handler is both the decoder and the encoder anchor.
     */
    public static final PipelineLayout VIAPROXY = new PipelineLayout(
            "viaproxy", List.of("via-codec"), List.of("via-codec"), event -> false, List.of(), List.of());

    /**
     * Velocity: names from {@code com.velocitypowered.proxy.network.Connections}. Enabling compression adds
     * {@code compression-decoder}/{@code -encoder} directly before the codecs and then fires a
     * {@code VelocityConnectionEvent.COMPRESSION_*} user event.
     */
    public static final PipelineLayout VELOCITY = new PipelineLayout(
            "velocity",
            List.of("minecraft-decoder"),
            List.of("minecraft-encoder"),
            event -> event instanceof Enum<?> e && e.name().startsWith("COMPRESSION_"),
            List.of(),
            List.of());
}

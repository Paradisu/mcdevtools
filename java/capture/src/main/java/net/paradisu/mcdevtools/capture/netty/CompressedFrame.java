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
import io.netty.buffer.Unpooled;

import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * Undoes Minecraft's packet compression for one frame: {@code [data length varint][payload]}, where a data length of
 * zero means the payload is stored as is and anything else is the uncompressed size of a zlib stream. Used for the one
 * frame that is seen before the capture handlers could move behind a compression handler.
 */
final class CompressedFrame {
    private CompressedFrame() {}

    /** The frame as {@code [packet id][payload]}, or null when it cannot be decoded (it is then not recorded). */
    static ByteBuf decode(ByteBuf frame) {
        try {
            ByteBuf in = frame.duplicate();
            int dataLength = readVarInt(in);
            if (dataLength < 0 || dataLength > (8 << 20)) {
                return null;
            }
            if (dataLength == 0) {
                return in.slice();
            }
            byte[] compressed = new byte[in.readableBytes()];
            in.readBytes(compressed);
            Inflater inflater = new Inflater();
            try {
                inflater.setInput(compressed);
                byte[] out = new byte[dataLength];
                int read = 0;
                while (read < dataLength && !inflater.finished()) {
                    int n = inflater.inflate(out, read, dataLength - read);
                    if (n == 0 && (inflater.needsInput() || inflater.needsDictionary())) {
                        break;
                    }
                    read += n;
                }
                return read == dataLength ? Unpooled.wrappedBuffer(out) : null;
            } finally {
                inflater.end();
            }
        } catch (DataFormatException | RuntimeException e) {
            return null;
        }
    }

    private static int readVarInt(ByteBuf in) {
        int value = 0;
        for (int shift = 0; shift < 35; shift += 7) {
            byte b = in.readByte();
            value |= (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                return value;
            }
        }
        return -1;
    }
}

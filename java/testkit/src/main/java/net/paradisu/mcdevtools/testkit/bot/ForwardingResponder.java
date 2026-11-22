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

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

/**
 * Forges what a Velocity proxy sends a backend, so a bot can join a backend directly without the proxy and with any
 * name: the modern-forwarding login answer (HMAC-SHA256 over the player data) and the legacy handshake host.
 */
public final class ForwardingResponder {
    /** Velocity's {@code MODERN_DEFAULT} forwarding version. */
    private static final int MODERN_DEFAULT = 1;

    private ForwardingResponder() {}

    /**
     * The UUID a server computes for an offline-mode player.
     *
     * @param name the player's name
     * @return the UUID
     */
    public static UUID offlineUuid(String name) {
        return UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Builds the answer to the {@code velocity:player_info} login query: the signature followed by the data it signs.
     *
     * @param secret the forwarding secret
     * @param address the client address to claim
     * @param uuid the player's UUID
     * @param name the player's name
     * @return the bytes of the query answer
     */
    public static byte[] modernAnswer(byte[] secret, String address, UUID uuid, String name) {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        writeVarInt(data, MODERN_DEFAULT);
        writeString(data, address);
        data.writeBytes(uuidBytes(uuid));
        writeString(data, name);
        writeVarInt(data, 0); // no properties
        byte[] payload = data.toByteArray();
        byte[] signature = hmac(secret, payload);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(signature);
        out.writeBytes(payload);
        return out.toByteArray();
    }

    /**
     * The server address a legacy (BungeeCord-style) forwarding handshake carries.
     *
     * @param host the real host
     * @param address the client address to claim
     * @param uuid the player's UUID
     * @return the forged handshake host
     */
    public static String legacyHost(String host, String address, UUID uuid) {
        return host + "\0" + address + "\0" + uuid.toString().replace("-", "") + "\0[]";
    }

    private static byte[] hmac(byte[] secret, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] uuidBytes(UUID uuid) {
        byte[] out = new byte[16];
        long most = uuid.getMostSignificantBits();
        long least = uuid.getLeastSignificantBits();
        for (int i = 0; i < 8; i++) {
            out[i] = (byte) (most >>> (56 - 8 * i));
            out[8 + i] = (byte) (least >>> (56 - 8 * i));
        }
        return out;
    }

    private static void writeString(ByteArrayOutputStream out, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeVarInt(out, bytes.length);
        out.writeBytes(bytes);
    }

    private static void writeVarInt(ByteArrayOutputStream out, int value) {
        while ((value & ~0x7F) != 0) {
            out.write((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        out.write(value);
    }
}

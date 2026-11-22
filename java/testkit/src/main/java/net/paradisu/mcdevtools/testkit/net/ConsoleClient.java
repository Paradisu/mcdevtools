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

package net.paradisu.mcdevtools.testkit.net;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.Channels;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Talks to an instance's supervisor over its console unix socket (newline-delimited JSON, the same protocol as
 * {@code mcdev console --send}): {@code {t:'hello',replay:n}} and {@code {t:'in',line}} go in, {@code {t:'out',data}}
 * and {@code {t:'exit',code}} come out.
 */
public final class ConsoleClient {
    private static final Pattern ANSI = Pattern.compile("\u001B\\[[0-9;?]*[ -/]*[@-~]");
    private static final Gson GSON = new Gson();

    private final Path socket;

    /**
     * Creates a client.
     *
     * @param socket the console socket of the instance
     */
    public ConsoleClient(Path socket) {
        this.socket = socket;
    }

    /** A console line with the time it was read. */
    public record Line(Instant time, String text) {}

    /**
     * Runs a console command and collects the output for a while.
     *
     * @param command the command, without a leading slash
     * @param collect how long to keep listening
     * @return the output, with ANSI codes removed
     * @throws IOException when the socket cannot be used
     */
    public String send(String command, Duration collect) throws IOException {
        try (Tap tap = tap(false)) {
            tap.write(command);
            try {
                Thread.sleep(collect.toMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return String.join("\n", tap.lines().stream().map(Line::text).toList());
        }
    }

    /**
     * Starts recording the console output until closed.
     *
     * @return the tap
     * @throws IOException when the socket cannot be used
     */
    public Tap tap() throws IOException {
        return tap(false);
    }

    private Tap tap(boolean replay) throws IOException {
        SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX);
        try {
            channel.connect(UnixDomainSocketAddress.of(socket));
        } catch (IOException e) {
            channel.close();
            throw new IOException("Cannot reach the console socket " + socket + ": " + e.getMessage(), e);
        }
        Tap tap = new Tap(channel);
        tap.writeJson(json("hello", "replay", replay ? 200 : 0));
        return tap;
    }

    private static JsonObject json(String type, String key, Object value) {
        JsonObject o = new JsonObject();
        o.addProperty("t", type);
        if (value instanceof Number n) {
            o.addProperty(key, n);
        } else {
            o.addProperty(key, String.valueOf(value));
        }
        return o;
    }

    /** A live recording of a console's output. */
    public static final class Tap implements AutoCloseable {
        private final SocketChannel channel;
        private final OutputStream out;
        private final List<Line> lines = new ArrayList<>();
        private final StringBuilder partial = new StringBuilder();
        private final Thread reader;
        private volatile boolean closed;

        private Tap(SocketChannel channel) {
            this.channel = channel;
            this.out = Channels.newOutputStream(channel);
            BufferedReader in =
                    new BufferedReader(new InputStreamReader(Channels.newInputStream(channel), StandardCharsets.UTF_8));
            this.reader = new Thread(
                    () -> {
                        try {
                            String raw;
                            while (!closed && (raw = in.readLine()) != null) {
                                JsonObject o = JsonParser.parseString(raw).getAsJsonObject();
                                if ("out".equals(o.get("t").getAsString())) {
                                    accept(o.get("data").getAsString());
                                }
                            }
                        } catch (IOException | RuntimeException ignored) {
                            // closed or malformed: stop recording
                        }
                    },
                    "mcdev-console-tap");
            this.reader.setDaemon(true);
            this.reader.start();
        }

        private synchronized void accept(String data) {
            partial.append(ANSI.matcher(data).replaceAll("").replace("\r", ""));
            int newline;
            while ((newline = partial.indexOf("\n")) >= 0) {
                String text = partial.substring(0, newline);
                partial.delete(0, newline + 1);
                if (!text.isBlank()) {
                    lines.add(new Line(Instant.now(), text));
                }
            }
        }

        private synchronized void writeJson(JsonObject o) throws IOException {
            out.write((GSON.toJson(o) + "\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        }

        /**
         * Sends a console command.
         *
         * @param command the command
         * @throws IOException when the socket is closed
         */
        public void write(String command) throws IOException {
            writeJson(json("in", "line", command));
        }

        /**
         * Everything recorded so far, including an unfinished last line.
         *
         * @return the lines, oldest first
         */
        public synchronized List<Line> lines() {
            List<Line> all = new ArrayList<>(lines);
            if (!partial.isEmpty() && !partial.toString().isBlank()) {
                all.add(new Line(Instant.now(), partial.toString()));
            }
            return all;
        }

        /**
         * The recorded text.
         *
         * @return the lines joined by newlines
         */
        public String text() {
            return String.join("\n", lines().stream().map(Line::text).toList());
        }

        @Override
        public void close() {
            closed = true;
            try {
                channel.close();
            } catch (IOException ignored) {
                // already closed
            }
        }
    }
}

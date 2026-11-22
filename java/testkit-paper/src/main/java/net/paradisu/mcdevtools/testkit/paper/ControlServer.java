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

package net.paradisu.mcdevtools.testkit.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.Bukkit;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.Channels;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;

/**
 * The unix socket {@code mcdev manual} talks to: one JSON object per line in, one per line out. {@code run} keeps its
 * connection open and streams the run's events; {@code abort}, {@code status} and {@code list} answer once. Everything
 * that touches the server runs on the server thread.
 */
final class ControlServer {
    private final McDevTestPlugin plugin;
    private final Path socket;
    private ServerSocketChannel server;

    ControlServer(McDevTestPlugin plugin, Path socket) {
        this.plugin = plugin;
        this.socket = socket;
    }

    void start() throws IOException {
        Files.createDirectories(socket.getParent());
        Files.deleteIfExists(socket);
        server = ServerSocketChannel.open(StandardProtocolFamily.UNIX);
        server.bind(UnixDomainSocketAddress.of(socket));
        Thread acceptor = new Thread(
                () -> {
                    while (server.isOpen()) {
                        try {
                            SocketChannel client = server.accept();
                            Thread t = new Thread(() -> serve(client), "mcdevtest-client");
                            t.setDaemon(true);
                            t.start();
                        } catch (IOException e) {
                            return;
                        }
                    }
                },
                "mcdevtest-accept");
        acceptor.setDaemon(true);
        acceptor.start();
    }

    void close() {
        try {
            if (server != null) {
                server.close();
            }
            Files.deleteIfExists(socket);
        } catch (IOException ignored) {
            // shutting down
        }
    }

    private <T> T onServerThread(Callable<T> task) throws Exception {
        return Bukkit.getScheduler().callSyncMethod(plugin, task).get(15, TimeUnit.SECONDS);
    }

    private void serve(SocketChannel client) {
        try (client;
                BufferedReader in = new BufferedReader(
                        new InputStreamReader(Channels.newInputStream(client), StandardCharsets.UTF_8));
                OutputStream out = Channels.newOutputStream(client)) {
            String line;
            while ((line = in.readLine()) != null) {
                JsonObject request = JsonParser.parseString(line).getAsJsonObject();
                String cmd = request.get("cmd").getAsString();
                try {
                    switch (cmd) {
                        case "run" -> run(request, out, client);
                        case "abort" -> {
                            String player = request.get("player").getAsString();
                            boolean ended = onServerThread(() -> plugin.abort(player));
                            send(out, reply("aborted", "ended", ended));
                        }
                        case "status" -> {
                            List<String> runs = onServerThread(plugin::describeRuns);
                            JsonObject o = reply("status", null, null);
                            JsonArray array = new JsonArray();
                            runs.forEach(array::add);
                            o.add("runs", array);
                            send(out, o);
                            return;
                        }
                        case "list" -> {
                            JsonObject o = reply("list", null, null);
                            JsonArray array = new JsonArray();
                            Suites.load(plugin.suitesFile()).values().forEach(s -> array.add(s.name()));
                            o.add("suites", array);
                            send(out, o);
                            return;
                        }
                        default -> send(out, error("Unknown command " + cmd));
                    }
                } catch (Exception e) {
                    send(out, error(String.valueOf(e.getMessage())));
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // the client went away
        }
    }

    private void run(JsonObject request, OutputStream out, SocketChannel client) throws Exception {
        List<String> tests = new ArrayList<>();
        if (request.has("tests")) {
            request.getAsJsonArray("tests").forEach(e -> tests.add(e.getAsString()));
        }
        String runId = request.get("runId").getAsString();
        String suite = request.get("suite").getAsString();
        String player = request.get("player").getAsString();
        String error = onServerThread(() -> plugin.startRun(runId, suite, tests, player, event -> {
            try {
                send(out, event);
                if (event.get("t").getAsString().equals("done")) {
                    client.shutdownOutput();
                }
            } catch (IOException ignored) {
                // the client went away; the run goes on in game
            }
        }));
        if (error != null) {
            send(out, error(error));
        }
    }

    private static JsonObject reply(String type, String key, Object value) {
        JsonObject o = new JsonObject();
        o.addProperty("t", type);
        if (key != null && value instanceof Boolean b) {
            o.addProperty(key, b);
        }
        return o;
    }

    private static JsonObject error(String message) {
        JsonObject o = new JsonObject();
        o.addProperty("t", "error");
        o.addProperty("message", message);
        return o;
    }

    private static synchronized void send(OutputStream out, JsonObject o) throws IOException {
        out.write((o + "\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
    }
}

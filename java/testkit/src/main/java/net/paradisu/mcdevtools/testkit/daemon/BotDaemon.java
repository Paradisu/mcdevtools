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

package net.paradisu.mcdevtools.testkit.daemon;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.paradisu.mcdevtools.testkit.auth.Accounts;
import net.paradisu.mcdevtools.testkit.bot.Bot;
import net.paradisu.mcdevtools.testkit.bot.BotOptions;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.Via;

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
import java.util.concurrent.CountDownLatch;

/**
 * A long-running process that owns one bot and serves commands on a unix socket, so a shell, the {@code mcdev bot}
 * commands or an LLM can drive a player across many separate invocations.
 *
 * <p>Protocol: one JSON object per line. A request is {@code {"id":1,"line":"gui"}}; the response is
 * {@code {"id":1,"ok":true,"output":"..."}} or {@code {"id":1,"ok":false,"error":"..."}}.
 */
public final class BotDaemon implements Commands.BotHolder {
    private static final Gson GSON = new Gson();

    private final TestEnvironment env;
    private final BotOptions base;
    private final String defaultTarget;
    private final Path socket;
    private final CountDownLatch quit = new CountDownLatch(1);
    private volatile Bot bot;
    private final Commands commands = new Commands(this);

    /**
     * Creates a daemon.
     *
     * @param env the network description
     * @param base the bot options (the name is fixed, the target can change on {@code connect})
     * @param defaultTarget the instance to join, or null for the default
     * @param socket the socket to serve on
     */
    public BotDaemon(TestEnvironment env, BotOptions base, String defaultTarget, Path socket) {
        this.env = env;
        this.base = base;
        this.defaultTarget = defaultTarget;
        this.socket = socket;
    }

    @Override
    public Bot bot() {
        return bot;
    }

    @Override
    public synchronized Bot connect(String instance) {
        if (bot != null) {
            bot.close();
        }
        BotOptions options = copy(instance != null ? instance : defaultTarget);
        bot = Bot.connect(env, options);
        return bot;
    }

    private BotOptions copy(String target) {
        BotOptions o = BotOptions.named(base.name());
        if (target != null) {
            o.target(target);
        }
        return o.via(base.viaOrNull()).account(base.profileOrNull(), base.accessTokenOrNull());
    }

    @Override
    public void quit() {
        quit.countDown();
    }

    /**
     * Joins, then serves commands until {@code quit}.
     *
     * @throws IOException when the socket cannot be created
     * @throws InterruptedException when interrupted while serving
     */
    public void run() throws IOException, InterruptedException {
        connect(defaultTarget);
        Files.createDirectories(socket.getParent());
        Files.deleteIfExists(socket);
        ServerSocketChannel server = ServerSocketChannel.open(StandardProtocolFamily.UNIX);
        server.bind(UnixDomainSocketAddress.of(socket));
        Thread acceptor = new Thread(
                () -> {
                    while (server.isOpen()) {
                        try {
                            SocketChannel client = server.accept();
                            Thread t = new Thread(() -> serve(client), "mcdev-bot-client");
                            t.setDaemon(true);
                            t.start();
                        } catch (IOException e) {
                            return;
                        }
                    }
                },
                "mcdev-bot-accept");
        acceptor.setDaemon(true);
        acceptor.start();
        System.out.println("{\"t\":\"ready\",\"socket\":" + GSON.toJson(socket.toString()) + "}");
        quit.await();
        server.close();
        if (bot != null) {
            bot.close();
        }
        Files.deleteIfExists(socket);
    }

    private void serve(SocketChannel client) {
        try (client;
                BufferedReader in = new BufferedReader(
                        new InputStreamReader(Channels.newInputStream(client), StandardCharsets.UTF_8));
                OutputStream out = Channels.newOutputStream(client)) {
            String raw;
            while ((raw = in.readLine()) != null) {
                JsonObject response = new JsonObject();
                try {
                    JsonObject request = JsonParser.parseString(raw).getAsJsonObject();
                    if (request.has("id")) {
                        response.add("id", request.get("id"));
                    }
                    String output = commands.execute(request.get("line").getAsString());
                    response.addProperty("ok", true);
                    response.addProperty("output", output);
                } catch (CommandException | IllegalArgumentException | IllegalStateException | AssertionError e) {
                    response.addProperty("ok", false);
                    response.addProperty("error", String.valueOf(e.getMessage()));
                } catch (RuntimeException e) {
                    response.addProperty("ok", false);
                    response.addProperty("error", e.toString());
                }
                out.write((GSON.toJson(response) + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (IOException ignored) {
            // client went away
        }
    }

    /**
     * Parses daemon arguments and runs it.
     *
     * @param args {@code --env <file> --socket <path> --name <n> [--via proxy|direct] [--to <instance>] [--account
     *     <a>]}
     * @throws Exception when joining fails or the socket cannot be served
     */
    public static void main(String[] args) throws Exception {
        String envFile = null;
        String socket = null;
        String name = null;
        String via = null;
        String to = null;
        String account = null;
        for (int i = 0; i + 1 < args.length; i += 2) {
            switch (args[i]) {
                case "--env" -> envFile = args[i + 1];
                case "--socket" -> socket = args[i + 1];
                case "--name" -> name = args[i + 1];
                case "--via" -> via = args[i + 1];
                case "--to" -> to = args[i + 1];
                case "--account" -> account = args[i + 1];
                default -> throw new IllegalArgumentException("Unknown option " + args[i]);
            }
        }
        if (envFile == null || socket == null || name == null) {
            throw new IllegalArgumentException("daemon needs --env, --socket and --name");
        }
        TestEnvironment env = TestEnvironment.parse(Files.readString(Path.of(envFile)));
        // an account supplies the player's name; --name is only the label of the bot process
        BotOptions options = account != null ? Accounts.options(env, account) : BotOptions.named(name);
        if (via != null) {
            options.via(Via.valueOf(via.toUpperCase()));
        }
        try {
            new BotDaemon(env, options, to, Path.of(socket)).run();
        } catch (RuntimeException e) {
            // A refused join is an expected outcome: one clear line for `mcdev bot start`, not a stack trace
            System.err.println("ERROR: " + e.getMessage());
            System.exit(1);
        }
    }
}

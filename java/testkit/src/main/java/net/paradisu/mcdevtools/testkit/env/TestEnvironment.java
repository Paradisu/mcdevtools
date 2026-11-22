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

package net.paradisu.mcdevtools.testkit.env;

import com.google.gson.Gson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Description of the running development network, written by {@code mcdev test env} as {@code env.json}.
 *
 * <p>The file is the single source of truth for tests: where each instance listens, where its log and console sockets
 * are, and how the network authenticates players. The classes are plain Gson targets (field names equal the JSON keys),
 * because the file format is versioned by {@link #format} and shared with the TypeScript CLI.
 */
public final class TestEnvironment {
    /** The format this class reads. */
    public static final int FORMAT = 1;

    public int format;
    public String project;
    public String configDir;
    public String mcdev;
    public String minecraftVersion;
    public int protocolVersion;
    public String protocolFile;
    public String publicHost;
    public String resultsDir;
    public String accountsDir;
    public Settings test = new Settings();
    public List<InstanceInfo> instances = new ArrayList<>();

    /** The {@code [test]} table of the project config. */
    public static final class Settings {
        public String capture = "on-failure";
        public List<String> export = new ArrayList<>(List.of("flashback"));
        public List<String> logFailPatterns = new ArrayList<>(List.of("\\bERROR\\b", "Exception"));
        public List<String> logIgnorePatterns = new ArrayList<>();
    }

    /** One instance of the network. */
    public static final class InstanceInfo {
        public String name;
        public String type;
        public String family;
        /** {@code proxy}, {@code backend} or {@code standalone}. */
        public String role;

        public String network;
        public String host = "127.0.0.1";
        public int port;
        public boolean running;
        public String consoleSocket;
        public String captureSocket;
        public String testSocket;
        public String logFile;
        public String consoleLog;
        /** Whether the instance authenticates players with Mojang (only proxies and standalone servers do). */
        public boolean onlineMode;
        /** {@code modern}, {@code legacy} or {@code none}. */
        public String forwarding = "none";

        public String forwardingSecretFile;

        public boolean isProxy() {
            return "proxy".equals(role);
        }

        public boolean isBackend() {
            return "backend".equals(role);
        }
    }

    /** How a bot reaches an instance. */
    public enum Via {
        /** Through the network's proxy. */
        PROXY,
        /** Straight to a backend, forging the proxy's player forwarding. */
        DIRECT
    }

    /** A default place for a bot to join. */
    public record Target(InstanceInfo instance, Via via) {}

    /**
     * Looks an instance up by name.
     *
     * @param name the instance name
     * @return the instance
     * @throws IllegalArgumentException when there is no such instance
     */
    public InstanceInfo instance(String name) {
        return instances.stream()
                .filter(i -> i.name.equals(name))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("No instance named '" + name + "'; known: "
                        + instances.stream().map(i -> i.name).toList()));
    }

    /**
     * The default join target: a running offline-mode proxy when there is one, otherwise the first running backend
     * (reached directly). Online-mode proxies are never chosen because bots have no account unless one is given.
     *
     * @return the target, or empty when nothing is running
     */
    public Optional<Target> defaultTarget() {
        Optional<InstanceInfo> proxy = instances.stream()
                .filter(i -> i.running && i.isProxy() && !i.onlineMode)
                .findFirst();
        if (proxy.isPresent()) {
            return Optional.of(new Target(proxy.get(), Via.PROXY));
        }
        Optional<InstanceInfo> backend =
                instances.stream().filter(i -> i.running && i.isBackend()).findFirst();
        if (backend.isPresent()) {
            return Optional.of(new Target(backend.get(), Via.DIRECT));
        }
        return instances.stream()
                .filter(i -> i.running && "standalone".equals(i.role))
                .findFirst()
                .map(i -> new Target(i, Via.DIRECT));
    }

    /**
     * Instances that are running.
     *
     * @return the running instances
     */
    public List<InstanceInfo> running() {
        return instances.stream().filter(i -> i.running).toList();
    }

    /**
     * Parses an {@code env.json} document.
     *
     * @param json the document
     * @return the environment
     */
    public static TestEnvironment parse(String json) {
        TestEnvironment env = new Gson().fromJson(json, TestEnvironment.class);
        if (env == null || env.format != FORMAT) {
            throw new IllegalStateException("Unsupported test environment format "
                    + (env == null ? "(empty)" : env.format) + "; this testkit reads format " + FORMAT
                    + ". Update the testkit and mcdev together (mcdev update).");
        }
        if (env.test == null) {
            env.test = new Settings();
        }
        return env;
    }

    /**
     * Loads the environment: the file named by the {@code mcdevtools.test.env} system property or the
     * {@code MCDEV_TEST_ENV} variable, otherwise by asking {@code mcdev test env --json} from the project found by
     * walking up from the working directory (so tests also run from an IDE).
     *
     * @return the environment
     */
    public static TestEnvironment load() {
        try {
            String file = System.getProperty("mcdevtools.test.env");
            if (file == null || file.isBlank()) {
                file = System.getenv("MCDEV_TEST_ENV");
            }
            if (file != null && !file.isBlank()) {
                return parse(Files.readString(Path.of(file), StandardCharsets.UTF_8));
            }
            Path dir = Path.of("").toAbsolutePath();
            while (dir != null && !Files.exists(dir.resolve(".mcdevtools/config.toml"))) {
                dir = dir.getParent();
            }
            if (dir == null) {
                throw new IllegalStateException("No test environment: run through `mcdev test run`, or set "
                        + "MCDEV_TEST_ENV, or run from inside a project that has .mcdevtools/config.toml");
            }
            Path mcdev = dir.resolve("dev/bin/mcdev");
            Process process = new ProcessBuilder(
                            Files.isExecutable(mcdev) ? mcdev.toString() : "mcdev",
                            "test",
                            "env",
                            "--json",
                            "--no-input")
                    .directory(dir.toFile())
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
            String out = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0) {
                throw new IllegalStateException("`mcdev test env --json` failed");
            }
            int start = out.indexOf("{");
            return parse(start < 0 ? out : out.substring(start));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read the test environment: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while reading the test environment", e);
        }
    }
}

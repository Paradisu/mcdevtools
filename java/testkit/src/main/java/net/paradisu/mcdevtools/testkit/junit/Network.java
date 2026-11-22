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

package net.paradisu.mcdevtools.testkit.junit;

import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.InstanceInfo;
import net.paradisu.mcdevtools.testkit.net.ConsoleClient;
import net.paradisu.mcdevtools.testkit.net.LogWatcher;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** The running network as one test sees it: each instance's console, log and address. Closed after the test. */
public final class Network implements AutoCloseable {
    private final TestEnvironment env;
    private final Map<String, Instance> instances = new LinkedHashMap<>();

    Network(TestEnvironment env, List<String> only) throws IOException {
        this.env = env;
        for (InstanceInfo info : env.instances) {
            if (info.running && (only.isEmpty() || only.contains(info.name))) {
                instances.put(info.name, new Instance(info));
            }
        }
    }

    /**
     * The environment.
     *
     * @return the environment
     */
    public TestEnvironment env() {
        return env;
    }

    /**
     * One instance.
     *
     * @param name the instance name
     * @return the instance
     * @throws IllegalArgumentException when it is not running or not part of this test's scope
     */
    public Instance instance(String name) {
        Instance instance = instances.get(name);
        if (instance == null) {
            throw new IllegalArgumentException(
                    "Instance '" + name + "' is not running or not in scope; available: " + instances.keySet());
        }
        return instance;
    }

    /**
     * The instances this test records.
     *
     * @return the instances
     */
    public List<Instance> instances() {
        return new ArrayList<>(instances.values());
    }

    /** One instance: run console commands, read what it wrote since the test began. */
    public static final class Instance implements AutoCloseable {
        private final InstanceInfo info;
        private final ConsoleClient.Tap tap;
        private final LogWatcher logs;

        private Instance(InstanceInfo info) throws IOException {
            this.info = info;
            this.tap = new ConsoleClient(Path.of(info.consoleSocket)).tap();
            this.logs = new LogWatcher(Path.of(info.logFile));
        }

        /**
         * The instance name.
         *
         * @return the name
         */
        public String name() {
            return info.name;
        }

        /**
         * The static description.
         *
         * @return the info
         */
        public InstanceInfo info() {
            return info;
        }

        /**
         * The port it listens on.
         *
         * @return the port
         */
        public int port() {
            return info.port;
        }

        /**
         * Runs a console command and returns what the console printed during the next 1.5 seconds.
         *
         * @param command the command, without a leading slash
         * @return the new console lines, joined by newlines
         */
        public String console(String command) {
            return console(command, Duration.ofMillis(1500));
        }

        /**
         * Runs a console command and returns what the console printed during a window.
         *
         * @param command the command
         * @param collect how long to listen
         * @return the new console lines
         */
        public String console(String command, Duration collect) {
            int from = tap.lines().size();
            write(command);
            try {
                Thread.sleep(collect.toMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return joinFrom(from);
        }

        /**
         * Runs a console command and returns as soon as a new console line matches.
         *
         * @param command the command
         * @param expect a regex searched in each new line
         * @param timeout how long to wait
         * @return the new console lines, up to and including the match
         * @throws AssertionError when nothing matched in time; the message has the output that did arrive
         */
        public String console(String command, Pattern expect, Duration timeout) {
            int from = tap.lines().size();
            write(command);
            long deadline = System.nanoTime() + timeout.toNanos();
            while (System.nanoTime() < deadline) {
                List<ConsoleClient.Line> lines = tap.lines();
                for (int i = from; i < lines.size(); i++) {
                    if (expect.matcher(lines.get(i).text()).find()) {
                        return joinFrom(from);
                    }
                }
                try {
                    Thread.sleep(25);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            throw new AssertionError("Console of " + info.name + " did not print /" + expect + "/ after `" + command
                    + "` within " + timeout.toMillis() + " ms. Output:\n" + joinFrom(from));
        }

        private void write(String command) {
            try {
                tap.write(command);
            } catch (IOException e) {
                throw new IllegalStateException(
                        "Cannot write to the console of " + info.name + ": " + e.getMessage(), e);
            }
        }

        private String joinFrom(int from) {
            List<ConsoleClient.Line> lines = tap.lines();
            return String.join(
                    "\n",
                    lines.subList(Math.min(from, lines.size()), lines.size()).stream()
                            .map(ConsoleClient.Line::text)
                            .toList());
        }

        /**
         * Everything the console printed since the test began.
         *
         * @return the text
         */
        public String consoleOutput() {
            return tap.text();
        }

        /**
         * The log lines written since the test began.
         *
         * @return the lines
         */
        public List<String> logLines() {
            return logs.linesSinceMark();
        }

        LogWatcher logs() {
            return logs;
        }

        @Override
        public void close() {
            tap.close();
        }
    }

    @Override
    public void close() {
        instances.values().forEach(Instance::close);
    }
}

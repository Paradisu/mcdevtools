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

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Runs Minecraft's built-in GameTests ({@code /test run}) on an instance from a JUnit test and reports what failed.
 *
 * <p>Vanilla reports through the console and the log, not through a structured result, so this reads the console: a
 * selector that matches nothing and a run with no tests are errors, and every {@code <test> failed at <pos>!} line of
 * the test reporter is a failure. A passing test prints nothing of its own, so the run is considered finished when the
 * console has been quiet for a while. For a dedicated GameTest server on Fabric use {@code mcdev test gametest}, which
 * reads the JUnit report the loader writes.
 */
public final class GameTests {
    private static final Pattern RUNNING = Pattern.compile("Running (\\d+) tests?");
    private static final Pattern FAILED = Pattern.compile("(?m)^.*\\bfailed at\\b.*$");
    private static final Pattern NOTHING =
            Pattern.compile("(?m)^.*(No matches for selector|No tests to run|No test instances).*$");

    /**
     * What a run printed.
     *
     * @param selector the selector that was run
     * @param started how many tests the server said it started (0 when it did not say)
     * @param failures the reporter's failure lines
     * @param output the console output of the run
     */
    public record Result(String selector, int started, List<String> failures, String output) {
        /**
         * Fails when any test failed.
         *
         * @throws AssertionError listing the failures
         */
        public void assertNoFailures() {
            if (!failures.isEmpty()) {
                throw new AssertionError(failures.size() + " game test(s) failed for " + selector + ":\n  "
                        + String.join("\n  ", failures));
            }
        }
    }

    private GameTests() {}

    /**
     * Interprets the console output of a {@code /test run}.
     *
     * @param selector the selector that was run
     * @param output the console output
     * @return the result
     * @throws AssertionError when the selector matched nothing
     */
    static Result parse(String selector, String output) {
        Matcher none = NOTHING.matcher(output);
        if (none.find()) {
            throw new AssertionError(
                    "`/test run " + selector + "` ran nothing: " + none.group().strip());
        }
        Matcher running = RUNNING.matcher(output);
        int started = running.find() ? Integer.parseInt(running.group(1)) : 0;
        List<String> failures = new ArrayList<>();
        Matcher failed = FAILED.matcher(output);
        while (failed.find()) {
            failures.add(failed.group().strip());
        }
        return new Result(selector, started, failures, output);
    }

    /**
     * Runs {@code /test run <selector>} on an instance and waits until its console is quiet.
     *
     * @param instance the instance
     * @param selector a test or tag selector, for example {@code mymod:*}
     * @param timeout the longest to wait for the whole run
     * @param quiet how long the console must stay silent for the run to count as finished
     * @return the result
     * @throws AssertionError when the selector matches nothing
     */
    public static Result run(Network.Instance instance, String selector, Duration timeout, Duration quiet) {
        int from = instance.consoleOutput().length();
        instance.console("test run " + selector, Duration.ofMillis(500));
        long deadline = System.nanoTime() + timeout.toNanos();
        int length = instance.consoleOutput().length();
        long lastChange = System.nanoTime();
        while (System.nanoTime() < deadline) {
            sleep(250);
            int now = instance.consoleOutput().length();
            if (now != length) {
                length = now;
                lastChange = System.nanoTime();
            } else if (System.nanoTime() - lastChange > quiet.toNanos()) {
                break;
            }
        }
        String output = instance.consoleOutput();
        return parse(selector, output.substring(Math.min(from, output.length())));
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

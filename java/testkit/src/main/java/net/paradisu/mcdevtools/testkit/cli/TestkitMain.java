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

package net.paradisu.mcdevtools.testkit.cli;

import net.paradisu.mcdevtools.testkit.daemon.BotDaemon;

import java.util.Arrays;

/**
 * Entry point of the {@code testkit} tool that {@code mcdev} runs: {@code daemon}, {@code doctor} and {@code login}.
 */
public final class TestkitMain {
    private TestkitMain() {}

    /**
     * Runs a subcommand.
     *
     * @param args the subcommand and its options
     * @throws Exception when the subcommand fails
     */
    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            System.err.println("usage: testkit daemon|doctor|login ...");
            System.exit(2);
        }
        String[] rest = Arrays.copyOfRange(args, 1, args.length);
        switch (args[0]) {
            case "daemon" -> BotDaemon.main(rest);
            case "doctor" -> System.exit(Doctor.run(rest));
            case "login" -> System.exit(Login.run(rest));
            default -> {
                System.err.println("Unknown subcommand " + args[0]);
                System.exit(2);
            }
        }
    }
}

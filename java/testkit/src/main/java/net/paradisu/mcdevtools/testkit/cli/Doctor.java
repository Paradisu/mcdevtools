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

import net.paradisu.mcdevtools.testkit.bot.Bot;
import net.paradisu.mcdevtools.testkit.bot.BotOptions;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.InstanceInfo;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.Via;
import org.geysermc.mcprotocollib.protocol.MinecraftProtocol;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * {@code testkit doctor --env <file>}: checks that the bundled protocol library matches the server's Minecraft version
 * and that a bot can join every running instance. Run it first after a Minecraft update.
 */
final class Doctor {
    private Doctor() {}

    static int run(String[] args) throws Exception {
        if (args.length < 2 || !args[0].equals("--env")) {
            System.err.println("usage: testkit doctor --env <file>");
            return 2;
        }
        TestEnvironment env = TestEnvironment.parse(Files.readString(Path.of(args[1])));
        boolean ok = true;

        int library = new MinecraftProtocol().getCodec().getProtocolVersion();
        if (library == env.protocolVersion) {
            report(
                    true,
                    "protocol",
                    "library and server agree on protocol " + library + " (" + env.minecraftVersion + ")");
        } else {
            ok = false;
            report(
                    false,
                    "protocol",
                    "MCProtocolLib speaks protocol " + library + " but the server is " + env.protocolVersion + " ("
                            + env.minecraftVersion + "); bump mcprotocollib in java/gradle/libs.versions.toml");
        }

        for (InstanceInfo instance : env.instances) {
            if (!instance.running) {
                report(true, instance.name, "not running, skipped");
                continue;
            }
            Via via = instance.isProxy() ? Via.PROXY : Via.DIRECT;
            if (instance.isProxy() && instance.onlineMode) {
                report(true, instance.name, "online-mode proxy, skipped (needs a Microsoft account)");
                continue;
            }
            try (Bot bot = Bot.connect(
                    env, BotOptions.named("McDevDoctor").target(instance.name).via(via))) {
                report(true, instance.name, "joined (" + via.name().toLowerCase() + "): " + bot.status());
            } catch (RuntimeException e) {
                ok = false;
                report(false, instance.name, String.valueOf(e.getMessage()));
            }
        }
        return ok ? 0 : 1;
    }

    private static void report(boolean ok, String what, String detail) {
        System.out.println((ok ? "PASS " : "FAIL ") + what + " " + detail);
    }
}

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

import com.google.gson.JsonObject;
import net.paradisu.mcdevtools.testkit.auth.Accounts;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import org.geysermc.mcprotocollib.auth.GameProfile;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * {@code testkit login --env <file> --account <name>}: signs a Microsoft account in with a device code and saves the
 * session. Prints one JSON object per line: {@code {"t":"code","url":...,"code":...}} for the user to act on, then
 * {@code {"t":"done","name":...}} or {@code {"t":"error","message":...}}.
 */
final class Login {
    private Login() {}

    static int run(String[] args) throws Exception {
        String envFile = null;
        String account = null;
        for (int i = 0; i + 1 < args.length; i += 2) {
            switch (args[i]) {
                case "--env" -> envFile = args[i + 1];
                case "--account" -> account = args[i + 1];
                default -> {
                    System.err.println("Unknown option " + args[i]);
                    return 2;
                }
            }
        }
        if (envFile == null || account == null) {
            System.err.println("usage: testkit login --env <file> --account <name>");
            return 2;
        }
        TestEnvironment env = TestEnvironment.parse(Files.readString(Path.of(envFile)));
        try {
            GameProfile profile = Accounts.login(env, account, code -> {
                JsonObject o = new JsonObject();
                o.addProperty("t", "code");
                o.addProperty("url", code.getVerificationUri());
                o.addProperty("direct", code.getDirectVerificationUri());
                o.addProperty("code", code.getUserCode());
                System.out.println(o);
                System.out.flush();
            });
            JsonObject done = new JsonObject();
            done.addProperty("t", "done");
            done.addProperty("name", profile.getName());
            System.out.println(done);
            return 0;
        } catch (Exception e) {
            JsonObject error = new JsonObject();
            error.addProperty("t", "error");
            error.addProperty("message", String.valueOf(e.getMessage()));
            System.out.println(error);
            return 1;
        }
    }
}

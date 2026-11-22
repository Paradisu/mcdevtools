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
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The manual test suites, read from the JSON file {@code mcdev} renders from {@code .mcdevtools/tests/manual/*.toml}.
 * The file is read again for every use, so editing a suite needs no restart.
 */
final class Suites {
    /** One manual test. */
    record ManualTest(
            String id, String title, List<String> setup, List<String> steps, String expect, List<String> cleanup) {}

    /** A named group of manual tests. */
    record Suite(String name, String title, String on, List<ManualTest> tests) {}

    private Suites() {}

    /**
     * Reads the suites file.
     *
     * @param file the JSON file
     * @return the suites by name, empty when the file does not exist
     * @throws IOException when the file cannot be read or is malformed
     */
    static Map<String, Suite> load(Path file) throws IOException {
        Map<String, Suite> out = new LinkedHashMap<>();
        if (file == null || !Files.isRegularFile(file)) {
            return out;
        }
        try {
            JsonObject root = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8))
                    .getAsJsonObject();
            for (JsonElement e : root.getAsJsonArray("suites")) {
                JsonObject s = e.getAsJsonObject();
                List<ManualTest> tests = new ArrayList<>();
                for (JsonElement t : s.getAsJsonArray("tests")) {
                    JsonObject o = t.getAsJsonObject();
                    tests.add(new ManualTest(
                            o.get("id").getAsString(),
                            o.get("title").getAsString(),
                            strings(o.getAsJsonArray("setup")),
                            strings(o.getAsJsonArray("steps")),
                            o.get("expect").getAsString(),
                            strings(o.getAsJsonArray("cleanup"))));
                }
                out.put(
                        s.get("name").getAsString(),
                        new Suite(
                                s.get("name").getAsString(),
                                s.get("title").getAsString(),
                                s.has("on") && !s.get("on").isJsonNull()
                                        ? s.get("on").getAsString()
                                        : null,
                                tests));
            }
        } catch (RuntimeException e) {
            throw new IOException("Malformed suites file " + file + ": " + e.getMessage(), e);
        }
        return out;
    }

    private static List<String> strings(JsonArray array) {
        List<String> out = new ArrayList<>();
        if (array != null) {
            array.forEach(e -> out.add(e.getAsString()));
        }
        return out;
    }
}

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

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Names for protocol ids (items, entity types), read from the {@code protocol.json} that {@code mcdev capture protocol}
 * generates from Mojang's data generator. Missing tables degrade to {@code item#<id>}.
 */
public final class Protocol {
    private final List<String> items;
    private final List<String> entityTypes;

    private Protocol(List<String> items, List<String> entityTypes) {
        this.items = items;
        this.entityTypes = entityTypes;
    }

    /**
     * Loads the table.
     *
     * @param file the {@code protocol.json}, or null for an empty table
     * @return the table
     */
    public static Protocol load(String file) {
        if (file == null || !Files.isRegularFile(Path.of(file))) {
            return new Protocol(List.of(), List.of());
        }
        try {
            JsonObject root = JsonParser.parseString(Files.readString(Path.of(file), StandardCharsets.UTF_8))
                    .getAsJsonObject();
            return new Protocol(strings(root.get("items")), strings(root.get("entityTypes")));
        } catch (IOException | RuntimeException e) {
            return new Protocol(List.of(), List.of());
        }
    }

    private static List<String> strings(JsonElement element) {
        List<String> out = new ArrayList<>();
        if (element != null && element.isJsonArray()) {
            JsonArray array = element.getAsJsonArray();
            array.forEach(e -> out.add(e.isJsonNull() ? "" : e.getAsString()));
        }
        return out;
    }

    /**
     * Name of an item id.
     *
     * @param id the protocol id
     * @return for example {@code minecraft:diamond}
     */
    public String item(int id) {
        return id >= 0 && id < items.size() && !items.get(id).isEmpty() ? items.get(id) : "item#" + id;
    }

    /**
     * Name of an entity type id.
     *
     * @param id the protocol id
     * @return for example {@code minecraft:player}
     */
    public String entityType(int id) {
        return id >= 0 && id < entityTypes.size() && !entityTypes.get(id).isEmpty()
                ? entityTypes.get(id)
                : "entity#" + id;
    }
}

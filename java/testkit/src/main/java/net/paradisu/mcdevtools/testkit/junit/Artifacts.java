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

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The folder a test writes its evidence to: {@code <results>/<run>/<class>/<method>/}. The extension fills it with
 * console, log, chat and packet files; a test can add its own.
 */
public final class Artifacts {
    private final Path dir;

    Artifacts(Path dir) throws IOException {
        this.dir = dir;
        Files.createDirectories(dir);
    }

    /**
     * The folder.
     *
     * @return the path
     */
    public Path dir() {
        return dir;
    }

    /**
     * Writes a text file into the folder.
     *
     * @param name the file name
     * @param content the text
     * @return the file
     */
    public Path write(String name, String content) {
        try {
            Path file = dir.resolve(name);
            Files.writeString(file, content, StandardCharsets.UTF_8);
            return file;
        } catch (IOException e) {
            throw new IllegalStateException("Cannot write " + name + ": " + e.getMessage(), e);
        }
    }
}

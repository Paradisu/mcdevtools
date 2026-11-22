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

package net.paradisu.mcdevtools.testkit.net;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Reads what an instance appended to its log file since a mark, and finds errors in it. */
public final class LogWatcher {
    private final Path file;
    private long mark;

    /**
     * Creates a watcher and marks the current end of the log.
     *
     * @param file the log file (it may not exist yet)
     */
    public LogWatcher(Path file) {
        this.file = file;
        mark();
    }

    /** Moves the mark to the current end of the log. */
    public synchronized void mark() {
        mark = sizeOf();
    }

    private long sizeOf() {
        try {
            return Files.exists(file) ? Files.size(file) : 0;
        } catch (IOException e) {
            return 0;
        }
    }

    /**
     * The lines appended since the mark. A log that shrank (rotated at restart) is read from its start.
     *
     * @return the lines, oldest first
     */
    public synchronized List<String> linesSinceMark() {
        long size = sizeOf();
        long from = size < mark ? 0 : mark;
        if (size == from) {
            return List.of();
        }
        try (RandomAccessFile raf = new RandomAccessFile(file.toFile(), "r")) {
            raf.seek(from);
            byte[] bytes = new byte[(int) Math.min(size - from, 64L * 1024 * 1024)];
            raf.readFully(bytes);
            String text = new String(bytes, StandardCharsets.UTF_8);
            List<String> lines = new ArrayList<>(List.of(text.split("\r?\n", -1)));
            if (!lines.isEmpty() && lines.get(lines.size() - 1).isEmpty()) {
                lines.remove(lines.size() - 1);
            }
            return lines;
        } catch (IOException e) {
            return List.of();
        }
    }

    /**
     * Lines since the mark that match a failure pattern, with the stack trace that follows each one.
     *
     * @param fail patterns that mark a failure
     * @param ignore patterns that excuse a line
     * @return the offending lines
     */
    public List<String> errors(List<Pattern> fail, List<Pattern> ignore) {
        List<String> lines = linesSinceMark();
        List<String> out = new ArrayList<>();
        boolean inTrace = false;
        for (String line : lines) {
            boolean trace = line.startsWith("\tat ")
                    || line.startsWith("    at ")
                    || line.startsWith("Caused by:")
                    || line.startsWith("\t... ");
            if (inTrace && trace) {
                out.add(line);
                continue;
            }
            inTrace = false;
            boolean excused = ignore.stream().anyMatch(p -> p.matcher(line).find());
            if (!excused && fail.stream().anyMatch(p -> p.matcher(line).find())) {
                out.add(line);
                inTrace = true;
            }
        }
        return out;
    }
}

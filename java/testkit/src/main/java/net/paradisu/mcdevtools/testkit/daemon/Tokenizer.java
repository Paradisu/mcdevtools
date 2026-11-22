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

package net.paradisu.mcdevtools.testkit.daemon;

import java.util.ArrayList;
import java.util.List;

/** Splits a command line into words, honouring double quotes and backslash escapes inside them. */
final class Tokenizer {
    private Tokenizer() {}

    /**
     * Splits a line.
     *
     * @param line the line
     * @return the words
     */
    static List<String> split(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder word = new StringBuilder();
        boolean quoted = false;
        boolean has = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (quoted && c == '\\' && i + 1 < line.length()) {
                word.append(line.charAt(++i));
            } else if (c == '"') {
                quoted = !quoted;
                has = true;
            } else if (Character.isWhitespace(c) && !quoted) {
                if (has || word.length() > 0) {
                    out.add(word.toString());
                    word.setLength(0);
                    has = false;
                }
            } else {
                word.append(c);
            }
        }
        if (has || word.length() > 0) {
            out.add(word.toString());
        }
        return out;
    }
}

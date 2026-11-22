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

package net.paradisu.mcdevtools.testkit.bot;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.KeybindComponent;
import net.kyori.adventure.text.NBTComponent;
import net.kyori.adventure.text.ScoreComponent;
import net.kyori.adventure.text.SelectorComponent;
import net.kyori.adventure.text.TextComponent;
import net.kyori.adventure.text.TranslatableComponent;
import net.kyori.adventure.text.TranslationArgument;

import java.util.Map;

/** Flattens Adventure components to the plain text a player would read (no formatting, no client language file). */
public final class Text {
    /** The few vanilla translations that matter for assertions; everything else renders as its key and arguments. */
    private static final Map<String, String> TRANSLATIONS = Map.of(
            "multiplayer.player.joined", "%s joined the game",
            "multiplayer.player.left", "%s left the game",
            "chat.type.text", "<%s> %s",
            "chat.type.announcement", "[%s] %s",
            "commands.message.display.incoming", "%s whispers to you: %s");

    private Text() {}

    /**
     * Flattens a component.
     *
     * @param component the component, may be null
     * @return its plain text
     */
    public static String plain(Component component) {
        if (component == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        append(out, component);
        return out.toString();
    }

    private static void append(StringBuilder out, Component c) {
        if (c instanceof TextComponent text) {
            out.append(text.content());
        } else if (c instanceof TranslatableComponent tr) {
            String format = TRANSLATIONS.getOrDefault(tr.key(), tr.fallback());
            Object[] args = tr.arguments().stream().map(Text::argument).toArray();
            if (format != null) {
                out.append(String.format(format, args));
            } else {
                out.append(tr.key());
                if (args.length > 0) {
                    out.append('(');
                    for (int i = 0; i < args.length; i++) {
                        out.append(i == 0 ? "" : ", ").append(args[i]);
                    }
                    out.append(')');
                }
            }
        } else if (c instanceof KeybindComponent key) {
            out.append(key.keybind());
        } else if (c instanceof ScoreComponent score) {
            out.append(score.name());
        } else if (c instanceof SelectorComponent selector) {
            out.append(selector.pattern());
        } else if (c instanceof NBTComponent<?> nbt) {
            out.append(nbt.nbtPath());
        }
        for (Component child : c.children()) {
            append(out, child);
        }
    }

    private static String argument(TranslationArgument argument) {
        Object value = argument.value();
        return value instanceof Component component ? plain(component) : String.valueOf(value);
    }
}

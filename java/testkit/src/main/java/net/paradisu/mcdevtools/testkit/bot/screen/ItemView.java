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

package net.paradisu.mcdevtools.testkit.bot.screen;

import net.kyori.adventure.text.Component;
import net.paradisu.mcdevtools.testkit.bot.Text;
import net.paradisu.mcdevtools.testkit.env.Protocol;
import org.geysermc.mcprotocollib.protocol.data.game.item.ItemStack;
import org.geysermc.mcprotocollib.protocol.data.game.item.component.DataComponentTypes;
import org.geysermc.mcprotocollib.protocol.data.game.item.component.DataComponents;

import java.util.ArrayList;
import java.util.List;

/**
 * A readable item in a container slot.
 *
 * @param slot the slot index
 * @param id the item name, for example {@code minecraft:diamond}
 * @param count the stack size
 * @param name the custom or item name as plain text, empty when there is none
 * @param lore the lore lines as plain text
 * @param components the keys of the data components the stack carries
 */
public record ItemView(int slot, String id, int count, String name, List<String> lore, List<String> components) {
    /**
     * Converts a stack.
     *
     * @param slot the slot index
     * @param stack the stack, may be null
     * @param protocol the name table
     * @return the view, or null when the slot is empty
     */
    public static ItemView of(int slot, ItemStack stack, Protocol protocol) {
        if (stack == null || stack.getAmount() <= 0) {
            return null;
        }
        String name = "";
        List<String> lore = new ArrayList<>();
        List<String> keys = new ArrayList<>();
        DataComponents patch = stack.getDataComponentsPatch();
        if (patch != null) {
            Component custom = patch.get(DataComponentTypes.CUSTOM_NAME);
            if (custom == null) {
                custom = patch.get(DataComponentTypes.ITEM_NAME);
            }
            name = Text.plain(custom);
            List<Component> loreLines = patch.get(DataComponentTypes.LORE);
            if (loreLines != null) {
                loreLines.forEach(l -> lore.add(Text.plain(l)));
            }
            patch.getDataComponents().keySet().forEach(t -> keys.add(t.getKey().asString()));
        }
        return new ItemView(slot, protocol.item(stack.getId()), stack.getAmount(), name, lore, keys);
    }

    /**
     * One-line description for listings.
     *
     * @return for example {@code 13: minecraft:diamond x1 "Warps"}
     */
    public String line() {
        return slot + ": " + id + " x" + count + (name.isEmpty() ? "" : " \"" + name + "\"")
                + (lore.isEmpty() ? "" : " " + lore);
    }

    /**
     * Full description for tooltips.
     *
     * @return the item with its name, every lore line and the component keys
     */
    public String tooltip() {
        StringBuilder out = new StringBuilder(id + " x" + count);
        if (!name.isEmpty()) {
            out.append("\n  name: ").append(name);
        }
        lore.forEach(l -> out.append("\n  lore: ").append(l));
        if (!components.isEmpty()) {
            out.append("\n  components: ").append(String.join(", ", components));
        }
        return out.toString();
    }
}

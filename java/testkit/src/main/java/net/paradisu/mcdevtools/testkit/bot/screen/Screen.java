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

import net.paradisu.mcdevtools.testkit.env.Protocol;
import org.geysermc.mcprotocollib.protocol.data.game.item.ItemStack;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * The bot's model of an open container (a chest menu, an anvil, the player's own inventory with id 0).
 *
 * <p>It is only the server's last word: the bot never predicts the result of a click, so after clicking wait for the
 * next update instead of reading the slots at once.
 */
public final class Screen {
    private final int containerId;
    private final String type;
    private final String title;
    private final Protocol protocol;
    private int stateId;
    private ItemStack[] items = new ItemStack[0];
    private ItemStack carried;
    private final Map<Integer, Integer> properties = new HashMap<>();
    private long version;

    /**
     * Creates a screen.
     *
     * @param containerId the container id used in click packets
     * @param type the menu type name, for example {@code GENERIC_9X3}
     * @param title the title as plain text
     * @param protocol the item name table
     */
    public Screen(int containerId, String type, String title, Protocol protocol) {
        this.containerId = containerId;
        this.type = type;
        this.title = title;
        this.protocol = protocol;
    }

    /**
     * The container id.
     *
     * @return the id
     */
    public int containerId() {
        return containerId;
    }

    /**
     * The menu type.
     *
     * @return the type name
     */
    public String type() {
        return type;
    }

    /**
     * The title.
     *
     * @return the plain title
     */
    public String title() {
        return title;
    }

    /**
     * The state id the next click must carry.
     *
     * @return the state id
     */
    public synchronized int stateId() {
        return stateId;
    }

    /**
     * Counts every update; used to wait for the server's answer to a click.
     *
     * @return the update counter
     */
    public synchronized long version() {
        return version;
    }

    /**
     * Replaces all slots.
     *
     * @param stateId the new state id
     * @param newItems every slot
     * @param carriedItem the cursor stack
     */
    public synchronized void setContent(int stateId, ItemStack[] newItems, ItemStack carriedItem) {
        this.stateId = stateId;
        this.items = newItems.clone();
        this.carried = carriedItem;
        version++;
        notifyAll();
    }

    /**
     * Replaces one slot. Slot -1 is the cursor.
     *
     * @param stateId the new state id
     * @param slot the slot
     * @param item the stack
     */
    public synchronized void setSlot(int stateId, int slot, ItemStack item) {
        this.stateId = stateId;
        if (slot == -1) {
            carried = item;
        } else {
            if (slot >= items.length) {
                ItemStack[] grown = new ItemStack[slot + 1];
                System.arraycopy(items, 0, grown, 0, items.length);
                items = grown;
            }
            if (slot >= 0) {
                items[slot] = item;
            }
        }
        version++;
        notifyAll();
    }

    /**
     * Sets the cursor stack.
     *
     * @param item the stack
     */
    public synchronized void setCursor(ItemStack item) {
        carried = item;
        version++;
        notifyAll();
    }

    /**
     * Sets a container property such as furnace progress or anvil cost.
     *
     * @param id the property id
     * @param value the value
     */
    public synchronized void setProperty(int id, int value) {
        properties.put(id, value);
        version++;
        notifyAll();
    }

    /**
     * The container properties.
     *
     * @return a copy
     */
    public synchronized Map<Integer, Integer> properties() {
        return new HashMap<>(properties);
    }

    /**
     * Waits until the screen was updated after a given version.
     *
     * @param after a value from {@link #version()}
     * @param timeoutMillis how long to wait
     * @return true when an update arrived
     */
    public synchronized boolean awaitUpdate(long after, long timeoutMillis) {
        long deadline = System.nanoTime() + timeoutMillis * 1_000_000;
        while (version <= after) {
            long left = (deadline - System.nanoTime()) / 1_000_000;
            if (left <= 0) {
                return false;
            }
            try {
                wait(left);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return true;
    }

    /**
     * Waits until the screen satisfies a condition, re-checking after every server update. A click usually causes
     * several updates, so prefer this to reading slots right after {@code click}.
     *
     * @param condition the condition on this screen
     * @param timeoutMillis how long to wait
     * @param what what is awaited, for the failure message
     * @throws AssertionError when the condition did not hold in time; the message describes the screen
     */
    public synchronized void await(Predicate<Screen> condition, long timeoutMillis, String what) {
        long deadline = System.nanoTime() + timeoutMillis * 1_000_000;
        while (!condition.test(this)) {
            long left = (deadline - System.nanoTime()) / 1_000_000;
            if (left <= 0) {
                throw new AssertionError("Timed out waiting for " + what + "; the screen is:\n" + describe());
            }
            try {
                wait(left);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Interrupted while waiting for " + what, e);
            }
        }
    }

    /**
     * The non-empty slots.
     *
     * @return the items, by slot
     */
    public synchronized List<ItemView> slots() {
        List<ItemView> out = new ArrayList<>();
        for (int i = 0; i < items.length; i++) {
            ItemView view = ItemView.of(i, items[i], protocol);
            if (view != null) {
                out.add(view);
            }
        }
        return out;
    }

    /**
     * One slot.
     *
     * @param slot the slot index
     * @return the item, or null when empty or out of range
     */
    public synchronized ItemView slot(int slot) {
        return slot >= 0 && slot < items.length ? ItemView.of(slot, items[slot], protocol) : null;
    }

    /**
     * The number of slots the server sent.
     *
     * @return the size
     */
    public synchronized int size() {
        return items.length;
    }

    /**
     * The stack on the cursor.
     *
     * @return the item, or null when empty
     */
    public synchronized ItemView cursor() {
        return ItemView.of(-1, carried, protocol);
    }

    /**
     * Counts the slots whose item has a given id.
     *
     * @param id the item name
     * @return the total item count
     */
    public synchronized int count(String id) {
        return slots().stream()
                .filter(v -> v.id().equals(id))
                .mapToInt(ItemView::count)
                .sum();
    }

    /**
     * Describes the screen the way HeadlessMC's {@code gui} command does: type, title and every non-empty slot.
     *
     * @return multi-line text
     */
    public String describe() {
        StringBuilder out = new StringBuilder(
                "Screen " + type + " (container " + containerId + ") \"" + title + "\", " + size() + " slots");
        slots().forEach(v -> out.append("\n  ").append(v.line()));
        ItemView cursor = cursor();
        if (cursor != null) {
            out.append("\n  cursor: ").append(cursor.line());
        }
        return out.toString();
    }
}

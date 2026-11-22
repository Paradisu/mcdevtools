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

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * A bounded, thread-safe, append-only log with monotonically increasing sequence numbers.
 *
 * <p>Tests take a {@link #mark()} before acting and then look at what arrived {@link #since(long)} or
 * {@link #await(Predicate, Duration, long, String)} it, so earlier traffic never satisfies a later assertion. The
 * oldest entries are dropped once the capacity is reached; sequence numbers keep counting.
 *
 * @param <T> the entry type
 */
public final class EventLog<T> {
    /** One entry with its sequence number. */
    public record Entry<T>(long seq, T value) {}

    private final int capacity;
    private final ArrayDeque<Entry<T>> entries = new ArrayDeque<>();
    private long seq;

    /**
     * Creates a log.
     *
     * @param capacity the most entries kept
     */
    public EventLog(int capacity) {
        this.capacity = Math.max(1, capacity);
    }

    /**
     * Appends an entry and wakes waiters.
     *
     * @param value the entry
     * @return its sequence number
     */
    public synchronized long append(T value) {
        long n = ++seq;
        entries.addLast(new Entry<>(n, value));
        while (entries.size() > capacity) {
            entries.removeFirst();
        }
        notifyAll();
        return n;
    }

    /**
     * The current position: entries appended later have a greater sequence number.
     *
     * @return the position
     */
    public synchronized long mark() {
        return seq;
    }

    /**
     * Entries appended after a mark.
     *
     * @param mark a value from {@link #mark()} (0 for everything kept)
     * @return the entries, oldest first
     */
    public synchronized List<Entry<T>> entriesSince(long mark) {
        List<Entry<T>> out = new ArrayList<>();
        for (Entry<T> e : entries) {
            if (e.seq() > mark) {
                out.add(e);
            }
        }
        return out;
    }

    /**
     * Values appended after a mark.
     *
     * @param mark a value from {@link #mark()}
     * @return the values, oldest first
     */
    public List<T> since(long mark) {
        return entriesSince(mark).stream().map(Entry::value).toList();
    }

    /**
     * The newest entries.
     *
     * @param n how many at most
     * @return the entries, oldest first
     */
    public synchronized List<Entry<T>> last(int n) {
        List<Entry<T>> all = new ArrayList<>(entries);
        return all.subList(Math.max(0, all.size() - n), all.size());
    }

    /**
     * Finds the first entry after a mark that matches, without waiting.
     *
     * @param predicate the condition
     * @param from a value from {@link #mark()}
     * @return the match
     */
    public synchronized Optional<T> find(Predicate<T> predicate, long from) {
        for (Entry<T> e : entries) {
            if (e.seq() > from && predicate.test(e.value())) {
                return Optional.of(e.value());
            }
        }
        return Optional.empty();
    }

    /**
     * Waits for a matching entry after a mark.
     *
     * @param predicate the condition
     * @param timeout how long to wait
     * @param from a value from {@link #mark()}
     * @param what what is awaited, for the failure message
     * @return the first match
     * @throws AssertionError when nothing matched in time; the message lists the latest entries
     */
    public synchronized T await(Predicate<T> predicate, Duration timeout, long from, String what) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (true) {
            Optional<T> found = find(predicate, from);
            if (found.isPresent()) {
                return found.get();
            }
            long left = deadline - System.nanoTime();
            if (left <= 0) {
                StringBuilder message = new StringBuilder(
                        "Timed out after " + timeout.toMillis() + " ms waiting for " + what + ". Latest entries:");
                List<Entry<T>> tail = last(20);
                if (tail.isEmpty()) {
                    message.append(" (none)");
                }
                for (Entry<T> e : tail) {
                    message.append("\n  #").append(e.seq()).append(' ').append(e.value());
                }
                throw new AssertionError(message.toString());
            }
            try {
                wait(Math.max(1, left / 1_000_000));
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Interrupted while waiting for " + what, ex);
            }
        }
    }
}

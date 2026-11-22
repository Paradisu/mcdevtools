package net.paradisu.mcdevtools.testkit.bot;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventLogTest {
    @Test
    void sinceIgnoresEarlierEntries() {
        EventLog<String> log = new EventLog<>(10);
        log.append("old");
        long mark = log.mark();
        log.append("new");
        assertEquals(List.of("new"), log.since(mark));
    }

    @Test
    void awaitIgnoresEntriesBeforeTheMark() {
        EventLog<String> log = new EventLog<>(10);
        log.append("hello");
        long mark = log.mark();
        AssertionError error = assertThrows(
                AssertionError.class, () -> log.await("hello"::equals, Duration.ofMillis(50), mark, "hello"));
        assertTrue(error.getMessage().contains("Timed out"), error.getMessage());
    }

    @Test
    void awaitReturnsALaterEntry() throws Exception {
        EventLog<String> log = new EventLog<>(10);
        long mark = log.mark();
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(50);
            } catch (InterruptedException ignored) {
                // test thread
            }
            log.append("hi");
        });
        t.start();
        assertEquals("hi", log.await("hi"::equals, Duration.ofSeconds(5), mark, "hi"));
    }

    @Test
    void oldestEntriesAreDroppedButSequenceKeepsCounting() {
        EventLog<Integer> log = new EventLog<>(3);
        for (int i = 1; i <= 5; i++) {
            log.append(i);
        }
        assertEquals(List.of(3, 4, 5), log.since(0));
        assertEquals(5, log.mark());
    }
}

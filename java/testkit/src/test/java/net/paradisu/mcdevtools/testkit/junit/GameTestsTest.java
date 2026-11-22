package net.paradisu.mcdevtools.testkit.junit;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameTestsTest {
    @Test
    void aSelectorThatMatchesNothingIsAnError() {
        AssertionError e = assertThrows(
                AssertionError.class,
                () -> GameTests.parse(
                        "minecraft:nothing",
                        "[04:10:57 INFO]: System chat: No matches for selector 'minecraft:nothing' of type 'minecraft:test_instance'"));
        assertTrue(e.getMessage().contains("ran nothing"), e.getMessage());
    }

    @Test
    void noTestsIsAnError() {
        assertThrows(AssertionError.class, () -> GameTests.parse("x", "[04:11:03 INFO]: System chat: No tests to run"));
    }

    @Test
    void failureLinesAndTheStartedCountAreRead() {
        var result = GameTests.parse(
                "mymod:*",
                String.join(
                        "\n",
                        "[10:00:00 INFO]: System chat: Running 3 tests...",
                        "[10:00:02 WARN]: mymod:door failed at 1,2,3! The door never opened",
                        "[10:00:03 INFO]: something else"));
        assertEquals(3, result.started());
        assertEquals(1, result.failures().size());
        assertTrue(result.failures().get(0).contains("mymod:door failed at"));
        AssertionError e = assertThrows(AssertionError.class, result::assertNoFailures);
        assertTrue(e.getMessage().contains("The door never opened"));
    }

    @Test
    void aQuietRunWithNoFailuresPasses() {
        GameTests.parse("a", "[10:00:00 INFO]: System chat: Running 2 tests...").assertNoFailures();
    }
}

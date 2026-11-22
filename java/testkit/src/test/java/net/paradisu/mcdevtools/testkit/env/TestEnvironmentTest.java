package net.paradisu.mcdevtools.testkit.env;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TestEnvironmentTest {
    private static final String JSON = """
            {"format":1,"minecraftVersion":"26.3","protocolVersion":777,
             "instances":[
              {"name":"proxy","role":"proxy","port":25565,"running":true,"onlineMode":true},
              {"name":"lobby","role":"backend","port":30066,"running":true,"forwarding":"modern"},
              {"name":"creative","role":"backend","port":30067,"running":false}]}
            """;

    @Test
    void anOnlineProxyIsNotTheDefaultTarget() {
        TestEnvironment env = TestEnvironment.parse(JSON);
        TestEnvironment.Target target = env.defaultTarget().orElseThrow();
        assertEquals("lobby", target.instance().name);
        assertEquals(TestEnvironment.Via.DIRECT, target.via());
    }

    @Test
    void anOfflineProxyIsTheDefaultTarget() {
        TestEnvironment env = TestEnvironment.parse(JSON.replace("\"onlineMode\":true", "\"onlineMode\":false"));
        assertEquals(
                TestEnvironment.Via.PROXY, env.defaultTarget().orElseThrow().via());
    }

    @Test
    void unknownInstancesListTheKnownOnes() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> TestEnvironment.parse(JSON)
                .instance("nope"));
        assertTrue(e.getMessage().contains("lobby"));
    }

    @Test
    void rejectsAnotherFormat() {
        assertThrows(IllegalStateException.class, () -> TestEnvironment.parse("{\"format\":2}"));
    }
}

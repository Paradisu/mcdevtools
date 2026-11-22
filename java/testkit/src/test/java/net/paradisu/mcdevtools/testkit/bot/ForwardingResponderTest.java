package net.paradisu.mcdevtools.testkit.bot;

import org.junit.jupiter.api.Test;

import java.util.HexFormat;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ForwardingResponderTest {
    @Test
    void offlineUuidMatchesVanilla() {
        assertEquals(UUID.fromString("5627dd98-e6be-3c21-b8a8-e92344183641"), ForwardingResponder.offlineUuid("Steve"));
    }

    @Test
    void modernAnswerMatchesAnIndependentImplementation() {
        // Computed with Python's hmac/hashlib, not with this code
        String expected = "8332314f33382acc298f79e2ba7bd7441773df6db11ba2683692a2e90c2ac06f"
                + "01093132372e302e302e315627dd98e6be3c21b8a8e9234418364105537465766500";
        byte[] answer = ForwardingResponder.modernAnswer(
                "secret".getBytes(), "127.0.0.1", ForwardingResponder.offlineUuid("Steve"), "Steve");
        assertEquals(expected, HexFormat.of().formatHex(answer));
    }

    @Test
    void legacyHostCarriesAddressAndUndashedUuid() {
        assertEquals(
                "lobby\0" + "127.0.0.1\0" + "5627dd98e6be3c21b8a8e92344183641\0[]",
                ForwardingResponder.legacyHost("lobby", "127.0.0.1", ForwardingResponder.offlineUuid("Steve")));
    }
}

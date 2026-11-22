package net.paradisu.mcdevtools.testkit.daemon;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TokenizerTest {
    @Test
    void splitsOnWhitespaceAndKeepsQuotedWords() {
        assertEquals(List.of("text", "hello world", "x"), Tokenizer.split("text \"hello world\"  x"));
    }

    @Test
    void keepsEmptyQuotedWordsAndEscapes() {
        assertEquals(List.of("sign", "", "a\"b"), Tokenizer.split("sign \"\" \"a\\\"b\""));
    }
}

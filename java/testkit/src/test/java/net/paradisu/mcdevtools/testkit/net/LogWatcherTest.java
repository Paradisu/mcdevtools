package net.paradisu.mcdevtools.testkit.net;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LogWatcherTest {
    @TempDir
    Path dir;

    @Test
    void readsOnlyWhatWasAppendedSinceTheMark() throws IOException {
        Path log = dir.resolve("latest.log");
        Files.writeString(log, "before\n");
        LogWatcher watcher = new LogWatcher(log);
        Files.writeString(log, "after\n", java.nio.file.StandardOpenOption.APPEND);
        assertEquals(List.of("after"), watcher.linesSinceMark());
    }

    @Test
    void readsFromTheStartWhenTheLogWasRotated() throws IOException {
        Path log = dir.resolve("latest.log");
        Files.writeString(log, "a long line before the restart\n");
        LogWatcher watcher = new LogWatcher(log);
        Files.writeString(log, "new\n");
        assertEquals(List.of("new"), watcher.linesSinceMark());
    }

    @Test
    void errorsIncludeTheStackTraceAndHonourIgnores() throws IOException {
        Path log = dir.resolve("latest.log");
        LogWatcher watcher = new LogWatcher(log);
        Files.writeString(
                log,
                String.join(
                        "\n",
                        "[INFO]: fine",
                        "[ERROR]: boom",
                        "\tat a.B.c(B.java:1)",
                        "Caused by: x",
                        "[INFO]: after",
                        "[ERROR]: known noise",
                        ""));
        List<String> errors =
                watcher.errors(List.of(Pattern.compile("\\bERROR\\b")), List.of(Pattern.compile("known noise")));
        assertEquals(List.of("[ERROR]: boom", "\tat a.B.c(B.java:1)", "Caused by: x"), errors);
    }

    @Test
    void aMissingLogIsEmpty() {
        assertEquals(List.of(), new LogWatcher(dir.resolve("none.log")).linesSinceMark());
    }
}

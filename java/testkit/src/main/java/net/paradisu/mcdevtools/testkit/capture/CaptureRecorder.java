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

package net.paradisu.mcdevtools.testkit.capture;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Records packets around one test by driving {@code mcdev capture} (start, stop, export, rm), so a failing test comes
 * with a replay that can be opened in Flashback or ReplayMod. Needs {@code [capture] enabled = true} in the project;
 * when capture is not available the test still runs and the reason is kept in {@link #note()}.
 */
public final class CaptureRecorder {
    /** What a finished recording left behind. */
    public record Result(String id, List<String> exports, String note) {}

    private final TestEnvironment env;
    private final List<String> instances;
    private String id;
    private String note = "";

    private CaptureRecorder(TestEnvironment env, List<String> instances) {
        this.env = env;
        this.instances = instances;
    }

    /**
     * Starts recording the given instances.
     *
     * @param env the environment
     * @param label a short label for the capture id
     * @param instances the instances to record (only those with a capture socket are used)
     * @return the recorder; check {@link #active()}
     */
    public static CaptureRecorder start(TestEnvironment env, String label, List<String> instances) {
        List<String> capturable = instances.stream()
                .filter(n -> env.instance(n).captureSocket != null)
                .toList();
        CaptureRecorder recorder = new CaptureRecorder(env, capturable);
        if (capturable.isEmpty()) {
            recorder.note = "capture is not enabled on these instances ([capture] enabled = true)";
            return recorder;
        }
        Output out = recorder.mcdev(
                "capture", "start", "--no-input", "--json", "--label", label, "--on", String.join(",", capturable));
        if (out.status != 0) {
            recorder.note = "capture start failed: " + out.firstLine();
            return recorder;
        }
        recorder.id = json(out.stdout).get("id").getAsString();
        return recorder;
    }

    /**
     * Whether a capture is running.
     *
     * @return true when started
     */
    public boolean active() {
        return id != null;
    }

    /**
     * Why capture is not running, or empty.
     *
     * @return the note
     */
    public String note() {
        return note;
    }

    /**
     * Stops recording and keeps or removes the capture.
     *
     * @param keep whether to keep it
     * @param formats export formats to make from a kept capture
     * @param players players to filter the exports to (the bots); empty for everyone
     * @return what was kept
     */
    public Result finish(boolean keep, List<String> formats, List<String> players) {
        if (id == null) {
            return new Result(null, List.of(), note);
        }
        mcdev("capture", "stop", "--no-input", "--on", String.join(",", instances));
        if (!keep) {
            mcdev("capture", "rm", id, "--yes", "--no-input");
            return new Result(null, List.of(), "");
        }
        List<String> exports = new ArrayList<>();
        StringBuilder notes = new StringBuilder();
        for (String format : formats) {
            List<String> args =
                    new ArrayList<>(List.of("capture", "export", id, "--format", format, "--no-input", "--json"));
            for (String player : players) {
                args.add("--player");
                args.add(player);
            }
            Output out = mcdev(args.toArray(String[]::new));
            if (out.status == 0) {
                json(out.stdout).getAsJsonArray("files").forEach(f -> exports.add(f.getAsString()));
            } else {
                notes.append("export ")
                        .append(format)
                        .append(" failed: ")
                        .append(out.firstLine())
                        .append("; ");
            }
        }
        return new Result(id, exports, notes.toString());
    }

    private record Output(int status, String stdout, String stderr) {
        String firstLine() {
            String text = (stderr.isBlank() ? stdout : stderr).strip();
            int newline = text.indexOf('\n');
            return newline < 0 ? text : text.substring(0, newline);
        }
    }

    private static JsonObject json(String stdout) {
        int start = stdout.indexOf('{');
        return JsonParser.parseString(start < 0 ? stdout : stdout.substring(start))
                .getAsJsonObject();
    }

    private Output mcdev(String... args) {
        List<String> command = new ArrayList<>();
        command.add(env.mcdev);
        command.addAll(List.of(args));
        try {
            Process process = new ProcessBuilder(command)
                    .directory(Path.of(env.project).toFile())
                    .start();
            String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            if (!process.waitFor(120, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new Output(124, stdout, "timed out");
            }
            return new Output(process.exitValue(), stdout, stderr);
        } catch (IOException e) {
            return new Output(127, "", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Output(130, "", "interrupted");
        }
    }
}

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

package net.paradisu.mcdevtools.testkit.junit;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.paradisu.mcdevtools.testkit.bot.Bot;
import net.paradisu.mcdevtools.testkit.bot.EventLog;
import net.paradisu.mcdevtools.testkit.bot.PacketEntry;
import net.paradisu.mcdevtools.testkit.capture.CaptureRecorder;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.ExtensionContext.Namespace;
import org.junit.jupiter.api.extension.ParameterContext;
import org.junit.jupiter.api.extension.ParameterResolutionException;
import org.junit.jupiter.api.extension.ParameterResolver;
import org.junit.platform.commons.support.AnnotationSupport;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The JUnit extension behind {@link McDevTest}: before each test it opens the instances' consoles, marks their logs and
 * (optionally) starts a packet capture; after it, it closes the bots, writes the evidence into the test's artifacts
 * folder, fails the test on logged errors, and keeps or drops the capture.
 */
public final class McDevExtension implements BeforeEachCallback, AfterEachCallback, ParameterResolver {
    private static final Namespace NS = Namespace.create(McDevExtension.class);
    private static final Gson GSON =
            new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    private static final String RUN_ID = runId();

    private static String runId() {
        String fromEnv = System.getenv("MCDEV_TEST_RUN_ID");
        return fromEnv != null && !fromEnv.isBlank()
                ? fromEnv
                : "local-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
    }

    /** Everything the extension keeps for one test. */
    private static final class State {
        TestEnvironment env;
        Network network;
        Bots bots;
        Artifacts artifacts;
        CaptureRecorder recorder;
        Capture.Mode captureMode;
        List<String> formats;
        List<String> scope;
        Instant started;
    }

    private static TestEnvironment environment(ExtensionContext context) {
        return context.getRoot()
                .getStore(NS)
                .computeIfAbsent("env", key -> TestEnvironment.load(), TestEnvironment.class);
    }

    private static State state(ExtensionContext context) {
        return context.getStore(NS).get("state", State.class);
    }

    @Override
    public void beforeEach(ExtensionContext context) throws Exception {
        State s = new State();
        s.started = Instant.now();
        s.env = environment(context);
        if (s.env.running().isEmpty()) {
            throw new IllegalStateException("No instance is running; start the network with `mcdev start` or run the "
                    + "tests with `mcdev test run`");
        }
        s.scope = find(context, OnInstances.class).map(a -> List.of(a.value())).orElse(List.of());
        s.network = new Network(s.env, s.scope);
        s.bots = new Bots(s.env);
        s.artifacts = new Artifacts(artifactsDir(context, s.env));

        Optional<Capture> capture = find(context, Capture.class);
        Optional<ManualReview> review =
                context.getTestMethod().flatMap(m -> AnnotationSupport.findAnnotation(m, ManualReview.class));
        s.captureMode = review.isPresent()
                ? Capture.Mode.ALWAYS
                : capture.map(Capture::mode)
                        .filter(m -> m != Capture.Mode.DEFAULT)
                        .orElseGet(() -> defaultMode(s.env));
        s.formats =
                capture.map(c -> List.of(c.export())).filter(l -> !l.isEmpty()).orElseGet(() -> exportFormats(s.env));
        if (s.captureMode != Capture.Mode.NEVER) {
            s.recorder = CaptureRecorder.start(
                    s.env,
                    label(context),
                    s.network.instances().stream().map(Network.Instance::name).toList());
        }
        context.getStore(NS).put("state", s);
    }

    @Override
    public void afterEach(ExtensionContext context) throws Exception {
        State s = state(context);
        if (s == null) {
            return;
        }
        Optional<Throwable> failure = context.getExecutionException();
        List<String> botNames = s.bots.all().stream().map(Bot::name).toList();
        writeBotEvidence(s);
        s.bots.close();

        List<Pattern> fail = patterns(s.env.test.logFailPatterns);
        List<Pattern> ignore = patterns(s.env.test.logIgnorePatterns);
        findAll(context, AllowLog.class).forEach(a -> ignore.addAll(patterns(List.of(a.value()))));
        Map<String, List<String>> logErrors = new LinkedHashMap<>();
        for (Network.Instance instance : s.network.instances()) {
            // let a late log line land before judging
            sleep(150);
            List<String> errors = instance.logs().errors(fail, ignore);
            if (!errors.isEmpty()) {
                logErrors.put(instance.name(), errors);
            }
            s.artifacts.write("console-" + instance.name() + ".txt", instance.consoleOutput());
            s.artifacts.write("log-" + instance.name() + ".txt", String.join("\n", instance.logLines()));
        }
        s.network.close();

        boolean failed = failure.isPresent() || !logErrors.isEmpty();
        boolean review = context.getTestMethod()
                .flatMap(m -> AnnotationSupport.findAnnotation(m, ManualReview.class))
                .isPresent();
        CaptureRecorder.Result captured = null;
        if (s.recorder != null) {
            boolean keep = s.captureMode == Capture.Mode.ALWAYS || failed;
            captured = s.recorder.finish(keep, s.formats, botNames);
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("status", failed ? "failed" : "passed");
        summary.put("durationMs", Duration.between(s.started, Instant.now()).toMillis());
        failure.ifPresent(t -> summary.put("failure", String.valueOf(t)));
        if (!logErrors.isEmpty()) {
            summary.put("logErrors", logErrors);
        }
        if (captured != null) {
            Map<String, Object> cap = new LinkedHashMap<>();
            cap.put("id", captured.id());
            cap.put("exports", captured.exports());
            cap.put("note", captured.note().isEmpty() ? s.recorder.note() : captured.note());
            summary.put("capture", cap);
        }
        if (review) {
            String note = context.getTestMethod()
                    .flatMap(m -> AnnotationSupport.findAnnotation(m, ManualReview.class))
                    .map(ManualReview::value)
                    .orElse("");
            summary.put("review", Map.of("status", "pending", "note", note));
        }
        s.artifacts.write("artifacts.json", GSON.toJson(summary));

        if (failure.isEmpty() && !logErrors.isEmpty()) {
            StringBuilder message = new StringBuilder("Server logs contain errors (allow them with @AllowLog):");
            logErrors.forEach((name, lines) -> {
                message.append("\n  ").append(name).append(':');
                lines.stream().limit(12).forEach(l -> message.append("\n    ").append(l));
            });
            throw new AssertionError(message.toString());
        }
    }

    private static void writeBotEvidence(State s) {
        for (Bot bot : s.bots.all()) {
            StringBuilder chat = new StringBuilder();
            bot.chat().entriesSince(0).forEach(e -> chat.append('#')
                    .append(e.seq())
                    .append(' ')
                    .append(e.value())
                    .append('\n'));
            s.artifacts.write("bot-" + bot.name() + "-chat.txt", chat.toString());
            StringBuilder packets = new StringBuilder();
            for (EventLog.Entry<PacketEntry> e : bot.packets().last(500)) {
                packets.append('#')
                        .append(e.seq())
                        .append(' ')
                        .append(e.value())
                        .append('\n');
            }
            s.artifacts.write("bot-" + bot.name() + "-packets.txt", packets.toString());
            StringBuilder events = new StringBuilder();
            bot.events().entriesSince(0).forEach(e -> events.append('#')
                    .append(e.seq())
                    .append(' ')
                    .append(e.value())
                    .append('\n'));
            s.artifacts.write("bot-" + bot.name() + "-events.txt", events.toString());
        }
    }

    private static Capture.Mode defaultMode(TestEnvironment env) {
        String override = System.getenv("MCDEV_TEST_CAPTURE");
        String value = override != null && !override.isBlank() ? override : env.test.capture;
        return switch (value) {
            case "always" -> Capture.Mode.ALWAYS;
            case "never" -> Capture.Mode.NEVER;
            default -> Capture.Mode.ON_FAILURE;
        };
    }

    private static List<String> exportFormats(TestEnvironment env) {
        String override = System.getenv("MCDEV_TEST_EXPORT");
        return override != null && !override.isBlank() ? List.of(override.split(",")) : env.test.export;
    }

    private static Path artifactsDir(ExtensionContext context, TestEnvironment env) {
        String test = context.getTestClass().map(Class::getSimpleName).orElse("Test");
        String method = context.getTestMethod().map(m -> m.getName()).orElse("method");
        return Path.of(env.resultsDir, RUN_ID, safe(test), safe(method));
    }

    private static String label(ExtensionContext context) {
        return safe(context.getTestClass().map(Class::getSimpleName).orElse("test") + "-"
                + context.getTestMethod().map(m -> m.getName()).orElse(""));
    }

    private static String safe(String name) {
        return name.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private static <A extends java.lang.annotation.Annotation> Optional<A> find(
            ExtensionContext context, Class<A> type) {
        Optional<A> onMethod = context.getTestMethod().flatMap(m -> AnnotationSupport.findAnnotation(m, type));
        return onMethod.isPresent()
                ? onMethod
                : context.getTestClass().flatMap(c -> AnnotationSupport.findAnnotation(c, type));
    }

    private static <A extends java.lang.annotation.Annotation> List<A> findAll(
            ExtensionContext context, Class<A> type) {
        List<A> out = new ArrayList<>();
        context.getTestClass()
                .flatMap(c -> AnnotationSupport.findAnnotation(c, type))
                .ifPresent(out::add);
        context.getTestMethod()
                .flatMap(m -> AnnotationSupport.findAnnotation(m, type))
                .ifPresent(out::add);
        return out;
    }

    private static List<Pattern> patterns(List<String> regexes) {
        return new ArrayList<>(regexes.stream().map(Pattern::compile).toList());
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public boolean supportsParameter(ParameterContext parameter, ExtensionContext extension)
            throws ParameterResolutionException {
        Class<?> type = parameter.getParameter().getType();
        return type == Network.class || type == Bots.class || type == Artifacts.class || type == TestEnvironment.class;
    }

    @Override
    public Object resolveParameter(ParameterContext parameter, ExtensionContext extension)
            throws ParameterResolutionException {
        State s = state(extension);
        if (s == null) {
            throw new ParameterResolutionException("The network is only available inside a test method");
        }
        Class<?> type = parameter.getParameter().getType();
        if (type == Network.class) {
            return s.network;
        }
        if (type == Bots.class) {
            return s.bots;
        }
        if (type == Artifacts.class) {
            return s.artifacts;
        }
        return s.env;
    }
}

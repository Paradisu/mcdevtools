plugins {
    id("mcdevtools.java-conventions")
    alias(libs.plugins.shadow)
}

dependencies {
    // The capture classes the agent carries: core, control, netty handlers and the bridge
    implementation(project(":capture"))
    implementation(libs.byte.buddy)
    // The control socket speaks JSON; a plain JVM has no Gson, so it travels (relocated) in the jar
    implementation(libs.gson)
    // Provided by the server the agent runs in
    compileOnly(libs.bundles.netty)
}

tasks {
    jar { archiveClassifier.set("plain") }
    shadowJar {
        archiveClassifier.set("")
        archiveFileName.set("mcdevtools-capture-agent.jar")
        relocate("net.bytebuddy", "net.paradisu.mcdevtools.shaded.bytebuddy")
        relocate("com.google.gson", "net.paradisu.mcdevtools.shaded.gson")
        // Only what an agent needs: no Paper, Velocity or Limbo entry points or descriptors
        exclude("net/paradisu/mcdevtools/capture/paper/**", "net/paradisu/mcdevtools/capture/velocity/**", "net/paradisu/mcdevtools/capture/limbo/**")
        exclude("plugin.yml", "velocity-plugin.json", "limbo.yml", "META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA")
        manifest {
            attributes(
                "Premain-Class" to "net.paradisu.mcdevtools.capture.agent.CaptureAgent",
                "Can-Redefine-Classes" to "false",
                "Can-Retransform-Classes" to "false",
            )
        }
    }
    build { dependsOn(shadowJar) }
}

description = "capture-agent"

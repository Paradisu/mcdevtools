plugins {
    id("mcdevtools.java-conventions")
    application
}

dependencies {
    // Bots speak the Minecraft protocol through MCProtocolLib (latest protocol only)
    api(libs.mcprotocollib)
    // Tests are JUnit 5+ tests; the extension and assertions are part of this library
    api(platform(libs.junit.bom))
    api(libs.junit.jupiter.api)
    implementation(libs.gson)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter.api)
    testRuntimeOnly(libs.junit.jupiter.engine)
    testRuntimeOnly(libs.junit.platform.launcher)
}

application {
    mainClass.set("net.paradisu.mcdevtools.testkit.cli.TestkitMain")
}

description = "testkit"

tasks {
    test { useJUnitPlatform() }
    // `mcdev` only uses installDist
    distZip { enabled = false }
    distTar { enabled = false }
}

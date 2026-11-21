plugins {
    id("mcdevtools.java-conventions")
}

dependencies {
    compileOnly(libs.bundles.netty)
    compileOnly(libs.gson)
    // Limbo's pom pulls jitpack-only dependencies we never touch; the Limbo jar alone is enough to compile against
    compileOnly(libs.limbo) { isTransitive = false }
}

tasks.jar {
    archiveFileName.set("mcdevtools-capture.jar")
}

description = "capture"

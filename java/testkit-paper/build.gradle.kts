plugins {
    id("mcdevtools.java-conventions")
}

dependencies {
    // Paper provides Gson and Adventure at runtime
    compileOnly(libs.paper.api)
    compileOnly(libs.gson)
}

tasks.jar {
    archiveFileName.set("mcdevtools-testkit-paper.jar")
}

description = "testkit-paper"

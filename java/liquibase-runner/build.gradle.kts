plugins {
    id("mcdevtools.java-conventions")
    application
}

dependencies {
    implementation(libs.bundles.liquibase)
    runtimeOnly(libs.slf4j.simple)
}

application {
    mainClass.set("net.paradisu.mcdevtools.migrate.LiquibaseRunner")
}

description = "liquibase-runner"

// `mcdev` only uses installDist
tasks {
    distZip { enabled = false }
    distTar { enabled = false }
}

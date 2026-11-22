import org.gradle.accessors.dm.LibrariesForLibs

plugins {
    `java-library`
    `maven-publish`
    id("com.diffplug.spotless")
}

// https://github.com/gradle/gradle/issues/15383
val libs = the<LibrariesForLibs>()

repositories {
    // mavenLocal()
    // Every repository except Central is limited to the groups it serves, so Gradle never probes it for anything else.
    // A new dependency from one of these repositories may need its group added here.
    mavenCentral()
    // Limbo (the capture plugin compiles against it)
    maven("https://repo.loohpjames.com/repository") {
        content { includeGroup("com.loohp") }
    }
    // MCProtocolLib (the testkit) and the few dependencies of it that are not on Central
    maven("https://repo.opencollab.dev/main") {
        content {
            includeGroup("org.geysermc.mcprotocollib")
            includeGroup("org.cloudburstmc.math")
            includeGroup("com.nukkitx.fastutil")
        }
    }
    // Paper API (the testkit's Paper runner plugin compiles against it)
    maven("https://repo.papermc.io/repository/maven-public/") {
        content {
            includeGroup("io.papermc.paper")
            includeGroup("io.papermc")
            includeGroup("com.mojang")
            includeGroup("net.md-5")
        }
    }
}

// Use providers.gradleProperty(...) instead of properties[...]
group = providers.gradleProperty("group").get()
version = providers.gradleProperty("version").get()

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

spotless {
    java {
        palantirJavaFormat("2.83.0").formatJavadoc(true)
        importOrder("", "javax|java", "\\#")
        removeUnusedImports()
    }

    format("license") {
        // rootProject is the root of this build, also when it is included by another one
        licenseHeaderFile(rootProject.file("build-logic/src/main/resources/licenseHeaderFile"), "package ")
        target("src/main/java/**/*.java")
    }
}

publishing {
    publications.create<MavenPublication>("maven") {
        from(components["java"])
    }
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

tasks.withType<Javadoc> {
    options.encoding = "UTF-8"
}

// Resolved eagerly so the processResources action only captures plain strings (configuration cache)
val expandProperties: Map<String, String> = mapOf(
    "id" to providers.gradleProperty("id").get(),
    "name" to providers.gradleProperty("pluginName").get(),
    "version" to providers.gradleProperty("version").get(),
    "description" to providers.gradleProperty("description").get(),
    "url" to providers.gradleProperty("url").get(),
    "authors" to providers.gradleProperty("authors").get()
)

tasks {
    processResources {
        val properties = expandProperties
        filesMatching(listOf("limbo.yml", "*.properties")) {
            expand(properties)
        }
    }
}

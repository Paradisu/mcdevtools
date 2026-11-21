dependencyResolutionManagement {
    repositories {
        gradlePluginPortal()
    }
    versionCatalogs {
        register("libs") {
            from(files("../gradle/libs.versions.toml"))
        }
    }
}

// Not "build-logic": a project that includes this build (includeBuild) has a build-logic of its own
rootProject.name = "mcdevtools-build-logic"

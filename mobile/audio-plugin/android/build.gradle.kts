plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}
val robolectricHome = layout.buildDirectory.dir("robolectric-home").get().asFile

android {
    namespace = "com.bztune.audio"
    compileSdk = 37
    defaultConfig { minSdk = 24 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }
    testOptions.unitTests.all { test ->
        test.systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2")
        test.systemProperty("user.home", robolectricHome.absolutePath)
        val home = robolectricHome
        test.doFirst { home.mkdirs() }
    }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("org.json:json:20250517")
    implementation(project(":tauri-android"))
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-session:1.11.1")
}

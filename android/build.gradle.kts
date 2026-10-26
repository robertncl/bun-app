// AGP 9 compiles Kotlin itself, so the app module no longer applies
// kotlin-android; declaring it here only pins the Kotlin Gradle plugin version.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.compose.compiler) apply false
}

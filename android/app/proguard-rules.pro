# Keep kotlinx.serialization metadata
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.weathermap.app.**$$serializer { *; }
-keepclassmembers class com.weathermap.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.weathermap.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

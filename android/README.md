# WeatherMap Android

Native Kotlin / Jetpack Compose client for the Bun weather API. Renders the
same 15 stations on an OpenStreetMap (CARTO dark) tile map via osmdroid, with
a bottom panel for the station list and detail view.

## Stack
- Kotlin 2.0 + Jetpack Compose (Material 3)
- osmdroid for the map (free, no API key)
- Ktor client + kotlinx.serialization for HTTP/JSON
- ViewModel + StateFlow for state, 30s auto-refresh

## Running

1. **Start the Bun server** from the repo root:
   ```sh
   bun run dev
   ```
   It listens on `http://localhost:3000`.

2. **Open `android/` in Android Studio** (Hedgehog or newer). Let it sync
   Gradle — this fetches the wrapper JAR, AGP, and dependencies.

3. **Run on the emulator** (`Shift+F10`). The app is hardcoded to
   `http://10.0.2.2:3000`, which is the emulator's alias for the host
   machine's `localhost`.

## Running on a real device

`10.0.2.2` only works in the Android emulator. For a physical device on the
same Wi-Fi as your dev machine:

1. Find your machine's LAN IP (`ip addr` on Linux, `ipconfig` on Windows).
2. Edit `BASE_URL` in
   [app/src/main/java/com/weathermap/app/data/Weather.kt](app/src/main/java/com/weathermap/app/data/Weather.kt)
   to e.g. `http://192.168.1.42:3000`.
3. Add that host to
   [app/src/main/res/xml/network_security_config.xml](app/src/main/res/xml/network_security_config.xml)
   so cleartext HTTP is allowed.
4. Make sure the Bun server binds to all interfaces (it does by default).

## Building from the command line

If you have a JDK 17 and the Gradle wrapper JAR (Android Studio generates it
automatically on first sync), you can build without the IDE:

```sh
cd android
./gradlew assembleDebug
# APK ends up in app/build/outputs/apk/debug/
```

## Project layout
```
android/
├── app/src/main/
│   ├── AndroidManifest.xml
│   ├── res/                            # icons, colors, themes, network config
│   └── java/com/weathermap/app/
│       ├── MainActivity.kt
│       ├── WeatherViewModel.kt         # state + 30s polling
│       ├── data/Weather.kt             # model + Ktor client
│       └── ui/
│           ├── WeatherScreen.kt        # scaffold + top bar
│           ├── WeatherMap.kt           # osmdroid Compose wrapper
│           ├── StationPanels.kt        # list + detail
│           ├── WeatherStyles.kt        # temp→color, condition icon, wind dir
│           └── theme/Theme.kt
└── gradle/libs.versions.toml           # version catalog
```

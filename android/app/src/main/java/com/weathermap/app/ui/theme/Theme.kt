package com.weathermap.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val AppBg = Color(0xFF0D1117)
val AppSurface = Color(0xFF161B22)
val AppSurfaceHi = Color(0xFF21262D)
val AppBorder = Color(0x14FFFFFF)
val TextPri = Color(0xFFE6EDF3)
val TextSec = Color(0xFF8B949E)
val Accent = Color(0xFF58A6FF)
val Online = Color(0xFF3FB950)
val Offline = Color(0xFFE63946)

private val DarkColors = darkColorScheme(
    primary = Accent,
    onPrimary = AppBg,
    background = AppBg,
    onBackground = TextPri,
    surface = AppSurface,
    onSurface = TextPri,
    surfaceVariant = AppSurfaceHi,
    onSurfaceVariant = TextSec,
)

@Composable
fun WeatherMapTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColors, content = content)
}

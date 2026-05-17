package com.weathermap.app.ui

import androidx.compose.ui.graphics.Color

fun tempColor(temp: Double): Color = when {
    temp < 0  -> Color(0xFF7ECFF5)
    temp < 10 -> Color(0xFF5EB8E0)
    temp < 18 -> Color(0xFF4CAF7D)
    temp < 25 -> Color(0xFFF4C430)
    temp < 32 -> Color(0xFFF47C30)
    else      -> Color(0xFFE63946)
}

fun conditionIcon(condition: String): String = when (condition) {
    "Sunny" -> "☀️"
    "Partly Cloudy" -> "⛅"
    "Cloudy" -> "☁️"
    "Rainy" -> "🌧️"
    "Thunderstorm" -> "⛈️"
    "Snowy" -> "❄️"
    "Foggy" -> "🌫️"
    "Windy" -> "💨"
    else -> "🌡"
}

private val DIRECTIONS = arrayOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")

fun windDir(deg: Int): String {
    val idx = ((deg + 22) / 45) % 8
    val safe = if (idx < 0) idx + 8 else idx
    return DIRECTIONS[safe]
}

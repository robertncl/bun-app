package com.weathermap.app.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class WeatherStation(
    val id: String,
    val name: String,
    val country: String,
    val lat: Double,
    val lon: Double,
    val temperature: Double,
    val feelsLike: Double,
    val humidity: Int,
    val windSpeed: Int,
    val windDirection: Int,
    val pressure: Int,
    val visibility: Int,
    val condition: String,
    val updatedAt: Long,
)

object WeatherApi {
    // 10.0.2.2 is the Android emulator's loopback alias for the host machine.
    // On a real device, change this to your machine's LAN IP (e.g. http://192.168.1.42:3000).
    const val BASE_URL = "http://10.0.2.2:3000"

    private val client = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 8_000
            connectTimeoutMillis = 5_000
        }
    }

    suspend fun fetchAll(): List<WeatherStation> =
        client.get("$BASE_URL/api/weather").body()
}

package com.weathermap.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.weathermap.app.ui.WeatherScreen
import com.weathermap.app.ui.theme.WeatherMapTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WeatherMapTheme {
                WeatherScreen()
            }
        }
    }
}

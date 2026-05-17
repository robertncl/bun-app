package com.weathermap.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.weathermap.app.WeatherViewModel
import com.weathermap.app.ui.theme.Accent
import com.weathermap.app.ui.theme.AppBg
import com.weathermap.app.ui.theme.AppBorder
import com.weathermap.app.ui.theme.AppSurface
import com.weathermap.app.ui.theme.Offline
import com.weathermap.app.ui.theme.Online
import com.weathermap.app.ui.theme.TextSec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun WeatherScreen(viewModel: WeatherViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            WeatherTopBar(
                lastUpdated = state.lastUpdated,
                error = state.error,
                loading = state.loading,
            )
        },
        containerColor = AppBg,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                WeatherMap(
                    stations = state.stations,
                    selectedId = state.selectedId,
                    onStationClick = viewModel::selectCity,
                )
            }
            HorizontalDivider(color = AppBorder, thickness = 1.dp)
            Box(
                modifier = Modifier
                    .height(320.dp)
                    .fillMaxWidth()
                    .background(AppSurface)
            ) {
                val selected = state.selected
                if (selected != null) {
                    StationDetail(
                        station = selected,
                        onBack = { viewModel.selectCity(null) },
                    )
                } else {
                    StationList(
                        stations = state.stations,
                        onClick = viewModel::selectCity,
                    )
                }
            }
        }
    }
}

@Composable
private fun WeatherTopBar(lastUpdated: Long?, error: String?, loading: Boolean) {
    Surface(color = AppSurface) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(52.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("🌤", fontSize = 20.sp)
            Spacer(Modifier.width(8.dp))
            Text(
                text = "WeatherMap Live",
                color = Accent,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(if (error != null) Offline else Online)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = when {
                    error != null -> "Offline"
                    loading && lastUpdated == null -> "Connecting…"
                    lastUpdated != null -> "Updated ${formatTime(lastUpdated)}"
                    else -> "—"
                },
                color = TextSec,
                fontSize = 12.sp,
            )
        }
    }
}

private val TIME_FMT = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

private fun formatTime(ts: Long): String = TIME_FMT.format(Date(ts))

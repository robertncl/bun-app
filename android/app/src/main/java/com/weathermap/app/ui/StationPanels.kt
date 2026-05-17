package com.weathermap.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.weathermap.app.data.WeatherStation
import com.weathermap.app.ui.theme.Accent
import com.weathermap.app.ui.theme.AppBg
import com.weathermap.app.ui.theme.AppBorder
import com.weathermap.app.ui.theme.TextPri
import com.weathermap.app.ui.theme.TextSec

@Composable
fun StationList(stations: List<WeatherStation>, onClick: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "ALL STATIONS",
            color = TextSec,
            fontSize = 11.sp,
            letterSpacing = 1.5.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 8.dp),
        )
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        ) {
            items(items = stations.sortedBy { it.name }, key = { it.id }) { station ->
                StationCard(station = station, onClick = { onClick(station.id) })
            }
        }
    }
}

@Composable
private fun StationCard(station: WeatherStation, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(AppBg)
            .border(1.dp, AppBorder, RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = station.name,
                color = TextPri,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = "${conditionIcon(station.condition)} ${station.condition}",
                color = TextSec,
                fontSize = 12.sp,
            )
        }
        Text(
            text = "${station.temperature}°C",
            color = tempColor(station.temperature),
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun StationDetail(station: WeatherStation, onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "← All stations",
            color = Accent,
            fontSize = 13.sp,
            modifier = Modifier
                .clickable { onBack() }
                .padding(vertical = 4.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = station.name,
            color = TextPri,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(text = station.country, color = TextSec, fontSize = 13.sp)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = "${station.temperature}",
                color = tempColor(station.temperature),
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = "°C",
                color = TextSec,
                fontSize = 22.sp,
                fontWeight = FontWeight.Light,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        Text(
            text = "${conditionIcon(station.condition)} ${station.condition}",
            color = TextSec,
            fontSize = 14.sp,
        )
        Text(
            text = "Feels like ${station.feelsLike}°C",
            color = TextSec,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("HUMIDITY", "${station.humidity}%", Modifier.weight(1f))
            MetricCard(
                "WIND",
                "${station.windSpeed} km/h ${windDir(station.windDirection)}",
                Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("PRESSURE", "${station.pressure} hPa", Modifier.weight(1f))
            MetricCard("VISIBILITY", "${station.visibility} km", Modifier.weight(1f))
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(AppBg)
            .border(1.dp, AppBorder, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(
            text = label,
            color = TextSec,
            fontSize = 10.sp,
            letterSpacing = 0.6.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = value,
            color = TextPri,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

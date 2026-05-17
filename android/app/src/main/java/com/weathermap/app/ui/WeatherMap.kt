package com.weathermap.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.weathermap.app.data.WeatherStation
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

@Composable
fun WeatherMap(
    stations: List<WeatherStation>,
    selectedId: String?,
    onStationClick: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val mapView = remember {
        Configuration.getInstance().load(
            context,
            context.getSharedPreferences("osmdroid", Context.MODE_PRIVATE)
        )
        Configuration.getInstance().userAgentValue = context.packageName

        MapView(context).apply {
            setTileSource(
                XYTileSource(
                    "CartoDark",
                    0, 19, 256, ".png",
                    arrayOf(
                        "https://a.basemaps.cartocdn.com/dark_all/",
                        "https://b.basemaps.cartocdn.com/dark_all/",
                        "https://c.basemaps.cartocdn.com/dark_all/",
                        "https://d.basemaps.cartocdn.com/dark_all/",
                    ),
                    "© OpenStreetMap contributors, © CARTO"
                )
            )
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            controller.setZoom(2.5)
            controller.setCenter(GeoPoint(20.0, 10.0))
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    AndroidView(
        modifier = Modifier,
        factory = { mapView },
        update = { mv ->
            mv.overlays.removeAll { it is Marker }
            stations.forEach { station ->
                val bmp = createMarkerBitmap(station, context)
                val marker = Marker(mv).apply {
                    position = GeoPoint(station.lat, station.lon)
                    title = "${station.name}, ${station.country}"
                    snippet = "${station.temperature}°C · ${station.condition}"
                    icon = BitmapDrawable(context.resources, bmp)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    setOnMarkerClickListener { _, _ ->
                        onStationClick(station.id)
                        true
                    }
                }
                mv.overlays.add(marker)
            }
            if (selectedId != null) {
                val sel = stations.firstOrNull { it.id == selectedId }
                if (sel != null) {
                    mv.controller.animateTo(
                        GeoPoint(sel.lat, sel.lon),
                        maxOf(mv.zoomLevelDouble, 5.0),
                        800L,
                    )
                }
            }
            mv.invalidate()
        },
    )
}

private fun createMarkerBitmap(station: WeatherStation, context: Context): Bitmap {
    val density = context.resources.displayMetrics.density
    val size = (52 * density).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val color = tempColor(station.temperature).toArgb()

    val cx = size / 2f
    val cy = size / 2f
    val r = cx - 4 * density

    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        alpha = 210
    }
    canvas.drawCircle(cx, cy, r, bgPaint)

    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeWidth = 2 * density
    }
    canvas.drawCircle(cx, cy, r, borderPaint)

    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = AndroidColor.WHITE
        textAlign = Paint.Align.CENTER
        textSize = 13 * density
        isFakeBoldText = true
        setShadowLayer(2f, 0f, 1f, AndroidColor.argb(180, 0, 0, 0))
    }
    val txt = "${station.temperature.toInt()}°"
    val fm = textPaint.fontMetrics
    val textY = cy - (fm.ascent + fm.descent) / 2
    canvas.drawText(txt, cx, textY, textPaint)

    return bitmap
}

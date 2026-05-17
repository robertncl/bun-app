package com.weathermap.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.weathermap.app.data.WeatherApi
import com.weathermap.app.data.WeatherStation
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WeatherUiState(
    val stations: List<WeatherStation> = emptyList(),
    val selectedId: String? = null,
    val lastUpdated: Long? = null,
    val error: String? = null,
    val loading: Boolean = true,
) {
    val selected: WeatherStation?
        get() = stations.firstOrNull { it.id == selectedId }
}

class WeatherViewModel : ViewModel() {
    private val _state = MutableStateFlow(WeatherUiState())
    val state: StateFlow<WeatherUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            while (true) {
                refresh()
                delay(REFRESH_INTERVAL_MS)
            }
        }
    }

    fun selectCity(id: String?) {
        _state.update { it.copy(selectedId = id) }
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    private suspend fun refresh() {
        try {
            val data = WeatherApi.fetchAll()
            _state.update {
                it.copy(
                    stations = data,
                    lastUpdated = System.currentTimeMillis(),
                    error = null,
                    loading = false,
                )
            }
        } catch (e: Exception) {
            _state.update {
                it.copy(error = e.message ?: "Network error", loading = false)
            }
        }
    }

    companion object {
        private const val REFRESH_INTERVAL_MS = 30_000L
    }
}

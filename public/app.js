const CONDITION_ICONS = {
  "Sunny":        "☀️",
  "Partly Cloudy":"⛅",
  "Cloudy":       "☁️",
  "Rainy":        "🌧️",
  "Thunderstorm": "⛈️",
  "Snowy":        "❄️",
  "Foggy":        "🌫️",
  "Windy":        "💨",
};

const DIRECTIONS = ["N","NE","E","SE","S","SW","W","NW"];

let map, weatherData = {}, markers = {}, selectedId = null;

function tempColor(t) {
  if (t < 0)  return "#7ecff5";
  if (t < 10) return "#5eb8e0";
  if (t < 18) return "#4caf7d";
  if (t < 25) return "#f4c430";
  if (t < 32) return "#f47c30";
  return "#e63946";
}

function windDir(deg) {
  return DIRECTIONS[Math.round(deg / 45) % 8];
}

function condIcon(c) {
  return CONDITION_ICONS[c] || "🌡️";
}

function initMap() {
  map = L.map("map", {
    center: [20, 10],
    zoom: 2,
    minZoom: 2,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
}

function createMarkerIcon(city) {
  const color = tempColor(city.temperature);
  const icon = condIcon(city.condition);
  return L.divIcon({
    className: "",
    html: `<div class="weather-marker" style="background:${color}88;border-color:${color}">
             <span class="m-icon">${icon}</span>
             <span class="m-temp">${city.temperature}°</span>
           </div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -28],
  });
}

function buildPopupHTML(city) {
  return `<strong>${city.name}, ${city.country}</strong>
          <div class="popup-meta">${condIcon(city.condition)} ${city.condition} · ${city.temperature}°C</div>
          <div class="popup-meta">💧 ${city.humidity}% · 💨 ${city.windSpeed} km/h ${windDir(city.windDirection)}</div>`;
}

function updateMarker(city) {
  if (markers[city.id]) {
    markers[city.id].setIcon(createMarkerIcon(city));
    markers[city.id].getPopup()?.setContent(buildPopupHTML(city));
  } else {
    const m = L.marker([city.lat, city.lon], { icon: createMarkerIcon(city) })
      .bindPopup(buildPopupHTML(city))
      .addTo(map);
    m.on("click", () => selectCity(city.id));
    markers[city.id] = m;
  }
}

function selectCity(id) {
  selectedId = id;
  renderDetailPanel(weatherData[id]);
  renderCitiesList();
  map.flyTo([weatherData[id].lat, weatherData[id].lon], Math.max(map.getZoom(), 5), {
    duration: 0.8,
  });
}

function renderDetailPanel(city) {
  const panel = document.getElementById("detail-panel");
  const color = tempColor(city.temperature);
  panel.innerHTML = `
    <div class="detail-back" id="back-btn">← All stations</div>
    <div class="detail-header">
      <div class="detail-city">${city.name}</div>
      <div class="detail-country">${city.country}</div>
    </div>
    <div class="detail-main">
      <span class="detail-temp" style="color:${color}">${city.temperature}</span>
      <span class="detail-temp-unit">°C</span>
    </div>
    <div class="detail-condition">${condIcon(city.condition)} ${city.condition}</div>
    <div class="detail-feels">Feels like ${city.feelsLike}°C</div>
    <div class="detail-metrics">
      <div class="metric">
        <div class="metric-label">Humidity</div>
        <div class="metric-value">${city.humidity}%</div>
      </div>
      <div class="metric">
        <div class="metric-label">Wind</div>
        <div class="metric-value">${city.windSpeed} km/h ${windDir(city.windDirection)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Pressure</div>
        <div class="metric-value">${city.pressure} hPa</div>
      </div>
      <div class="metric">
        <div class="metric-label">Visibility</div>
        <div class="metric-value">${city.visibility} km</div>
      </div>
    </div>
  `;
  panel.classList.remove("hidden");
  document.getElementById("back-btn").addEventListener("click", deselectCity);
}

function deselectCity() {
  selectedId = null;
  document.getElementById("detail-panel").classList.add("hidden");
  renderCitiesList();
}

function renderCitiesList() {
  const list = document.getElementById("cities-list");
  const sorted = Object.values(weatherData).sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = sorted.map(city => {
    const color = tempColor(city.temperature);
    const selected = city.id === selectedId ? " selected" : "";
    return `<div class="city-card${selected}" data-id="${city.id}">
      <div class="card-left">
        <div class="card-name">${city.name}</div>
        <div class="card-condition">${condIcon(city.condition)} ${city.condition}</div>
      </div>
      <div class="card-right">
        <div class="card-temp" style="color:${color}">${city.temperature}°C</div>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".city-card").forEach(card => {
    card.addEventListener("click", () => selectCity(card.dataset.id));
  });
}

function flashPulse() {
  const dot = document.getElementById("pulse-dot");
  dot.classList.remove("active");
  void dot.offsetWidth;
  dot.classList.add("active");
}

function updateLastUpdated() {
  const el = document.getElementById("last-updated");
  el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function fetchWeather() {
  try {
    const data = await fetch("/api/weather").then(r => r.json());
    data.forEach(city => {
      weatherData[city.id] = city;
      updateMarker(city);
    });
    renderCitiesList();
    if (selectedId && weatherData[selectedId]) {
      renderDetailPanel(weatherData[selectedId]);
    }
    updateLastUpdated();
    flashPulse();
  } catch (err) {
    console.error("Weather fetch failed:", err);
  }
}

async function init() {
  initMap();
  await fetchWeather();
  setInterval(fetchWeather, 30000);
}

document.addEventListener("DOMContentLoaded", init);

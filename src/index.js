import { serve } from "bun";
import path from "node:path";

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
};

const CONDITIONS = ["Sunny", "Partly Cloudy", "Cloudy", "Rainy", "Thunderstorm", "Snowy", "Foggy", "Windy"];

const CITIES = {
  "new-york":    { name: "New York",    country: "US", lat: 40.7128,  lon: -74.0060,  baseTemp: 16 },
  "london":      { name: "London",      country: "GB", lat: 51.5074,  lon: -0.1278,   baseTemp: 13 },
  "tokyo":       { name: "Tokyo",       country: "JP", lat: 35.6762,  lon: 139.6503,  baseTemp: 18 },
  "paris":       { name: "Paris",       country: "FR", lat: 48.8566,  lon: 2.3522,    baseTemp: 14 },
  "sydney":      { name: "Sydney",      country: "AU", lat: -33.8688, lon: 151.2093,  baseTemp: 16 },
  "dubai":       { name: "Dubai",       country: "AE", lat: 25.2048,  lon: 55.2708,   baseTemp: 38 },
  "moscow":      { name: "Moscow",      country: "RU", lat: 55.7558,  lon: 37.6173,   baseTemp: 10 },
  "beijing":     { name: "Beijing",     country: "CN", lat: 39.9042,  lon: 116.4074,  baseTemp: 20 },
  "mumbai":      { name: "Mumbai",      country: "IN", lat: 19.0760,  lon: 72.8777,   baseTemp: 32 },
  "sao-paulo":   { name: "São Paulo",   country: "BR", lat: -23.5505, lon: -46.6333,  baseTemp: 22 },
  "cairo":       { name: "Cairo",       country: "EG", lat: 30.0444,  lon: 31.2357,   baseTemp: 28 },
  "toronto":     { name: "Toronto",     country: "CA", lat: 43.6532,  lon: -79.3832,  baseTemp: 12 },
  "singapore":   { name: "Singapore",   country: "SG", lat: 1.3521,   lon: 103.8198,  baseTemp: 30 },
  "berlin":      { name: "Berlin",      country: "DE", lat: 52.5200,  lon: 13.4050,   baseTemp: 13 },
  "los-angeles": { name: "Los Angeles", country: "US", lat: 34.0522,  lon: -118.2437, baseTemp: 22 },
};

const weatherData = {};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function deriveCondition(temp, humidity) {
  if (temp < 0 && humidity > 60) return "Snowy";
  if (humidity > 85) return Math.random() > 0.5 ? "Thunderstorm" : "Rainy";
  if (humidity > 70) return "Rainy";
  if (humidity > 55) return "Cloudy";
  if (humidity > 40) return "Partly Cloudy";
  return "Sunny";
}

function initWeather() {
  for (const [id, city] of Object.entries(CITIES)) {
    const temp = city.baseTemp + rand(-5, 5);
    const humidity = rand(30, 90);
    weatherData[id] = {
      ...city,
      id,
      temperature: Math.round(temp * 10) / 10,
      feelsLike: Math.round((temp - rand(0, 3)) * 10) / 10,
      humidity: Math.round(humidity),
      windSpeed: Math.round(rand(5, 40)),
      windDirection: Math.round(rand(0, 360)),
      pressure: Math.round(rand(990, 1025)),
      visibility: Math.round(rand(5, 20)),
      condition: deriveCondition(temp, humidity),
      updatedAt: Date.now(),
    };
  }
}

function updateWeather() {
  for (const d of Object.values(weatherData)) {
    d.temperature = Math.round((d.temperature + rand(-0.5, 0.5)) * 10) / 10;
    d.feelsLike = Math.round((d.temperature - rand(0, 3)) * 10) / 10;
    d.humidity = Math.min(100, Math.max(10, d.humidity + Math.round(rand(-3, 3))));
    d.windSpeed = Math.max(0, d.windSpeed + Math.round(rand(-3, 3)));
    d.windDirection = (d.windDirection + Math.round(rand(-10, 10)) + 360) % 360;
    d.pressure = Math.round(d.pressure + rand(-1, 1));
    d.visibility = Math.min(20, Math.max(1, d.visibility + Math.round(rand(-1, 1))));
    d.condition = deriveCondition(d.temperature, d.humidity);
    d.updatedAt = Date.now();
  }
}

initWeather();
setInterval(updateWeather, 10000);

export function startServer(port = 3000) {
  const server = serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname.startsWith("/api")) {
        const headers = { "Content-Type": "application/json" };

        if (url.pathname === "/api/weather") {
          return new Response(JSON.stringify(Object.values(weatherData)), { headers });
        }

        if (url.pathname.startsWith("/api/weather/")) {
          const id = url.pathname.split("/").pop();
          if (weatherData[id]) {
            return new Response(JSON.stringify(weatherData[id]), { headers });
          }
          return new Response(JSON.stringify({ error: "City not found" }), { status: 404, headers });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers });
      }

      let filePath = path.join("public", url.pathname === "/" ? "index.html" : url.pathname);

      if (!filePath.startsWith("public")) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = Bun.file(filePath);
      if (await file.exists()) {
        const ext = path.extname(filePath);
        return new Response(file, {
          headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
  return server;
}

if (import.meta.main) {
  const server = startServer(3000);
  console.log(`Weather Map running at http://localhost:${server.port}`);
}

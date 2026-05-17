import { startServer } from '../src/index.js';
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

let server;
let port;

beforeAll(() => {
  port = 3000 + Math.floor(Math.random() * 1000);
  server = startServer(port);
});

afterAll(() => {
  if (server?.stop) server.stop();
});

describe('Weather API', () => {
  async function api(path) {
    return fetch(`http://localhost:${port}${path}`);
  }

  test('GET / returns HTML', async () => {
    const res = await api('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('WeatherMap Live');
  });

  test('GET /api/weather returns array of cities', async () => {
    const res = await api('/api/weather');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('each city has required weather fields', async () => {
    const res = await api('/api/weather');
    const data = await res.json();
    const city = data[0];
    expect(typeof city.id).toBe('string');
    expect(typeof city.name).toBe('string');
    expect(typeof city.lat).toBe('number');
    expect(typeof city.lon).toBe('number');
    expect(typeof city.temperature).toBe('number');
    expect(typeof city.humidity).toBe('number');
    expect(typeof city.windSpeed).toBe('number');
    expect(typeof city.condition).toBe('string');
  });

  test('GET /api/weather/:id returns single city', async () => {
    const res = await api('/api/weather/london');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('london');
    expect(data.name).toBe('London');
    expect(typeof data.temperature).toBe('number');
  });

  test('GET /api/weather/unknown returns 404', async () => {
    const res = await api('/api/weather/atlantis');
    expect(res.status).toBe(404);
  });

  test('unknown API route returns 404', async () => {
    const res = await api('/api/unknown');
    expect(res.status).toBe(404);
  });

  test('directory traversal is blocked', async () => {
    const res = await api('/../package.json');
    expect([403, 404]).toContain(res.status);
  });
});

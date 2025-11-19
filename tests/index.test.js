import { startServer } from '../src/index.js';
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

let server;
let port;

beforeAll(() => {
  // Use dynamic port allocation to avoid conflicts
  port = 3000 + Math.floor(Math.random() * 1000);
  server = startServer(port);
});

afterAll(() => {
  if (server && server.stop) server.stop();
});

describe('Stock API', () => {
  async function callApi(path) {
    const req = new Request(`http://localhost:${port}${path}`);
    return await fetch(req);
  }

  test('GET / returns HTML index', async () => {
    const res = await callApi('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('StockTracker Pro');
  });

  test('GET /api/search returns results', async () => {
    const res = await callApi('/api/search?q=AAPL');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].symbol).toBe('AAPL');
  });

  test('GET /api/quote/:symbol returns stock data', async () => {
    const res = await callApi('/api/quote/GOOGL');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.symbol).toBe('GOOGL');
    expect(data.price).toBeGreaterThan(0);
  });

  test('GET /api/history/:symbol returns history array', async () => {
    const res = await callApi('/api/history/TSLA');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('GET /api/quote/INVALID returns 404', async () => {
    const res = await callApi('/api/quote/INVALID');
    expect(res.status).toBe(404);
  });
});
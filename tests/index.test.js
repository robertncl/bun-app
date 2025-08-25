import { startServer } from '../src/index.js';
import { calculator } from '../src/calculator.js';
const { fetch } = require('bun');

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

describe('Calculator API', () => {
  async function callApi(path, method = 'GET') {
    const req = new Request(`http://localhost:${port}${path}`, { method });
    return await fetch(req);
  }

  test('/add returns sum', async () => {
    const res = await callApi('/add?a=2&b=3');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ result: 5 });
  });

  test('/subtract returns difference', async () => {
    const res = await callApi('/subtract?a=5&b=2');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ result: 3 });
  });

  test('/multiply returns product', async () => {
    const res = await callApi('/multiply?a=4&b=6');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ result: 24 });
  });

  test('/divide returns quotient', async () => {
    const res = await callApi('/divide?a=8&b=2');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ result: 4 });
  });

  test('/divide by zero returns error with 400 status', async () => {
    const res = await callApi('/divide?a=8&b=0');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'Division by zero' });
  });

  test('invalid numbers return error with 400 status', async () => {
    const res = await callApi('/add?a=foo&b=bar');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'Invalid numbers' });
  });

  test('POST method returns 405', async () => {
    const res = await callApi('/add?a=2&b=3', 'POST');
    expect(res.status).toBe(405);
    const data = await res.json();
    expect(data).toEqual({ error: 'Method not allowed' });
  });

  test('PUT method returns 405', async () => {
    const res = await callApi('/add?a=2&b=3', 'PUT');
    expect(res.status).toBe(405);
    const data = await res.json();
    expect(data).toEqual({ error: 'Method not allowed' });
  });

  test('invalid endpoint returns 404', async () => {
    const res = await callApi('/invalid');
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty('error', 'Not found');
    expect(data).toHaveProperty('message');
  });

  test('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await callApi('/add', 'OPTIONS');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  test('missing parameters return error', async () => {
    const res = await callApi('/add');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'Invalid numbers' });
  });

  test('handles negative numbers', async () => {
    const res = await callApi('/add?a=-5&b=3');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ result: -2 });
  });

  test('handles decimal numbers', async () => {
    const res = await callApi('/multiply?a=2.5&b=3');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ result: 7.5 });
  });
});

describe('calculator function', () => {
  test('add', () => {
    expect(calculator('add', 2, 3)).toEqual({ result: 5 });
  });
  test('subtract', () => {
    expect(calculator('subtract', 5, 2)).toEqual({ result: 3 });
  });
  test('multiply', () => {
    expect(calculator('multiply', 4, 6)).toEqual({ result: 24 });
  });
  test('divide', () => {
    expect(calculator('divide', 8, 2)).toEqual({ result: 4 });
  });
  test('divide by zero', () => {
    expect(calculator('divide', 8, 0)).toEqual({ error: 'Division by zero' });
  });
  test('invalid numbers', () => {
    expect(calculator('add', 'foo', 'bar')).toEqual({ error: 'Invalid numbers' });
  });
  test('unknown operation', () => {
    expect(calculator('mod', 5, 2)).toEqual({ error: 'Unknown operation' });
  });
});
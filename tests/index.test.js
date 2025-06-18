import { startServer } from '../src/index.js';
import { calculator } from '../src/calculator.js';
const { fetch } = require('bun');

let server;
beforeAll(() => {
  server = startServer(3000);
});
afterAll(() => {
  if (server && server.stop) server.stop();
});

describe('Calculator API', () => {
  async function callApi(path) {
    const req = new Request(`http://localhost:3000${path}`);
    return await fetch(req);
  }

  test('/add returns sum', async () => {
    const res = await callApi('/add?a=2&b=3');
    const data = await res.json();
    expect(data).toEqual({ result: 5 });
  });

  test('/subtract returns difference', async () => {
    const res = await callApi('/subtract?a=5&b=2');
    const data = await res.json();
    expect(data).toEqual({ result: 3 });
  });

  test('/multiply returns product', async () => {
    const res = await callApi('/multiply?a=4&b=6');
    const data = await res.json();
    expect(data).toEqual({ result: 24 });
  });

  test('/divide returns quotient', async () => {
    const res = await callApi('/divide?a=8&b=2');
    const data = await res.json();
    expect(data).toEqual({ result: 4 });
  });

  test('/divide by zero returns error', async () => {
    const res = await callApi('/divide?a=8&b=0');
    const data = await res.json();
    expect(data).toEqual({ error: 'Division by zero' });
  });

  test('invalid numbers return error', async () => {
    const res = await callApi('/add?a=foo&b=bar');
    const data = await res.json();
    expect(data).toEqual({ error: 'Invalid numbers' });
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
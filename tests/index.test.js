import { handleRequest } from '../src/routes/api';
import { MainController } from '../src/controllers/main';

describe('API Routes', () => {
    let controller;

    beforeAll(() => {
        controller = new MainController();
    });

    test('GET / should return home page', async () => {
        const req = new Request('http://localhost/');
        const response = await controller.getHome(req);
        const text = await response.text();
        expect(text).toContain('<b>This is a freshly steamed bun</b>');
    });

    test('GET /data should return data', async () => {
        const req = new Request('http://localhost/data');
        const response = await controller.getData(req);
        const data = await response.json();
        expect(data).toEqual({ data: 'Sample Data' });
    });
});

// Calculator API tests for Bun

const { fetch } = require('bun');

describe('Calculator API', () => {
  async function callApi(path) {
    const req = new Request(`http://localhost:3000${path}`);
    // Use globalThis.server if available, otherwise fetch directly
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
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

function api(path, options) {
  return fetch(`http://localhost:${port}${path}`, options);
}

function postOrder(body) {
  return api('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postFuture(body) {
  return api('/api/futures/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function closeFuture(body) {
  return api('/api/futures/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Static site', () => {
  test('GET / returns the trading UI', async () => {
    const res = await api('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('BunTrade');
  });

  test('directory traversal is blocked', async () => {
    const res = await api('/../package.json');
    expect([403, 404]).toContain(res.status);
  });
});

describe('Market data', () => {
  test('GET /api/health returns ok', async () => {
    const res = await api('/api/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('GET /api/stocks returns an array of quotes', async () => {
    const res = await api('/api/stocks');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('each quote has the required fields', async () => {
    const data = await (await api('/api/stocks')).json();
    const q = data[0];
    expect(typeof q.symbol).toBe('string');
    expect(typeof q.name).toBe('string');
    expect(typeof q.price).toBe('number');
    expect(typeof q.change).toBe('number');
    expect(typeof q.changePct).toBe('number');
    expect(Array.isArray(q.spark)).toBe(true);
  });

  test('GET /api/stocks/:symbol returns one quote with history', async () => {
    const res = await api('/api/stocks/aapl'); // case-insensitive
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.symbol).toBe('AAPL');
    expect(data.name).toBe('Apple Inc.');
    expect(Array.isArray(data.history)).toBe(true);
    expect(data.history.length).toBeGreaterThan(1);
  });

  test('GET /api/stocks/:unknown returns 404', async () => {
    const res = await api('/api/stocks/NOPE');
    expect(res.status).toBe(404);
  });

  test('unknown API route returns 404', async () => {
    const res = await api('/api/unknown');
    expect(res.status).toBe(404);
  });
});

describe('Portfolio', () => {
  test('starts with the seed cash balance', async () => {
    const data = await (await api('/api/portfolio')).json();
    expect(typeof data.cash).toBe('number');
    expect(typeof data.equity).toBe('number');
    expect(data.startingCash).toBe(100000);
    expect(Array.isArray(data.holdings)).toBe(true);
  });
});

describe('Trading', () => {
  test('a buy order debits cash and opens a position', async () => {
    const before = await (await api('/api/portfolio')).json();

    const res = await postOrder({ symbol: 'AAPL', side: 'buy', quantity: 10 });
    expect(res.status).toBe(200);
    const { order, portfolio } = await res.json();

    expect(order.side).toBe('buy');
    expect(order.symbol).toBe('AAPL');
    expect(order.quantity).toBe(10);
    expect(order.total).toBeCloseTo(order.price * 10, 2);

    expect(portfolio.cash).toBeCloseTo(before.cash - order.total, 2);
    const held = portfolio.holdings.find((h) => h.symbol === 'AAPL');
    expect(held).toBeDefined();
    expect(held.shares).toBeGreaterThanOrEqual(10);
  });

  test('a sell order reduces the position', async () => {
    const before = await (await api('/api/portfolio')).json();
    const heldBefore = before.holdings.find((h) => h.symbol === 'AAPL');
    expect(heldBefore.shares).toBeGreaterThanOrEqual(4);

    const res = await postOrder({ symbol: 'AAPL', side: 'sell', quantity: 4 });
    expect(res.status).toBe(200);
    const { order, portfolio } = await res.json();

    expect(order.side).toBe('sell');
    const heldAfter = portfolio.holdings.find((h) => h.symbol === 'AAPL');
    expect(heldAfter.shares).toBe(heldBefore.shares - 4);
  });

  test('rejects a buy that exceeds available cash', async () => {
    const res = await postOrder({ symbol: 'AAPL', side: 'buy', quantity: 1_000_000_000 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/insufficient funds/i);
  });

  test('rejects selling shares that are not held', async () => {
    const res = await postOrder({ symbol: 'WMT', side: 'sell', quantity: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/insufficient shares/i);
  });

  test('rejects an unknown symbol', async () => {
    const res = await postOrder({ symbol: 'NOPE', side: 'buy', quantity: 1 });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid side', async () => {
    const res = await postOrder({ symbol: 'AAPL', side: 'hold', quantity: 1 });
    expect(res.status).toBe(400);
  });

  test('rejects non-positive and fractional quantities', async () => {
    expect((await postOrder({ symbol: 'AAPL', side: 'buy', quantity: 0 })).status).toBe(400);
    expect((await postOrder({ symbol: 'AAPL', side: 'buy', quantity: -5 })).status).toBe(400);
    expect((await postOrder({ symbol: 'AAPL', side: 'buy', quantity: 1.5 })).status).toBe(400);
  });

  test('rejects an invalid JSON body', async () => {
    const res = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  test('GET /api/orders lists executed orders newest first', async () => {
    const data = await (await api('/api/orders')).json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].timestamp).toBeGreaterThanOrEqual(data[data.length - 1].timestamp);
  });
});

describe('Commodities', () => {
  test('the spot feed includes commodities', async () => {
    const data = await (await api('/api/stocks')).json();
    const gold = data.find((q) => q.symbol === 'XAU');
    expect(gold).toBeDefined();
    expect(gold.assetClass).toBe('commodity');
    expect(gold.kind).toBe('spot');
  });

  test('a commodity trades like any other spot instrument', async () => {
    const res = await postOrder({ symbol: 'XAU', side: 'buy', quantity: 2 });
    expect(res.status).toBe(200);
    const { order, portfolio } = await res.json();
    expect(order.symbol).toBe('XAU');
    const held = portfolio.holdings.find((h) => h.symbol === 'XAU');
    expect(held).toBeDefined();
    expect(held.shares).toBeGreaterThanOrEqual(2);
  });
});

describe('Derivatives — futures', () => {
  test('GET /api/futures lists contracts with margin metadata', async () => {
    const res = await api('/api/futures');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const cl = data.find((q) => q.symbol === 'CL');
    expect(cl).toBeDefined();
    expect(cl.kind).toBe('future');
    expect(cl.assetClass).toBe('future');
    expect(typeof cl.multiplier).toBe('number');
    expect(typeof cl.marginRate).toBe('number');
    expect(cl.leverage).toBe(Math.round(1 / cl.marginRate));
    expect(cl.notional).toBeCloseTo(cl.price * cl.multiplier, 1);
    expect(cl.marginPerContract).toBeCloseTo(cl.price * cl.multiplier * cl.marginRate, 1);
  });

  test('futures do not appear in the spot feed', async () => {
    const spot = await (await api('/api/stocks')).json();
    expect(spot.find((q) => q.symbol === 'CL')).toBeUndefined();
  });

  test('the spot desk rejects a futures symbol', async () => {
    const res = await postOrder({ symbol: 'CL', side: 'buy', quantity: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/derivatives/i);
  });

  test('opening a long locks margin and creates a position', async () => {
    const before = await (await api('/api/portfolio')).json();
    const res = await postFuture({ symbol: 'GC', direction: 'long', contracts: 1 });
    expect(res.status).toBe(200);
    const { order, portfolio } = await res.json();

    expect(order.kind).toBe('future');
    expect(order.action).toBe('open');
    expect(order.direction).toBe('long');
    expect(order.margin).toBeGreaterThan(0);

    const pos = portfolio.positions.find((p) => p.symbol === 'GC');
    expect(pos).toBeDefined();
    expect(pos.direction).toBe('long');
    expect(pos.contracts).toBe(1);

    // Opening locks margin out of free cash; equity is ~unchanged at entry.
    expect(portfolio.cash).toBeCloseTo(before.cash - order.margin, 0);
    expect(portfolio.marginUsed).toBeCloseTo(order.margin, 0);
  });

  test('opening a short position is allowed', async () => {
    const res = await postFuture({ symbol: 'NG', direction: 'short', contracts: 2 });
    expect(res.status).toBe(200);
    const { portfolio } = await res.json();
    const pos = portfolio.positions.find((p) => p.symbol === 'NG');
    expect(pos).toBeDefined();
    expect(pos.direction).toBe('short');
    expect(pos.contracts).toBe(2);
  });

  test('closing a position realizes P&L and frees margin', async () => {
    const before = await (await api('/api/portfolio')).json();
    const res = await closeFuture({ symbol: 'GC' });
    expect(res.status).toBe(200);
    const { order, portfolio } = await res.json();
    expect(order.action).toBe('close');
    expect(portfolio.positions.find((p) => p.symbol === 'GC')).toBeUndefined();
    expect(portfolio.marginUsed).toBeLessThan(before.marginUsed);
  });

  test('a partial close reduces the contract count', async () => {
    await postFuture({ symbol: 'CL', direction: 'long', contracts: 3 });
    const res = await closeFuture({ symbol: 'CL', contracts: 1 });
    expect(res.status).toBe(200);
    const { portfolio } = await res.json();
    const pos = portfolio.positions.find((p) => p.symbol === 'CL');
    expect(pos).toBeDefined();
    expect(pos.contracts).toBe(2);
  });

  test('rejects an unknown futures contract', async () => {
    const res = await postFuture({ symbol: 'NOPE', direction: 'long', contracts: 1 });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid direction', async () => {
    const res = await postFuture({ symbol: 'GC', direction: 'hold', contracts: 1 });
    expect(res.status).toBe(400);
  });

  test('rejects non-positive and fractional contract counts', async () => {
    expect((await postFuture({ symbol: 'GC', direction: 'long', contracts: 0 })).status).toBe(400);
    expect((await postFuture({ symbol: 'GC', direction: 'long', contracts: -2 })).status).toBe(400);
    expect((await postFuture({ symbol: 'GC', direction: 'long', contracts: 1.5 })).status).toBe(400);
  });

  test('rejects an order that exceeds available margin', async () => {
    const res = await postFuture({ symbol: 'ES', direction: 'long', contracts: 100000 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/margin/i);
  });

  test('closing with no open position is rejected', async () => {
    const res = await closeFuture({ symbol: 'ZW' });
    expect(res.status).toBe(400);
  });

  test('portfolio exposes derivative summary fields', async () => {
    const data = await (await api('/api/portfolio')).json();
    expect(Array.isArray(data.positions)).toBe(true);
    expect(typeof data.marginUsed).toBe('number');
    expect(typeof data.derivativesPL).toBe('number');
  });
});

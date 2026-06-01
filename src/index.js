import { serve } from "bun";
import path from "node:path";

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

// ---------------------------------------------------------------------------
// Market definition
//
// This is a simulated market: prices random-walk on a fixed interval so the
// platform feels live without any external data feed. Each instrument has a
// per-tick volatility that shapes how aggressively its price moves.
// ---------------------------------------------------------------------------
const INSTRUMENTS = {
  AAPL:  { name: "Apple Inc.",        sector: "Technology",    basePrice: 195.20, volatility: 0.012 },
  MSFT:  { name: "Microsoft Corp.",   sector: "Technology",    basePrice: 418.30, volatility: 0.010 },
  GOOGL: { name: "Alphabet Inc.",     sector: "Communication", basePrice: 176.40, volatility: 0.013 },
  AMZN:  { name: "Amazon.com Inc.",   sector: "Consumer",      basePrice: 184.70, volatility: 0.015 },
  NVDA:  { name: "NVIDIA Corp.",      sector: "Technology",    basePrice: 124.90, volatility: 0.025 },
  TSLA:  { name: "Tesla Inc.",        sector: "Consumer",      basePrice: 251.10, volatility: 0.030 },
  META:  { name: "Meta Platforms",    sector: "Communication", basePrice: 502.30, volatility: 0.018 },
  JPM:   { name: "JPMorgan Chase",    sector: "Financials",    basePrice: 198.60, volatility: 0.011 },
  V:     { name: "Visa Inc.",         sector: "Financials",    basePrice: 275.40, volatility: 0.009 },
  WMT:   { name: "Walmart Inc.",      sector: "Consumer",      basePrice: 67.80,  volatility: 0.008 },
  XOM:   { name: "Exxon Mobil",       sector: "Energy",        basePrice: 113.20, volatility: 0.014 },
  DIS:   { name: "Walt Disney Co.",   sector: "Communication", basePrice: 101.50, volatility: 0.016 },
  BTC:   { name: "Bitcoin",           sector: "Crypto",        basePrice: 67500,  volatility: 0.035 },
  ETH:   { name: "Ethereum",          sector: "Crypto",        basePrice: 3520,   volatility: 0.040 },
};

const HISTORY_LEN = 60;       // price points retained per instrument
const TICK_MS = 2000;         // how often prices move
const STARTING_CASH = 100_000;

// ---------------------------------------------------------------------------
// In-memory state
//
// MVP scope: a single shared paper-trading account. State lives in memory and
// resets when the process restarts. There is no persistence or multi-user
// auth — those are deliberate non-goals for this milestone.
// ---------------------------------------------------------------------------
const market = {};            // symbol -> live quote
const portfolio = {
  cash: STARTING_CASH,
  startingCash: STARTING_CASH,
  holdings: {},               // symbol -> { shares, avgCost }
  realizedPL: 0,
};
const orders = [];            // executed orders, newest first
let orderSeq = 1;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function refreshChange(q) {
  q.change = round2(q.price - q.prevClose);
  q.changePct = q.prevClose ? round2((q.change / q.prevClose) * 100) : 0;
}

function initMarket() {
  for (const [symbol, def] of Object.entries(INSTRUMENTS)) {
    const prevClose = def.basePrice;
    // Seed gentle noise around the base price so charts aren't empty on boot.
    const history = [];
    for (let i = 0; i < HISTORY_LEN; i++) {
      history.push(round2(prevClose * (1 + rand(-0.5, 0.5) * def.volatility)));
    }
    const price = history[history.length - 1];
    market[symbol] = {
      symbol,
      name: def.name,
      sector: def.sector,
      volatility: def.volatility,
      price,
      open: history[0],
      prevClose,
      dayHigh: Math.max(price, prevClose),
      dayLow: Math.min(price, prevClose),
      volume: Math.round(rand(1_000_000, 20_000_000)),
      history,
      updatedAt: Date.now(),
    };
    refreshChange(market[symbol]);
  }
}

function tickMarket() {
  for (const q of Object.values(market)) {
    const drift = rand(-q.volatility, q.volatility);
    const next = Math.max(0.01, q.price * (1 + drift));
    q.price = round2(next);
    q.dayHigh = Math.max(q.dayHigh, q.price);
    q.dayLow = Math.min(q.dayLow, q.price);
    q.volume += Math.round(rand(1_000, 200_000));
    q.history.push(q.price);
    if (q.history.length > HISTORY_LEN) q.history.shift();
    q.updatedAt = Date.now();
    refreshChange(q);
  }
}

initMarket();
const ticker = setInterval(tickMarket, TICK_MS);
// Don't let the price ticker keep the process alive on its own (e.g. in tests).
if (typeof ticker.unref === "function") ticker.unref();

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
function publicQuote(q, includeHistory = false) {
  const out = {
    symbol: q.symbol,
    name: q.name,
    sector: q.sector,
    price: q.price,
    open: q.open,
    prevClose: q.prevClose,
    change: q.change,
    changePct: q.changePct,
    dayHigh: q.dayHigh,
    dayLow: q.dayLow,
    volume: q.volume,
    spark: q.history.slice(-30),
    updatedAt: q.updatedAt,
  };
  if (includeHistory) out.history = q.history.slice();
  return out;
}

function portfolioView() {
  const holdings = [];
  let marketValue = 0;
  let costBasis = 0;

  for (const [symbol, h] of Object.entries(portfolio.holdings)) {
    const q = market[symbol];
    const price = q ? q.price : 0;
    const value = round2(price * h.shares);
    const cost = round2(h.avgCost * h.shares);
    const pl = round2(value - cost);
    marketValue += value;
    costBasis += cost;
    holdings.push({
      symbol,
      name: q ? q.name : symbol,
      shares: h.shares,
      avgCost: round2(h.avgCost),
      price,
      changePct: q ? q.changePct : 0,
      marketValue: value,
      costBasis: cost,
      unrealizedPL: pl,
      unrealizedPLPct: cost > 0 ? round2((pl / cost) * 100) : 0,
    });
  }

  holdings.sort((a, b) => b.marketValue - a.marketValue);

  const equity = round2(portfolio.cash + marketValue);
  return {
    cash: round2(portfolio.cash),
    startingCash: portfolio.startingCash,
    marketValue: round2(marketValue),
    costBasis: round2(costBasis),
    equity,
    unrealizedPL: round2(marketValue - costBasis),
    unrealizedPLPct: costBasis > 0 ? round2(((marketValue - costBasis) / costBasis) * 100) : 0,
    realizedPL: round2(portfolio.realizedPL),
    totalPL: round2(equity - portfolio.startingCash),
    totalPLPct: round2(((equity - portfolio.startingCash) / portfolio.startingCash) * 100),
    holdings,
  };
}

// ---------------------------------------------------------------------------
// Order execution (market orders, filled instantly at the current price)
// ---------------------------------------------------------------------------
function placeOrder(req) {
  const symbol = typeof req.symbol === "string" ? req.symbol.toUpperCase() : "";
  const side = typeof req.side === "string" ? req.side.toLowerCase() : "";
  const quantity = Number(req.quantity);

  if (!market[symbol]) {
    return { error: "Unknown symbol", status: 400 };
  }
  if (side !== "buy" && side !== "sell") {
    return { error: "Side must be 'buy' or 'sell'", status: 400 };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a positive whole number", status: 400 };
  }

  const q = market[symbol];
  const price = q.price;
  const total = round2(price * quantity);

  if (side === "buy") {
    if (total > portfolio.cash) {
      return { error: "Insufficient funds", status: 400 };
    }
    portfolio.cash = round2(portfolio.cash - total);
    const h = portfolio.holdings[symbol] || { shares: 0, avgCost: 0 };
    const shares = h.shares + quantity;
    h.avgCost = (h.avgCost * h.shares + price * quantity) / shares;
    h.shares = shares;
    portfolio.holdings[symbol] = h;
  } else {
    const h = portfolio.holdings[symbol];
    if (!h || h.shares < quantity) {
      return { error: "Insufficient shares", status: 400 };
    }
    portfolio.cash = round2(portfolio.cash + total);
    portfolio.realizedPL = round2(portfolio.realizedPL + (price - h.avgCost) * quantity);
    h.shares -= quantity;
    if (h.shares === 0) delete portfolio.holdings[symbol];
  }

  const order = {
    id: orderSeq++,
    symbol,
    name: q.name,
    side,
    quantity,
    price: round2(price),
    total,
    timestamp: Date.now(),
  };
  orders.unshift(order);
  if (orders.length > 100) orders.pop();

  return { order, status: 200 };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
export function startServer(port = 3000) {
  return serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (pathname.startsWith("/api")) {
        const headers = { "Content-Type": "application/json" };
        const json = (body, status = 200) =>
          new Response(JSON.stringify(body), { status, headers });

        if (pathname === "/api/health") {
          return json({ status: "ok", time: Date.now() });
        }

        if (pathname === "/api/stocks" && req.method === "GET") {
          return json(Object.values(market).map((q) => publicQuote(q)));
        }

        if (pathname.startsWith("/api/stocks/") && req.method === "GET") {
          const symbol = decodeURIComponent(pathname.split("/").pop() || "").toUpperCase();
          if (market[symbol]) return json(publicQuote(market[symbol], true));
          return json({ error: "Symbol not found" }, 404);
        }

        if (pathname === "/api/portfolio" && req.method === "GET") {
          return json(portfolioView());
        }

        if (pathname === "/api/orders" && req.method === "GET") {
          return json(orders);
        }

        if (pathname === "/api/orders" && req.method === "POST") {
          let body;
          try {
            body = await req.json();
          } catch {
            return json({ error: "Invalid JSON body" }, 400);
          }
          const result = placeOrder(body || {});
          if (result.error) return json({ error: result.error }, result.status);
          return json({ order: result.order, portfolio: portfolioView() });
        }

        return json({ error: "Not Found" }, 404);
      }

      // Static files from ./public
      const filePath = path.join("public", pathname === "/" ? "index.html" : pathname);
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
}

if (import.meta.main) {
  const server = startServer(3000);
  console.log(`📈 BunTrade running at http://localhost:${server.port}`);
}

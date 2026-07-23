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
//
// Two families of instrument trade here:
//   • spot     — equities, crypto and commodities. Bought/sold outright and
//                held long-only; the order debits or credits cash 1:1.
//   • future   — cash-settled derivatives. They trade on margin (leverage =
//                1 / marginRate), can be held long OR short, and are marked to
//                market continuously. One contract controls `multiplier` units
//                of the underlying, so its notional value is price × multiplier.
// ---------------------------------------------------------------------------
const SPOT = {
  // ----- Equities -----
  AAPL:  { name: "Apple Inc.",        sector: "Technology",    assetClass: "equity", basePrice: 195.20, volatility: 0.012 },
  MSFT:  { name: "Microsoft Corp.",   sector: "Technology",    assetClass: "equity", basePrice: 418.30, volatility: 0.010 },
  GOOGL: { name: "Alphabet Inc.",     sector: "Communication", assetClass: "equity", basePrice: 176.40, volatility: 0.013 },
  AMZN:  { name: "Amazon.com Inc.",   sector: "Consumer",      assetClass: "equity", basePrice: 184.70, volatility: 0.015 },
  NVDA:  { name: "NVIDIA Corp.",      sector: "Technology",    assetClass: "equity", basePrice: 124.90, volatility: 0.025 },
  TSLA:  { name: "Tesla Inc.",        sector: "Consumer",      assetClass: "equity", basePrice: 251.10, volatility: 0.030 },
  META:  { name: "Meta Platforms",    sector: "Communication", assetClass: "equity", basePrice: 502.30, volatility: 0.018 },
  JPM:   { name: "JPMorgan Chase",    sector: "Financials",    assetClass: "equity", basePrice: 198.60, volatility: 0.011 },
  V:     { name: "Visa Inc.",         sector: "Financials",    assetClass: "equity", basePrice: 275.40, volatility: 0.009 },
  WMT:   { name: "Walmart Inc.",      sector: "Consumer",      assetClass: "equity", basePrice: 67.80,  volatility: 0.008 },
  XOM:   { name: "Exxon Mobil",       sector: "Energy",        assetClass: "equity", basePrice: 113.20, volatility: 0.014 },
  DIS:   { name: "Walt Disney Co.",   sector: "Communication", assetClass: "equity", basePrice: 101.50, volatility: 0.016 },
  // ----- Crypto -----
  BTC:   { name: "Bitcoin",           sector: "Crypto",        assetClass: "crypto", basePrice: 67500,  volatility: 0.035 },
  ETH:   { name: "Ethereum",          sector: "Crypto",        assetClass: "crypto", basePrice: 3520,   volatility: 0.040 },
  // ----- Commodities (spot) -----
  XAU:    { name: "Gold (Spot)",      sector: "Metals",        assetClass: "commodity", basePrice: 2350.00, volatility: 0.010, unit: "oz" },
  XAG:    { name: "Silver (Spot)",    sector: "Metals",        assetClass: "commodity", basePrice: 30.50,   volatility: 0.018, unit: "oz" },
  WTI:    { name: "WTI Crude Oil",    sector: "Energy",        assetClass: "commodity", basePrice: 78.40,   volatility: 0.020, unit: "bbl" },
  BRENT:  { name: "Brent Crude Oil",  sector: "Energy",        assetClass: "commodity", basePrice: 82.10,   volatility: 0.019, unit: "bbl" },
  NATGAS: { name: "Natural Gas",      sector: "Energy",        assetClass: "commodity", basePrice: 2.85,    volatility: 0.030, unit: "MMBtu" },
  COPPER: { name: "Copper",           sector: "Metals",        assetClass: "commodity", basePrice: 4.25,    volatility: 0.016, unit: "lb" },
  WHEAT:  { name: "Wheat",            sector: "Agriculture",   assetClass: "commodity", basePrice: 5.90,    volatility: 0.018, unit: "bu" },
  CORN:   { name: "Corn",             sector: "Agriculture",   assetClass: "commodity", basePrice: 4.40,    volatility: 0.017, unit: "bu" },
  COFFEE: { name: "Coffee",           sector: "Agriculture",   assetClass: "commodity", basePrice: 2.30,    volatility: 0.025, unit: "lb" },
  SUGAR:  { name: "Sugar",            sector: "Agriculture",   assetClass: "commodity", basePrice: 0.21,    volatility: 0.022, unit: "lb" },
};

const FUTURES = {
  GC: { name: "Gold Futures",       sector: "Metals",      underlying: "XAU",    multiplier: 100,   marginRate: 0.05, unit: "oz",    basePrice: 2352.00, volatility: 0.011 },
  SI: { name: "Silver Futures",     sector: "Metals",      underlying: "XAG",    multiplier: 5000,  marginRate: 0.08, unit: "oz",    basePrice: 30.60,   volatility: 0.020 },
  HG: { name: "Copper Futures",     sector: "Metals",      underlying: "COPPER", multiplier: 25000, marginRate: 0.08, unit: "lb",    basePrice: 4.27,    volatility: 0.017 },
  CL: { name: "Crude Oil Futures",  sector: "Energy",      underlying: "WTI",    multiplier: 1000,  marginRate: 0.07, unit: "bbl",   basePrice: 78.60,   volatility: 0.022 },
  NG: { name: "Nat Gas Futures",    sector: "Energy",      underlying: "NATGAS", multiplier: 10000, marginRate: 0.10, unit: "MMBtu", basePrice: 2.87,    volatility: 0.032 },
  ZC: { name: "Corn Futures",       sector: "Agriculture", underlying: "CORN",   multiplier: 5000,  marginRate: 0.08, unit: "bu",    basePrice: 4.42,    volatility: 0.018 },
  ZW: { name: "Wheat Futures",      sector: "Agriculture", underlying: "WHEAT",  multiplier: 5000,  marginRate: 0.08, unit: "bu",    basePrice: 5.92,    volatility: 0.019 },
  ES: { name: "E-mini S&P 500",     sector: "Index",       underlying: null,     multiplier: 50,    marginRate: 0.06, unit: "index", basePrice: 5300.00, volatility: 0.012 },
  NQ: { name: "E-mini Nasdaq 100",  sector: "Index",       underlying: null,     multiplier: 20,    marginRate: 0.06, unit: "index", basePrice: 18500.0, volatility: 0.015 },
};

// All contracts share one expiry a quarter out — far enough that the MVP never
// has to auto-settle a position (deliberately out of scope for this milestone).
const FUTURES_EXPIRY = Date.now() + 90 * 24 * 60 * 60 * 1000;

function buildInstruments() {
  const defs = {};
  for (const [symbol, d] of Object.entries(SPOT)) {
    defs[symbol] = { ...d, kind: "spot", unit: d.unit || "share" };
  }
  for (const [symbol, d] of Object.entries(FUTURES)) {
    defs[symbol] = {
      ...d,
      kind: "future",
      assetClass: "future",
      sector: `${d.sector} Future`,
      leverage: Math.round(1 / d.marginRate),
      expiry: FUTURES_EXPIRY,
    };
  }
  return defs;
}

const INSTRUMENTS = buildInstruments();

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
  cash: STARTING_CASH,        // free cash; opening a future locks part of it as margin
  startingCash: STARTING_CASH,
  holdings: {},               // symbol -> { shares, avgCost }            (spot, long-only)
  positions: {},              // symbol -> { net, entry, margin }         (futures; net<0 = short)
  realizedPL: 0,              // combined spot + futures realized P&L
};
const orders = [];            // executed orders, newest first
let orderSeq = 1;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function daysUntil(ts) {
  return Math.max(0, Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000)));
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
    const q = {
      symbol,
      name: def.name,
      sector: def.sector,
      assetClass: def.assetClass,
      kind: def.kind,
      unit: def.unit,
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
    if (def.kind === "future") {
      q.multiplier = def.multiplier;
      q.marginRate = def.marginRate;
      q.leverage = def.leverage;
      q.underlying = def.underlying;
      q.expiry = def.expiry;
    }
    market[symbol] = q;
    refreshChange(q);
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
    assetClass: q.assetClass,
    kind: q.kind,
    unit: q.unit,
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
  if (q.kind === "future") {
    out.multiplier = q.multiplier;
    out.marginRate = q.marginRate;
    out.leverage = q.leverage;
    out.underlying = q.underlying;
    out.notional = round2(q.price * q.multiplier);
    out.marginPerContract = round2(q.price * q.multiplier * q.marginRate);
    out.expiry = q.expiry;
    out.daysToExpiry = daysUntil(q.expiry);
  }
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

  // Futures positions, marked to market. Each position has locked `margin`
  // (cash already moved out of the free balance) plus a floating P&L; both
  // belong to the account, so equity = cash + spot value + margin + open P&L.
  const positions = [];
  let marginUsed = 0;
  let openPL = 0;

  for (const [symbol, p] of Object.entries(portfolio.positions)) {
    const q = market[symbol];
    const mark = q ? q.price : 0;
    const mult = q ? q.multiplier : 0;
    const contracts = Math.abs(p.net);
    const uPL = round2((mark - p.entry) * mult * p.net);
    marginUsed += p.margin;
    openPL += uPL;
    positions.push({
      symbol,
      name: q ? q.name : symbol,
      direction: p.net >= 0 ? "long" : "short",
      contracts,
      entry: round2(p.entry),
      mark,
      multiplier: mult,
      leverage: q ? q.leverage : null,
      margin: round2(p.margin),
      notional: round2(mark * mult * contracts),
      unrealizedPL: uPL,
      unrealizedPLPct: p.margin > 0 ? round2((uPL / p.margin) * 100) : 0,
      daysToExpiry: q ? daysUntil(q.expiry) : 0,
    });
  }
  positions.sort((a, b) => b.notional - a.notional);

  const equity = round2(portfolio.cash + marketValue + marginUsed + openPL);
  return {
    cash: round2(portfolio.cash),
    startingCash: portfolio.startingCash,
    marketValue: round2(marketValue),
    costBasis: round2(costBasis),
    marginUsed: round2(marginUsed),
    derivativesPL: round2(openPL),
    equity,
    unrealizedPL: round2(marketValue - costBasis),
    unrealizedPLPct: costBasis > 0 ? round2(((marketValue - costBasis) / costBasis) * 100) : 0,
    realizedPL: round2(portfolio.realizedPL),
    totalPL: round2(equity - portfolio.startingCash),
    totalPLPct: round2(((equity - portfolio.startingCash) / portfolio.startingCash) * 100),
    holdings,
    positions,
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
  if (market[symbol].kind !== "spot") {
    return { error: "Futures trade on the derivatives desk", status: 400 };
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
    kind: "spot",
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
// Derivatives execution (cash-settled futures)
//
// A futures order is expressed as a signed contract count: +N goes long, −N
// short. `planFuturesOrder` computes the resulting position, cash movement and
// realized P&L without mutating state, so the caller can validate margin and
// apply the change atomically. One function handles every case — open, add,
// partial close, full close, and flipping from one side to the other.
// ---------------------------------------------------------------------------
function planFuturesOrder(q, sign, contracts) {
  const { price: mark, multiplier: mult, marginRate: rate } = q;
  const pos = portfolio.positions[q.symbol];
  const net0 = pos ? pos.net : 0;

  let realized = 0;
  let cashDelta = 0;
  let openedMargin = 0;
  let final = null; // { net, entry, margin }; null means the position is closed

  if (net0 !== 0 && Math.sign(net0) !== sign) {
    // Order is opposite the open position: close some/all of it, maybe flip.
    const dirSign = Math.sign(net0);
    const closeQty = Math.min(contracts, Math.abs(net0));
    const pnl = round2((mark - pos.entry) * mult * closeQty * dirSign);
    const releasedMargin = round2(pos.margin * (closeQty / Math.abs(net0)));
    realized += pnl;
    cashDelta += releasedMargin + pnl;

    const remainder = contracts - closeQty;   // contracts that flip to `sign`
    const leftAbs = Math.abs(net0) - closeQty; // contracts still open as before
    if (remainder > 0) {
      openedMargin = round2(remainder * mark * mult * rate);
      cashDelta -= openedMargin;
      final = { net: sign * remainder, entry: mark, margin: openedMargin };
    } else if (leftAbs > 0) {
      final = { net: dirSign * leftAbs, entry: pos.entry, margin: round2(pos.margin - releasedMargin) };
    }
  } else {
    // Open a fresh position or add contracts on the same side.
    openedMargin = round2(contracts * mark * mult * rate);
    cashDelta -= openedMargin;
    const newAbs = Math.abs(net0) + contracts;
    const entry = net0 !== 0 ? (pos.entry * Math.abs(net0) + mark * contracts) / newAbs : mark;
    final = { net: sign * newAbs, entry, margin: round2((pos ? pos.margin : 0) + openedMargin) };
  }

  return { realized, cashDelta, openedMargin, final, mark };
}

function tradeFuture(q, sign, contracts, intent, dirLabel) {
  const plan = planFuturesOrder(q, sign, contracts);
  if (plan.cashDelta < 0 && -plan.cashDelta > portfolio.cash + 1e-6) {
    return { error: "Insufficient margin", status: 400 };
  }

  portfolio.cash = round2(portfolio.cash + plan.cashDelta);
  portfolio.realizedPL = round2(portfolio.realizedPL + plan.realized);
  if (plan.final) {
    plan.final.entry = round2(plan.final.entry);
    portfolio.positions[q.symbol] = plan.final;
  } else {
    delete portfolio.positions[q.symbol];
  }

  const order = {
    id: orderSeq++,
    kind: "future",
    symbol: q.symbol,
    name: q.name,
    action: intent,                              // "open" | "close"
    direction: dirLabel || (sign > 0 ? "long" : "short"),
    contracts,
    price: round2(plan.mark),
    margin: round2(plan.openedMargin),
    realizedPL: round2(plan.realized),
    multiplier: q.multiplier,
    timestamp: Date.now(),
  };
  orders.unshift(order);
  if (orders.length > 100) orders.pop();

  return { order, status: 200 };
}

function openFuture(req) {
  const symbol = typeof req.symbol === "string" ? req.symbol.toUpperCase() : "";
  const direction = typeof req.direction === "string" ? req.direction.toLowerCase() : "";
  const contracts = Number(req.contracts);
  const q = market[symbol];

  if (!q || q.kind !== "future") {
    return { error: "Unknown futures contract", status: 400 };
  }
  if (direction !== "long" && direction !== "short") {
    return { error: "Direction must be 'long' or 'short'", status: 400 };
  }
  if (!Number.isInteger(contracts) || contracts <= 0) {
    return { error: "Contracts must be a positive whole number", status: 400 };
  }

  return tradeFuture(q, direction === "long" ? 1 : -1, contracts, "open", direction);
}

function closeFuture(req) {
  const symbol = typeof req.symbol === "string" ? req.symbol.toUpperCase() : "";
  const q = market[symbol];
  if (!q || q.kind !== "future") {
    return { error: "Unknown futures contract", status: 400 };
  }

  const pos = portfolio.positions[symbol];
  if (!pos) {
    return { error: "No open position to close", status: 400 };
  }

  const held = Math.abs(pos.net);
  let contracts = req.contracts === undefined ? held : Number(req.contracts);
  if (!Number.isInteger(contracts) || contracts <= 0) {
    return { error: "Contracts must be a positive whole number", status: 400 };
  }
  contracts = Math.min(contracts, held); // a close never flips the position

  const originalDir = pos.net > 0 ? "long" : "short";
  return tradeFuture(q, pos.net > 0 ? -1 : 1, contracts, "close", originalDir);
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
          return json(
            Object.values(market)
              .filter((q) => q.kind === "spot")
              .map((q) => publicQuote(q)),
          );
        }

        if (pathname === "/api/futures" && req.method === "GET") {
          return json(
            Object.values(market)
              .filter((q) => q.kind === "future")
              .map((q) => publicQuote(q)),
          );
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

        if (pathname === "/api/futures/orders" && req.method === "POST") {
          let body;
          try {
            body = await req.json();
          } catch {
            return json({ error: "Invalid JSON body" }, 400);
          }
          const result = openFuture(body || {});
          if (result.error) return json({ error: result.error }, result.status);
          return json({ order: result.order, portfolio: portfolioView() });
        }

        if (pathname === "/api/futures/close" && req.method === "POST") {
          let body;
          try {
            body = await req.json();
          } catch {
            return json({ error: "Invalid JSON body" }, 400);
          }
          const result = closeFuture(body || {});
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

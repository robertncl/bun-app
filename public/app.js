// BunTrade — front-end controller.
// Polls the simulated market every couple of seconds and drives the dashboard:
// market list, live price chart, trade ticket, portfolio and order history.
//
// Two instrument families share the UI. Spot instruments (equities, crypto,
// commodities) buy/sell outright; futures are leveraged derivatives that trade
// long or short on margin. The trade ticket and portfolio adapt to whichever
// kind of instrument is selected.

const UP = "#26d07c";
const DOWN = "#f6465d";
const POLL_MS = 2000;

const ASSET_TABS = [
  { id: "all", label: "All" },
  { id: "equity", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
  { id: "commodity", label: "Commodities" },
  { id: "future", label: "Futures" },
];

let stocks = {};         // symbol -> quote (spot and futures combined)
let portfolio = null;    // latest portfolio view
let orders = [];         // executed orders, newest first
let selected = null;     // currently focused symbol
let side = "buy";        // ticket side: buy/sell for spot, long/short for futures
let searchTerm = "";
let assetFilter = "all"; // active asset-class tab
let renderedKey = "";    // signature of the rows currently in the DOM
const prevPrice = {};    // symbol -> last seen price, for tick flashes

// --- formatting helpers ---------------------------------------------------
const money = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => "$" + money(n);
const signedUsd = (n) => (n >= 0 ? "+" : "−") + "$" + money(Math.abs(n));
const pct = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";

function compact(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

const isFuture = (s) => s && s.kind === "future";

// --- charts (dependency-free SVG) -----------------------------------------
function sparkSVG(values, color) {
  if (!values || values.length < 2) return "";
  const w = 72, h = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const line = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

function chartSVG(values, color) {
  if (!values || values.length < 2) return "";
  const w = 320, h = 110;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 6 - ((v - min) / range) * (h - 12),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = "grad-" + Math.random().toString(36).slice(2, 8);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// --- market list ----------------------------------------------------------
function visibleStocks() {
  const term = searchTerm.trim().toUpperCase();
  return Object.values(stocks)
    .filter((s) => assetFilter === "all" || s.assetClass === assetFilter)
    .filter((s) => !term || s.symbol.includes(term) || s.name.toUpperCase().includes(term))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function rowHTML(s) {
  const up = s.changePct >= 0;
  const tag = isFuture(s) ? `<span class="row-tag">${s.leverage}×</span>` : "";
  return `<button class="row${s.symbol === selected ? " active" : ""}" data-symbol="${s.symbol}">
    <span class="row-sym"><b>${s.symbol}${tag}</b><small>${s.name}</small></span>
    <span class="row-last num">${money(s.price)}</span>
    <span class="row-chg num ${up ? "up" : "down"}">${pct(s.changePct)}</span>
    <span class="row-spark">${sparkSVG(s.spark, up ? UP : DOWN)}</span>
  </button>`;
}

function updateRow(list, s) {
  const row = list.querySelector(`.row[data-symbol="${s.symbol}"]`);
  if (!row) return;
  const up = s.changePct >= 0;

  const last = row.querySelector(".row-last");
  const prev = prevPrice[s.symbol];
  if (prev !== undefined && s.price !== prev) {
    last.classList.remove("tick-up", "tick-down");
    void last.offsetWidth; // restart the flash animation
    last.classList.add(s.price > prev ? "tick-up" : "tick-down");
  }
  last.textContent = money(s.price);

  const chg = row.querySelector(".row-chg");
  chg.textContent = pct(s.changePct);
  chg.className = `row-chg num ${up ? "up" : "down"}`;

  row.querySelector(".row-spark").innerHTML = sparkSVG(s.spark, up ? UP : DOWN);
  row.classList.toggle("active", s.symbol === selected);
  prevPrice[s.symbol] = s.price;
}

function renderMarketList() {
  const list = document.getElementById("market-list");
  const items = visibleStocks();
  const key = items.map((s) => s.symbol).join(",");

  if (key !== renderedKey) {
    list.innerHTML = items.map(rowHTML).join("") || `<div class="empty">No matches.</div>`;
    list.querySelectorAll(".row").forEach((r) =>
      r.addEventListener("click", () => selectStock(r.dataset.symbol)));
    items.forEach((s) => (prevPrice[s.symbol] = s.price));
    renderedKey = key;
  } else {
    items.forEach((s) => updateRow(list, s));
  }
}

function renderTabs() {
  const el = document.getElementById("asset-tabs");
  el.innerHTML = ASSET_TABS.map(
    (t) => `<button class="asset-tab${t.id === assetFilter ? " active" : ""}" data-filter="${t.id}" aria-pressed="${t.id === assetFilter}">${t.label}</button>`,
  ).join("");
  el.querySelectorAll(".asset-tab").forEach((b) =>
    b.addEventListener("click", () => {
      assetFilter = b.dataset.filter;
      el.querySelectorAll(".asset-tab").forEach((x) => {
        const on = x === b;
        x.classList.toggle("active", on);
        x.setAttribute("aria-pressed", String(on));
      });
      renderMarketList();
    }));
}

// --- trade panel ----------------------------------------------------------
function buildTradeShell() {
  document.getElementById("trade-panel").innerHTML = `
    <div class="trade-head" id="trade-head"></div>
    <div class="chart-wrap" id="trade-chart"></div>
    <div class="stat-row" id="trade-stats"></div>
    <div class="ticket" id="trade-ticket"></div>`;
}

function renderQuote() {
  const s = stocks[selected];
  if (!s) return;
  const up = s.changePct >= 0;
  const color = up ? UP : DOWN;

  document.getElementById("trade-head").innerHTML = `
    <div class="th-id">
      <div class="th-sym">${s.symbol} <span class="th-name">${s.name}</span></div>
      <div class="th-sector">${s.sector}</div>
    </div>
    <div class="th-price">
      <div class="big-price">${usd(s.price)}</div>
      <div class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${money(Math.abs(s.change))} (${pct(s.changePct)})</div>
    </div>`;

  document.getElementById("trade-chart").innerHTML = chartSVG(s.spark, color);

  document.getElementById("trade-stats").innerHTML = isFuture(s)
    ? `
      <div><span>Notional</span><b>$${compact(s.notional)}</b></div>
      <div><span>Leverage</span><b>${s.leverage}×</b></div>
      <div><span>Margin</span><b>$${compact(s.marginPerContract)}</b></div>
      <div><span>Expiry</span><b>${s.daysToExpiry}d</b></div>`
    : `
      <div><span>Open</span><b>${money(s.open)}</b></div>
      <div><span>High</span><b>${money(s.dayHigh)}</b></div>
      <div><span>Low</span><b>${money(s.dayLow)}</b></div>
      <div><span>Volume</span><b>${compact(s.volume)}</b></div>`;
}

function renderTicket() {
  const s = stocks[selected];
  if (!s) return;
  if (isFuture(s)) renderFutureTicket(s);
  else renderSpotTicket(s);
}

function renderSpotTicket(s) {
  if (side !== "buy" && side !== "sell") side = "buy";
  const held = portfolio?.holdings?.find((h) => h.symbol === selected);

  document.getElementById("trade-ticket").innerHTML = `
    <div class="side-toggle">
      <button class="side-btn buy${side === "buy" ? " active" : ""}" data-side="buy">Buy</button>
      <button class="side-btn sell${side === "sell" ? " active" : ""}" data-side="sell">Sell</button>
    </div>
    <label class="field">
      <span>Quantity</span>
      <input id="qty" type="number" min="1" step="1" value="1" inputmode="numeric" />
    </label>
    <div class="ticket-meta">
      <span>Est. ${side === "buy" ? "cost" : "proceeds"}</span>
      <span id="est-total">${usd(s.price)}</span>
    </div>
    ${held ? `<div class="held-note">Holding ${held.shares} @ ${usd(held.avgCost)} avg</div>` : ""}
    <button id="place-order" class="place-btn ${side}">${side === "buy" ? "Buy" : "Sell"} ${s.symbol}</button>`;

  wireTicket();
}

function renderFutureTicket(s) {
  if (side !== "long" && side !== "short") side = "long";
  const pos = portfolio?.positions?.find((p) => p.symbol === selected);

  document.getElementById("trade-ticket").innerHTML = `
    <div class="side-toggle">
      <button class="side-btn long${side === "long" ? " active" : ""}" data-side="long">Long</button>
      <button class="side-btn short${side === "short" ? " active" : ""}" data-side="short">Short</button>
    </div>
    <label class="field">
      <span>Contracts</span>
      <input id="qty" type="number" min="1" step="1" value="1" inputmode="numeric" />
    </label>
    <div class="deriv-meta"><span>Margin required</span><b id="est-total">${usd(s.marginPerContract)}</b></div>
    <div class="deriv-meta"><span>Notional</span><b id="est-notional">${usd(s.notional)}</b></div>
    <div class="deriv-meta"><span>Leverage</span><b>${s.leverage}× · expires ${s.daysToExpiry}d</b></div>
    ${pos ? positionNote(pos) : ""}
    <button id="place-order" class="place-btn ${side}">${side === "long" ? "Long" : "Short"} ${s.symbol}</button>`;

  wireTicket();
}

function positionNote(pos) {
  const up = pos.unrealizedPL >= 0;
  return `<div class="held-note pos-note">
    <span><span class="dir-badge ${pos.direction}">${pos.direction.toUpperCase()}</span> ${pos.contracts} @ ${usd(pos.entry)}
      · <b class="${up ? "up" : "down"}">${signedUsd(pos.unrealizedPL)}</b></span>
    <button class="close-btn" id="close-pos">Close</button>
  </div>`;
}

function wireTicket() {
  document.querySelectorAll("#trade-ticket .side-btn").forEach((b) =>
    b.addEventListener("click", () => {
      side = b.dataset.side;
      renderTicket();
    }));
  document.getElementById("qty")?.addEventListener("input", refreshEst);
  document.getElementById("place-order")?.addEventListener("click", submitOrder);
  document.getElementById("close-pos")?.addEventListener("click", () => closePosition(selected));
}

function refreshEst() {
  const s = stocks[selected];
  const input = document.getElementById("qty");
  const total = document.getElementById("est-total");
  if (!s || !input || !total) return;
  const n = Math.max(0, parseInt(input.value, 10) || 0);
  if (isFuture(s)) {
    total.textContent = usd(n * s.marginPerContract);
    const notional = document.getElementById("est-notional");
    if (notional) notional.textContent = usd(n * s.notional);
  } else {
    total.textContent = usd(n * s.price);
  }
}

function selectStock(symbol) {
  if (!stocks[symbol]) return;
  if (selected !== symbol) side = isFuture(stocks[symbol]) ? "long" : "buy";
  selected = symbol;
  renderQuote();
  renderTicket();
  document.querySelectorAll("#market-list .row").forEach((r) =>
    r.classList.toggle("active", r.dataset.symbol === symbol));
}

async function submitOrder() {
  const s = stocks[selected];
  const input = document.getElementById("qty");
  const quantity = parseInt(input?.value, 10) || 0;
  if (quantity <= 0) {
    toast("Enter a valid quantity", "error");
    return;
  }
  const btn = document.getElementById("place-order");
  if (btn) btn.disabled = true;

  try {
    const endpoint = isFuture(s) ? "/api/futures/orders" : "/api/orders";
    const body = isFuture(s)
      ? { symbol: selected, direction: side, contracts: quantity }
      : { symbol: selected, side, quantity };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Order rejected", "error");
      return;
    }
    portfolio = data.portfolio;
    const o = data.order;
    if (isFuture(s)) {
      toast(`${side === "long" ? "Long" : "Short"} ${o.contracts} ${o.symbol} @ ${usd(o.price)}`, "success");
    } else {
      toast(`${o.side === "buy" ? "Bought" : "Sold"} ${o.quantity} ${o.symbol} @ ${usd(o.price)}`, "success");
    }
    await refresh();
    renderTicket();
  } catch {
    toast("Network error — order not placed", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function closePosition(symbol, contracts) {
  try {
    const body = contracts ? { symbol, contracts } : { symbol };
    const res = await fetch("/api/futures/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Close failed", "error");
      return;
    }
    portfolio = data.portfolio;
    const pnl = data.order.realizedPL;
    toast(`Closed ${data.order.contracts} ${symbol} · ${signedUsd(pnl)}`, pnl >= 0 ? "success" : "error");
    await refresh();
    if (selected === symbol) renderTicket();
  } catch {
    toast("Network error — position not closed", "error");
  }
}

// --- header, portfolio, orders --------------------------------------------
function renderHeader() {
  if (!portfolio) return;
  const up = portfolio.totalPL >= 0;
  const margin = portfolio.marginUsed > 0
    ? `<div class="hp"><span>Margin Used</span><b>${usd(portfolio.marginUsed)}</b></div>`
    : "";
  document.getElementById("header-portfolio").innerHTML = `
    <div class="hp"><span>Equity</span><b>${usd(portfolio.equity)}</b></div>
    <div class="hp"><span>Total P&L</span><b class="${up ? "up" : "down"}">${signedUsd(portfolio.totalPL)} (${pct(portfolio.totalPLPct)})</b></div>
    <div class="hp"><span>Buying Power</span><b>${usd(portfolio.cash)}</b></div>
    ${margin}`;
}

function holdingRow(h) {
  const up = h.unrealizedPL >= 0;
  return `<button class="pf-row" data-kind="spot" data-symbol="${h.symbol}">
    <span class="pf-id"><b>${h.symbol}</b><small>${h.shares} @ ${usd(h.avgCost)}</small></span>
    <span class="pf-val"><b>${usd(h.marketValue)}</b><small class="${up ? "up" : "down"}">${signedUsd(h.unrealizedPL)} (${pct(h.unrealizedPLPct)})</small></span>
  </button>`;
}

function positionRow(p) {
  const up = p.unrealizedPL >= 0;
  // Two sibling native buttons (select + close) rather than a div[role=button]
  // with a nested button: keyboard support comes for free and nesting buttons
  // is invalid HTML.
  return `<div class="pf-row pos">
    <button class="pos-select" data-symbol="${p.symbol}">
      <span class="pf-id"><b>${p.symbol}<span class="dir-badge ${p.direction}">${p.direction.toUpperCase()}</span></b><small>${p.contracts} @ ${usd(p.entry)} · ${p.leverage}×</small></span>
      <span class="pf-val"><b class="${up ? "up" : "down"}">${signedUsd(p.unrealizedPL)}</b><small class="${up ? "up" : "down"}">${pct(p.unrealizedPLPct)}</small></span>
    </button>
    <button class="close-btn" data-symbol="${p.symbol}" aria-label="Close ${p.symbol} position">✕</button>
  </div>`;
}

function renderPortfolio() {
  if (!portfolio) return;
  document.getElementById("pf-equity").textContent = usd(portfolio.equity);
  const body = document.getElementById("portfolio-body");

  const holdings = portfolio.holdings || [];
  const positions = portfolio.positions || [];
  if (!holdings.length && !positions.length) {
    body.innerHTML = `<div class="empty">No open positions. Place your first trade →</div>`;
    return;
  }

  const upUn = portfolio.unrealizedPL >= 0;
  const upRe = portfolio.realizedPL >= 0;
  let html = `
    <div class="pf-summary">
      <div><span>Invested</span><b>${usd(portfolio.costBasis)}</b></div>
      <div><span>Mkt Value</span><b>${usd(portfolio.marketValue)}</b></div>
      <div><span>Unrealized</span><b class="${upUn ? "up" : "down"}">${signedUsd(portfolio.unrealizedPL)}</b></div>
      <div><span>Realized</span><b class="${upRe ? "up" : "down"}">${signedUsd(portfolio.realizedPL)}</b></div>
    </div>`;

  if (holdings.length) {
    html += `<div class="pf-group-label">Positions</div>
      <div class="pf-list">${holdings.map(holdingRow).join("")}</div>`;
  }
  if (positions.length) {
    html += `<div class="pf-group-label">Derivatives · margin ${usd(portfolio.marginUsed)}</div>
      <div class="pf-list">${positions.map(positionRow).join("")}</div>`;
  }
  body.innerHTML = html;

  body.querySelectorAll('.pf-row[data-kind="spot"], .pos-select').forEach((r) =>
    r.addEventListener("click", () => selectStock(r.dataset.symbol)));
  body.querySelectorAll(".close-btn[data-symbol]").forEach((b) =>
    b.addEventListener("click", () => closePosition(b.dataset.symbol)));
}

function spotOrderRow(o) {
  return `<div class="order-row">
    <span class="ord-side ${o.side}">${o.side.toUpperCase()}</span>
    <span class="ord-main"><b>${o.quantity} ${o.symbol}</b><small>@ ${usd(o.price)}</small></span>
    <span class="ord-total"><b>${usd(o.total)}</b><small>${new Date(o.timestamp).toLocaleTimeString()}</small></span>
  </div>`;
}

function futureOrderRow(o) {
  const close = o.action === "close";
  const amt = close ? signedUsd(o.realizedPL) : usd(o.margin);
  const amtClass = close ? (o.realizedPL >= 0 ? "up" : "down") : "";
  return `<div class="order-row">
    <span class="ord-side ${o.direction === "long" ? "buy" : "sell"}">${close ? "CLOSE" : o.direction.toUpperCase()}</span>
    <span class="ord-main"><b>${o.contracts} ${o.symbol}</b><small>${close ? "closed @" : "@"} ${usd(o.price)}</small></span>
    <span class="ord-total"><b class="${amtClass}">${amt}</b><small>${new Date(o.timestamp).toLocaleTimeString()}</small></span>
  </div>`;
}

function renderOrders() {
  const body = document.getElementById("orders-body");
  if (!orders.length) {
    body.innerHTML = `<div class="empty">No orders yet.</div>`;
    return;
  }
  body.innerHTML = orders
    .slice(0, 25)
    .map((o) => (o.kind === "future" ? futureOrderRow(o) : spotOrderRow(o)))
    .join("");
}

// --- misc UI --------------------------------------------------------------
let toastTimer;
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3200);
}

function flashPulse() {
  const dot = document.getElementById("pulse-dot");
  dot.classList.remove("active");
  void dot.offsetWidth;
  dot.classList.add("active");
}

function setClock() {
  document.getElementById("market-clock").textContent =
    "Updated " + new Date().toLocaleTimeString();
}

// --- data loop ------------------------------------------------------------
async function refresh() {
  try {
    const [s, f, p, o] = await Promise.all([
      fetch("/api/stocks").then((r) => r.json()),
      fetch("/api/futures").then((r) => r.json()),
      fetch("/api/portfolio").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ]);

    stocks = {};
    s.forEach((q) => (stocks[q.symbol] = q));
    f.forEach((q) => (stocks[q.symbol] = q));
    portfolio = p;
    orders = o;

    renderMarketList();
    renderHeader();
    renderPortfolio();
    renderOrders();

    if (!selected) {
      selectStock(s[0]?.symbol);
    } else if (stocks[selected]) {
      renderQuote();
      refreshEst();
    }

    setClock();
    flashPulse();
  } catch (err) {
    console.error("refresh failed:", err);
  }
}

function init() {
  buildTradeShell();
  renderTabs();
  document.getElementById("search").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderMarketList();
  });
  refresh();
  setInterval(refresh, POLL_MS);
}

document.addEventListener("DOMContentLoaded", init);

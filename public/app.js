// BunTrade — front-end controller for the "BunTrade Mobile" design: a
// single scrolling page (header, account strip, markets list, trade card,
// portfolio card, order history) rather than a multi-screen app. Polls the
// simulated market every couple of seconds and re-renders.
//
// Color convention, taken directly from the design: positive/flat values
// use the default text color; only negative values get --acme-color-danger.
// There is no "success green" anywhere — Buy uses the `primary` button
// variant and Sell uses `danger`, both red-family, differentiated by shade
// rather than by a buy/sell color code. Sparklines are always the neutral
// "data" blue; the trade card's chart is always the fixed "highlight" red,
// regardless of trend — also per the design, not conditional on direction.
//
// The design itself only models plain buy/sell equities (a fictional
// 12-symbol universe with its own local random walk). Asset-class tabs and
// futures (long/short, margin) aren't part of it — they're kept here as an
// extension, styled with the same components, so the real backend's
// futures and commodities instruments stay reachable.

const POLL_MS = 2000;

const ASSET_TABS = [
  { id: "all", label: "All" },
  { id: "equity", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
  { id: "commodity", label: "Commodities" },
  { id: "future", label: "Futures" },
];

let stocks = {};          // symbol -> quote (spot and futures combined)
let portfolio = null;
let orders = [];
let selected = null;
let side = "buy";          // buy/sell for spot, long/short for futures
let qty = 1;
let searchTerm = "";
let assetFilter = "all";

// --- formatting helpers ---------------------------------------------------
const money = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => "$" + money(n);
const signedUsd = (n) => (n >= 0 ? "+" : "−") + "$" + money(Math.abs(n));
const pct = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
const downClass = (n) => (n < 0 ? " down" : "");

function compact(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

const isFuture = (s) => s && s.kind === "future";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- charts (dependency-free SVG polylines, no fill) -----------------------
function points(values, w, h, padY) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - padY - ((v - min) / range) * (h - padY * 2);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
}

const sparkSVG = (values) =>
  `<svg class="m-spark" width="56" height="20" viewBox="0 0 56 20" aria-hidden="true">
    <polyline points="${points(values, 56, 20, 3)}" fill="none" stroke="var(--acme-color-data)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;

const chartSVG = (values) =>
  `<svg class="trade-chart" viewBox="0 0 336 110" aria-hidden="true">
    <polyline points="${points(values, 336, 110, 6)}" fill="none" stroke="var(--acme-color-data-highlight)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;

// --- toast ------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2800);
}

// --- header / account strip -------------------------------------------
function renderHeader() {
  document.getElementById("updated-label").textContent =
    "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (!portfolio) return;
  const margin = portfolio.marginUsed > 0
    ? `<div><div class="as-label">Margin used</div><div class="as-value num">${usd(portfolio.marginUsed)}</div></div>`
    : "";
  document.getElementById("account-strip").innerHTML = `
    <div><div class="as-label">Equity</div><div class="as-value num">${usd(portfolio.equity)}</div></div>
    <div><div class="as-label">Total P&amp;L</div><div class="as-value num${downClass(portfolio.totalPL)}">${signedUsd(portfolio.totalPL)} (${pct(portfolio.totalPLPct)})</div></div>
    <div><div class="as-label">Buying power</div><div class="as-value num">${usd(portfolio.cash)}</div></div>
    ${margin}`;
}

// --- asset tabs + market list -------------------------------------------
function renderTabs() {
  const el = document.getElementById("asset-tabs");
  el.innerHTML = ASSET_TABS.map((t) =>
    `<button class="acme-tab" role="tab" data-filter="${t.id}" aria-selected="${t.id === assetFilter}">${t.label}</button>`
  ).join("");
  el.querySelectorAll(".acme-tab").forEach((b) =>
    b.addEventListener("click", () => {
      assetFilter = b.dataset.filter;
      renderTabs();
      renderMarketList();
    }));
}

function visibleStocks() {
  const term = searchTerm.trim().toUpperCase();
  return Object.values(stocks)
    .filter((s) => assetFilter === "all" || s.assetClass === assetFilter)
    .filter((s) => !term || s.symbol.includes(term) || s.name.toUpperCase().includes(term))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function rowHTML(s) {
  const tag = isFuture(s) ? `<span class="row-tag">${s.leverage}×</span>` : "";
  return `<button class="m-row${s.symbol === selected ? " active" : ""}" data-symbol="${s.symbol}">
    <span class="m-id">
      <span class="m-sym">${s.symbol}${tag}</span>
      <span class="m-name">${esc(s.name)}</span>
    </span>
    <span class="m-quote">
      <div class="m-price num">${usd(s.price)}</div>
      <div class="m-chg num${downClass(s.changePct)}">${pct(s.changePct)}</div>
    </span>
    ${sparkSVG(s.spark)}
  </button>`;
}

function renderMarketList() {
  const list = document.getElementById("market-list");
  const items = visibleStocks();
  list.innerHTML = items.map(rowHTML).join("") ||
    `<div class="empty-note empty-note--list">No matches.</div>`;
  list.querySelectorAll(".m-row").forEach((r) =>
    r.addEventListener("click", () => selectStock(r.dataset.symbol)));
}

// --- trade card ------------------------------------------------------
function renderTradeCard() {
  const s = stocks[selected];
  const card = document.getElementById("trade-card");
  if (!s) { card.innerHTML = `<div class="empty-note">Loading…</div>`; return; }

  if (side !== "buy" && side !== "sell" && !isFuture(s)) side = "buy";
  if (side !== "long" && side !== "short" && isFuture(s)) side = "long";

  const stats = isFuture(s)
    ? [["Notional", "$" + compact(s.notional)], ["Leverage", s.leverage + "×"], ["Margin", "$" + compact(s.marginPerContract)], ["Expiry", s.daysToExpiry + "d"]]
    : [["Open", usd(s.open)], ["High", usd(s.dayHigh)], ["Low", usd(s.dayLow)], ["Volume", compact(s.volume)]];
  const statsHTML = stats.map(([label, value]) =>
    `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value num">${value}</div></div>`
  ).join("");

  const buyLabel = isFuture(s) ? "Long" : "Buy";
  const sellLabel = isFuture(s) ? "Short" : "Sell";
  const buySide = isFuture(s) ? "long" : "buy";
  const sellSide = isFuture(s) ? "short" : "sell";
  const isBuy = side === buySide;

  const unit = isFuture(s) ? "Contracts" : "Quantity";
  const estimate = isFuture(s) ? qty * s.marginPerContract : qty * s.price;
  const estCaption = isFuture(s) ? "Margin required" : (isBuy ? "Est. cost" : "Est. proceeds");

  const held = isFuture(s)
    ? portfolio?.positions?.find((p) => p.symbol === selected)
    : portfolio?.holdings?.find((h) => h.symbol === selected);
  const heldNote = isFuture(s)
    ? (held ? `Holding ${held.direction} ${held.contracts} @ ${usd(held.entry)}` : null)
    : (held ? `Holding ${held.shares} @ ${usd(held.avgCost)} avg` : null);

  card.innerHTML = `
    <div class="th-row">
      <div>
        <div class="th-sym"><span class="mono">${s.symbol}</span> <span class="th-name">${esc(s.name)}</span></div>
        <div class="th-sector">${esc(s.sector)}</div>
      </div>
      <div class="th-price">
        <div class="th-price-val num">${usd(s.price)}</div>
        <div class="th-chg num${downClass(s.changePct)}">${s.changePct >= 0 ? "▲" : "▼"} ${money(Math.abs(s.change))} (${pct(s.changePct)})</div>
      </div>
    </div>

    ${chartSVG(s.spark)}

    <div class="stat-grid">${statsHTML}</div>

    <div class="acme-tabs full-width" role="tablist">
      <button class="acme-tab" data-side="${buySide}" aria-selected="${isBuy}">${buyLabel}</button>
      <button class="acme-tab" data-side="${sellSide}" aria-selected="${!isBuy}">${sellLabel}</button>
    </div>

    <label class="acme-field">
      <span class="acme-label">${unit}</span>
      <input id="qty" class="acme-input" type="number" min="1" step="1" value="${qty}" inputmode="numeric" />
    </label>

    <div class="est-row">
      <span class="est-caption">${estCaption}</span>
      <span class="est-value num">${usd(estimate)}</span>
    </div>

    ${heldNote ? `<div class="held-note">${esc(heldNote)}</div>` : ""}

    <button id="place-order" class="acme-btn place-btn ${isBuy ? "acme-btn--primary" : "acme-btn--danger"}">${isBuy ? buyLabel : sellLabel} ${s.symbol}</button>`;

  card.querySelectorAll("[data-side]").forEach((b) =>
    b.addEventListener("click", () => { side = b.dataset.side; renderTradeCard(); }));
  card.querySelector("#qty").addEventListener("input", (e) => {
    qty = Math.max(0, parseInt(e.target.value, 10) || 0);
    renderTradeCard();
  });
  card.querySelector("#place-order").addEventListener("click", submitOrder);
}

function selectStock(symbol) {
  if (!stocks[symbol]) return;
  if (selected !== symbol) { side = isFuture(stocks[symbol]) ? "long" : "buy"; qty = 1; }
  selected = symbol;
  renderMarketList();
  renderTradeCard();
}

async function submitOrder() {
  const s = stocks[selected];
  if (!s || qty <= 0) { toast("Enter a valid quantity"); return; }
  const btn = document.getElementById("place-order");
  if (btn) btn.disabled = true;

  try {
    const endpoint = isFuture(s) ? "/api/futures/orders" : "/api/orders";
    const body = isFuture(s)
      ? { symbol: selected, direction: side, contracts: qty }
      : { symbol: selected, side, quantity: qty };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || "Order rejected"); return; }
    portfolio = data.portfolio;
    const o = data.order;
    toast(isFuture(s)
      ? `${side === "long" ? "Long" : "Short"} ${o.contracts} ${o.symbol} @ ${usd(o.price)}`
      : `${o.side === "buy" ? "Bought" : "Sold"} ${o.quantity} ${o.symbol} @ ${usd(o.price)}`);
    await refresh();
  } catch {
    toast("Network error — order not placed");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function closePosition(symbol) {
  try {
    const res = await fetch("/api/futures/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || "Close failed"); return; }
    portfolio = data.portfolio;
    toast(`Closed ${data.order.contracts} ${symbol} · ${signedUsd(data.order.realizedPL)}`);
    await refresh();
  } catch {
    toast("Network error — position not closed");
  }
}

// --- portfolio ------------------------------------------------------
function holdingRow(h) {
  return `<button class="pf-row" data-symbol="${h.symbol}">
    <span><span class="pf-sym">${h.symbol}</span><span class="pf-sub" style="display:block">${h.shares} @ ${usd(h.avgCost)}</span></span>
    <span class="pf-val"><span class="pf-value num" style="display:block">${usd(h.marketValue)}</span><span class="pf-pl num${downClass(h.unrealizedPL)}" style="display:block">${signedUsd(h.unrealizedPL)} (${pct(h.unrealizedPLPct)})</span></span>
  </button>`;
}

function positionRow(p) {
  return `<div class="pos-row">
    <button class="pos-select" data-symbol="${p.symbol}">
      <span><span class="pf-sym">${p.symbol}<span class="dir-badge">${p.direction.toUpperCase()}</span></span><span class="pf-sub" style="display:block">${p.contracts} @ ${usd(p.entry)} · ${p.leverage}×</span></span>
      <span class="pf-val"><span class="pf-value num${downClass(p.unrealizedPL)}" style="display:block">${signedUsd(p.unrealizedPL)}</span><span class="pf-pl num${downClass(p.unrealizedPL)}" style="display:block">${pct(p.unrealizedPLPct)}</span></span>
    </button>
    <button class="pos-close" data-symbol="${p.symbol}">Close</button>
  </div>`;
}

function renderPortfolio() {
  if (!portfolio) return;
  document.getElementById("pf-equity").textContent = usd(portfolio.equity);
  const body = document.getElementById("portfolio-body");

  const holdings = portfolio.holdings || [];
  const positions = portfolio.positions || [];
  if (!holdings.length && !positions.length) {
    body.innerHTML = `<div class="empty-note">No open positions. Place your first trade above.</div>`;
    return;
  }

  let html = `
    <div class="pf-stat-grid">
      <div class="pf-stat-tile"><div class="tile-label">Invested</div><div class="tile-value num">${usd(portfolio.costBasis)}</div></div>
      <div class="pf-stat-tile"><div class="tile-label">Mkt value</div><div class="tile-value num">${usd(portfolio.marketValue)}</div></div>
      <div class="pf-stat-tile"><div class="tile-label">Unrealized</div><div class="tile-value num${downClass(portfolio.unrealizedPL)}">${signedUsd(portfolio.unrealizedPL)}</div></div>
      <div class="pf-stat-tile"><div class="tile-label">Realized</div><div class="tile-value num${downClass(portfolio.realizedPL)}">${signedUsd(portfolio.realizedPL)}</div></div>
    </div>`;

  if (holdings.length) html += `<div class="pf-list">${holdings.map(holdingRow).join("")}</div>`;
  if (positions.length) html += `
    <div class="pf-group-label">Derivatives · margin ${usd(portfolio.marginUsed)}</div>
    <div class="pf-list">${positions.map(positionRow).join("")}</div>`;
  body.innerHTML = html;

  body.querySelectorAll(".pf-row, .pos-select").forEach((r) =>
    r.addEventListener("click", () => selectStock(r.dataset.symbol)));
  body.querySelectorAll(".pos-close").forEach((b) =>
    b.addEventListener("click", () => closePosition(b.dataset.symbol)));
}

// --- order history ------------------------------------------------------
function spotOrderRow(o) {
  const arrow = o.side === "buy" ? "▲" : "▼";
  return `<div class="order-row">
    <span class="acme-badge">${arrow} ${o.side.toUpperCase()}</span>
    <span class="ord-main"><div class="ord-main-line">${o.quantity} ${o.symbol}</div><div class="ord-sub">@ ${usd(o.price)}</div></span>
    <span class="ord-total"><div class="ord-total-value num">${usd(o.total)}</div><div class="ord-time">${new Date(o.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></span>
  </div>`;
}

function futureOrderRow(o) {
  const close = o.action === "close";
  const arrow = close ? "■" : (o.direction === "long" ? "▲" : "▼");
  const label = close ? "CLOSE" : o.direction.toUpperCase();
  const amt = close ? signedUsd(o.realizedPL) : usd(o.margin);
  return `<div class="order-row">
    <span class="acme-badge">${arrow} ${label}</span>
    <span class="ord-main"><div class="ord-main-line">${o.contracts} ${o.symbol}</div><div class="ord-sub">${close ? "closed @" : "@"} ${usd(o.price)}</div></span>
    <span class="ord-total"><div class="ord-total-value num">${amt}</div><div class="ord-time">${new Date(o.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></span>
  </div>`;
}

function renderOrders() {
  const body = document.getElementById("orders-body");
  if (!orders.length) { body.innerHTML = `<div class="empty-note">No orders yet.</div>`; return; }
  body.innerHTML = `<div class="orders-list">${orders.slice(0, 25)
    .map((o) => (o.kind === "future" ? futureOrderRow(o) : spotOrderRow(o)))
    .join("")}</div>`;
}

// --- data loop ------------------------------------------------------
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

    renderHeader();
    renderMarketList();
    renderPortfolio();
    renderOrders();

    if (!selected) selectStock(s[0]?.symbol);
    else renderTradeCard();
  } catch (err) {
    console.error("refresh failed:", err);
  }
}

function init() {
  renderTabs();
  document.getElementById("search").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderMarketList();
  });
  refresh();
  setInterval(refresh, POLL_MS);
}

document.addEventListener("DOMContentLoaded", init);

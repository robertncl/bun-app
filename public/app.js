// BunTrade — front-end controller for the "Website Redesign" dashboard: app
// bar, account summary, a markets · chart · ticket row, then open positions
// and order history tables. Polls the simulated market every couple of
// seconds and re-renders.
//
// Color convention (ACME design language): gains and flat values use muted
// ink, only losses get --acme-color-danger — there is no "success green".
// Clay marks the one primary action (the place-order button) and
// orientation: the current nav link, the selected market row, the selected
// side. Sparklines and the price line are neutral; the last-price dot and
// label use --acme-color-data-highlight as the chart's single takeaway.
//
// The ticket is rendered once per symbol/side and then updated in place, so
// typing a quantity never loses focus to the 2-second refresh.

const POLL_MS = 2000;

const ASSET_TABS = [
  { id: "all", label: "All" },
  { id: "equity", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
  { id: "commodity", label: "Commodities" },
  { id: "future", label: "Futures" },
];

const CLASS_LABEL = { equity: "Stock", crypto: "Crypto", commodity: "Commodity", future: "Futures" };

let stocks = {};          // symbol -> quote (spot and futures combined)
let portfolio = null;
let orders = [];
let selected = null;
let side = "buy";          // buy/sell for spot, long/short for futures
let qty = 1;
let searchTerm = "";
let assetFilter = "all";
let ticketKey = "";        // symbol|side the ticket's markup was built for

// --- formatting helpers ---------------------------------------------------
const money = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => "$" + money(n);
const signed = (n) => (n >= 0 ? "+" : "−") + money(Math.abs(n));
const signedUsd = (n) => (n >= 0 ? "+" : "−") + "$" + money(Math.abs(n));
const pct = (n) => (n >= 0 ? "+" : "−") + Math.abs(Number(n)).toFixed(2) + "%";
const downClass = (n) => (n < 0 ? " down" : "");
const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function compact(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

const isFuture = (s) => s && s.kind === "future";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

// --- icons (inline, 24px grid, 2px round stroke, currentColor) -------------
const ICON_INFO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
const ICON_CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

// --- charts (dependency-free SVG polylines, no fill) -----------------------
function scale(values, w, h, padY, extra = []) {
  const all = values.concat(extra);
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  return (v) => h - padY - ((v - min) / range) * (h - padY * 2);
}

function points(values, w, h, padY) {
  if (!values || values.length < 2) return "";
  const y = scale(values, w, h, padY);
  return values.map((v, i) => ((i / (values.length - 1)) * w).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
}

const sparkSVG = (values) =>
  `<svg class="bt-spark" width="64" height="24" viewBox="0 0 64 24" aria-hidden="true">
    <polyline points="${points(values, 64, 24, 3)}" fill="none" stroke="var(--acme-color-data)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;

function chartSVG(s) {
  const values = s.spark || [];
  if (values.length < 2) return "";
  const W = 600, H = 250, PAD = 30;
  const y = scale(values, W, H, PAD, [s.open]);
  const line = values.map((v, i) => ((i / (values.length - 1)) * W).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
  const lastY = y(values[values.length - 1]);
  const openY = y(s.open);
  const label = `${s.symbol} price over the last ${values.length} ticks, from ${money(values[0])} to ${money(s.price)}`;
  return `<svg viewBox="0 0 690 260" role="img" aria-label="${esc(label)}">
    <line x1="0" y1="40" x2="690" y2="40" stroke="var(--acme-color-border)"/>
    <line x1="0" y1="110" x2="690" y2="110" stroke="var(--acme-color-border)"/>
    <line x1="0" y1="180" x2="690" y2="180" stroke="var(--acme-color-border)"/>
    <line x1="0" y1="250" x2="690" y2="250" stroke="var(--acme-color-border-strong)"/>
    <line x1="0" y1="${openY.toFixed(1)}" x2="${W}" y2="${openY.toFixed(1)}" stroke="var(--acme-color-data)" stroke-dasharray="4 4"/>
    <text x="4" y="${(openY - 6).toFixed(1)}" font-size="11" fill="var(--acme-color-text-subtle)" font-family="var(--acme-font-sans)">Open ${money(s.open)}</text>
    <polyline points="${line}" fill="none" stroke="var(--acme-color-text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${W}" cy="${lastY.toFixed(1)}" r="4" fill="var(--acme-color-data-highlight)"/>
    <text x="${W + 8}" y="${(lastY + 4).toFixed(1)}" font-size="12" font-weight="600" fill="var(--acme-color-data-highlight)" font-family="var(--acme-font-sans)">${money(s.price)}</text>
  </svg>`;
}

// --- toast ------------------------------------------------------------
let toastTimer;
function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "bt-toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "bt-toast"), 2800);
}

// --- app bar + account summary ------------------------------------------
function renderHeader() {
  $("updated-label").textContent = "Prices update every 2s · Updated " + time(Date.now());
  if (!portfolio) return;

  const openPL = portfolio.unrealizedPL + portfolio.derivativesPL;
  const stat = (label, value, cls = "") =>
    `<div class="bt-stat"><div class="label-caps">${label}</div><div class="bt-stat__value num${cls}">${value}</div></div>`;

  $("trade").innerHTML = `
    <div class="bt-stat bt-stat--lead">
      <div class="label-caps">Equity</div>
      <div class="bt-stat__value num">${usd(portfolio.equity)}</div>
      <div class="bt-stat__sub num${downClass(portfolio.totalPL)}">${signedUsd(portfolio.totalPL)} (${pct(portfolio.totalPLPct)}) since start</div>
    </div>
    ${stat("Cash", usd(portfolio.cash))}
    ${stat("Spot holdings", usd(portfolio.marketValue))}
    ${stat("Margin used", usd(portfolio.marginUsed))}
    ${stat("Open P&amp;L", signedUsd(openPL), downClass(openPL))}
    ${stat("Realized P&amp;L", signedUsd(portfolio.realizedPL), downClass(portfolio.realizedPL))}`;
}

// --- asset tabs + market list -------------------------------------------
function renderTabs() {
  const el = $("asset-tabs");
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
  const tag = isFuture(s) ? `<span class="acme-badge bt-tag">${s.leverage}×</span>` : "";
  const sel = s.symbol === selected;
  return `<tr data-symbol="${s.symbol}" aria-selected="${sel}">
    <td>
      <button class="bt-row-btn" data-symbol="${s.symbol}"${sel ? ' aria-current="true"' : ""}>
        <span class="bt-sym-line"><span class="mono">${s.symbol}</span>${tag}</span>
        <span class="bt-row-name">${esc(s.name)}</span>
      </button>
    </td>
    <td class="bt-col-spark">${sparkSVG(s.spark)}</td>
    <td class="acme-table__num">
      <div class="bt-price">${money(s.price)}</div>
      <div class="bt-chg${downClass(s.changePct)}">${pct(s.changePct)}</div>
    </td>
  </tr>`;
}

function renderMarketList() {
  const items = visibleStocks();
  const total = Object.keys(stocks).length;
  $("market-count").textContent = items.length === total ? `${total} instruments` : `${items.length} of ${total}`;
  const list = $("market-list");
  list.innerHTML = items.map(rowHTML).join("") ||
    `<tr><td colspan="3" class="bt-empty">No markets match “${esc(searchTerm.trim())}”.</td></tr>`;
  list.querySelectorAll("tr[data-symbol]").forEach((r) =>
    r.addEventListener("click", () => selectStock(r.dataset.symbol)));
}

// --- chart card ------------------------------------------------------
function renderChart() {
  const s = stocks[selected];
  const card = $("chart-card");
  if (!s) { card.innerHTML = `<h2 id="chart-h" class="bt-card-title">Loading markets…</h2>`; return; }

  const held = isFuture(s)
    ? portfolio?.positions?.find((p) => p.symbol === s.symbol)
    : portfolio?.holdings?.find((h) => h.symbol === s.symbol);
  const holdText = !held ? "None"
    : isFuture(s) ? `${held.contracts} ${held.direction}` : `${held.shares} @ ${money(held.avgCost)}`;

  const stats = isFuture(s)
    ? [["Notional", usd(s.notional)], ["Margin / contract", usd(s.marginPerContract)], ["Leverage", s.leverage + "×"],
       ["Expires in", s.daysToExpiry + " days"], ["You hold", holdText]]
    : [["Open", money(s.open)], ["Day high", money(s.dayHigh)], ["Day low", money(s.dayLow)],
       ["Volume", compact(s.volume)], ["You hold", holdText]];

  card.innerHTML = `
    <div class="bt-chart__head">
      <div>
        <div class="bt-chart__sym">
          <span class="mono">${s.symbol}</span>
          <span class="acme-badge">${CLASS_LABEL[s.assetClass] || ""} · ${esc(s.sector.replace(/ Future$/, ""))}</span>
        </div>
        <h2 id="chart-h" class="bt-chart__name">${esc(s.name)}</h2>
      </div>
      <div class="bt-chart__quote">
        <div class="bt-chart__price num">${isFuture(s) ? money(s.price) : usd(s.price)}</div>
        <div class="bt-chart__chg num${downClass(s.change)}">${signed(s.change)} (${pct(s.changePct)}) today</div>
      </div>
    </div>
    <figure class="bt-figure">
      ${chartSVG(s)}
      <figcaption><span>${Math.round((s.spark.length * POLL_MS) / 1000)}s ago</span><span>Live · last ${s.spark.length} ticks</span><span>Now</span></figcaption>
    </figure>
    <dl class="bt-stats">
      ${stats.map(([k, v]) => `<div><dt class="label-caps">${k}</dt><dd>${v}</dd></div>`).join("")}
    </dl>`;
}

// --- ticket ----------------------------------------------------------
function ticketSides(s) {
  return isFuture(s) ? ["long", "short"] : ["buy", "sell"];
}

function maxQty(s) {
  if (!portfolio) return 0;
  if (isFuture(s)) return Math.floor(portfolio.cash / s.marginPerContract);
  if (side === "sell") return portfolio.holdings?.find((h) => h.symbol === s.symbol)?.shares || 0;
  return Math.floor(portfolio.cash / s.price);
}

function buildTicket() {
  const s = stocks[selected];
  const card = $("trade-card");
  if (!s) { card.innerHTML = `<h2 id="ticket-h" class="bt-card-title">Place order</h2>`; ticketKey = ""; return; }

  const [a, b] = ticketSides(s);
  const fut = isFuture(s);
  const quick = fut ? [1, 2, 5] : [1, 10, 50];

  card.innerHTML = `
    <div>
      <h2 id="ticket-h" class="bt-card-title">${fut ? "Open a position" : "Place order"}</h2>
      <p class="bt-ticket__sub">${fut
        ? `Cash-settled, on ${Math.round(s.marginRate * 100)}% margin. Long or short.`
        : "Spot · fills instantly at the live price"}</p>
    </div>
    <div class="bt-segment" role="group" aria-label="${fut ? "Direction" : "Side"}">
      <button type="button" data-side="${a}" aria-pressed="${side === a}">${fut ? "Long" : "Buy"}</button>
      <button type="button" data-side="${b}" aria-pressed="${side === b}">${fut ? "Short" : "Sell"}</button>
    </div>
    <div class="acme-field">
      <label class="acme-label" for="qty">${fut ? "Contracts" : "Quantity"}</label>
      <input id="qty" class="acme-input" type="number" min="1" step="1" value="${qty}" inputmode="numeric" />
      <span class="acme-help">${fut ? `Each contract is ${s.multiplier.toLocaleString("en-US")} ${esc(s.unit)}.` : "Whole units only."}</span>
    </div>
    <div class="bt-quick">
      ${quick.map((n) => `<button type="button" class="acme-btn acme-btn--secondary acme-btn--sm" data-qty="${n}">${n}</button>`).join("")}
      <button type="button" class="acme-btn acme-btn--secondary acme-btn--sm" data-qty="max">Max</button>
    </div>
    <dl class="bt-estimate" id="ticket-est"></dl>
    <div class="bt-held" id="ticket-held" hidden></div>
    <button type="button" id="place-order" class="acme-btn acme-btn--primary acme-btn--lg bt-place"></button>
    <p class="bt-fineprint">Paper money only. Nothing here touches a real brokerage.</p>`;

  card.querySelectorAll("[data-side]").forEach((btn) =>
    btn.addEventListener("click", () => { side = btn.dataset.side; renderTicket(); }));
  card.querySelectorAll("[data-qty]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const cur = stocks[selected];
      qty = btn.dataset.qty === "max" ? maxQty(cur) : Number(btn.dataset.qty);
      $("qty").value = qty;
      updateTicket();
    }));
  $("qty").addEventListener("input", (e) => {
    qty = Math.max(0, parseInt(e.target.value, 10) || 0);
    updateTicket();
  });
  $("place-order").addEventListener("click", submitOrder);
  ticketKey = selected + "|" + side;
}

function updateTicket() {
  const s = stocks[selected];
  if (!s) return;
  const row = (k, v, cls = "") => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
  const est = $("ticket-est");
  const heldEl = $("ticket-held");
  const btn = $("place-order");
  const cash = portfolio ? portfolio.cash : 0;

  if (isFuture(s)) {
    const notional = qty * s.notional;
    const margin = qty * s.marginPerContract;
    est.innerHTML =
      row("Notional", usd(notional)) +
      `<div><dt>Margin locked</dt><dd class="bt-strong">${usd(margin)}</dd></div>` +
      row("Leverage", s.leverage + "×") +
      row("Each $1 move", usd(qty * s.multiplier), "bt-rule");

    const pos = portfolio?.positions?.find((p) => p.symbol === s.symbol);
    if (pos) {
      const same = pos.direction === side;
      heldEl.innerHTML = `${ICON_INFO}<span>You hold ${pos.contracts} ${s.symbol} ${pos.direction}. ${same
        ? "This adds to that position."
        : "This reduces it, or flips it if you trade more than you hold."}</span>`;
      heldEl.hidden = false;
    } else heldEl.hidden = true;

    btn.textContent = `Go ${side} ${qty} ${s.symbol}`;
  } else {
    const total = qty * s.price;
    const holding = portfolio?.holdings?.find((h) => h.symbol === s.symbol);
    est.innerHTML = row("Price", usd(s.price)) + (side === "buy"
      ? `<div><dt>Estimated cost</dt><dd class="bt-strong">${usd(total)}</dd></div>` +
        row("Cash after", `<span class="${cash - total < 0 ? "down" : ""}">${cash - total < 0 ? "−" : ""}${usd(Math.abs(cash - total))}</span>`, "bt-rule")
      : `<div><dt>Estimated proceeds</dt><dd class="bt-strong">${usd(total)}</dd></div>` +
        row("You hold", `${holding ? holding.shares : 0} ${s.symbol}`, "bt-rule"));

    if (holding && side === "buy") {
      heldEl.innerHTML = `${ICON_INFO}<span>You hold ${holding.shares} ${s.symbol} at ${usd(holding.avgCost)} average.</span>`;
      heldEl.hidden = false;
    } else heldEl.hidden = true;

    btn.textContent = `${side === "buy" ? "Buy" : "Sell"} ${qty} ${s.symbol}`;
  }
  btn.disabled = qty <= 0;
}

function renderTicket() {
  const s = stocks[selected];
  if (s && !ticketSides(s).includes(side)) side = ticketSides(s)[0];
  if (!s || ticketKey !== selected + "|" + side) buildTicket();
  updateTicket();
}

function selectStock(symbol) {
  if (!stocks[symbol]) return;
  if (selected !== symbol) { side = ticketSides(stocks[symbol])[0]; qty = 1; }
  selected = symbol;
  renderMarketList();
  renderChart();
  renderTicket();
}

// --- trading ---------------------------------------------------------
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, data: await res.json() };
}

async function submitOrder() {
  const s = stocks[selected];
  if (!s || qty <= 0) { toast("Enter a quantity of 1 or more.", true); return; }
  const btn = $("place-order");
  if (btn) btn.disabled = true;

  try {
    const { res, data } = isFuture(s)
      ? await postJSON("/api/futures/orders", { symbol: selected, direction: side, contracts: qty })
      : await postJSON("/api/orders", { symbol: selected, side, quantity: qty });
    if (!res.ok) { toast(data.error || "Order rejected.", true); return; }
    portfolio = data.portfolio;
    const o = data.order;
    toast(isFuture(s)
      ? `${side === "long" ? "Long" : "Short"} ${o.contracts} ${o.symbol} at ${usd(o.price)}. Filled.`
      : `${o.side === "buy" ? "Bought" : "Sold"} ${o.quantity} ${o.symbol} at ${usd(o.price)}. Filled.`);
    await refresh();
  } catch {
    toast("Network error. The order wasn't placed — try again.", true);
  } finally {
    if (btn) btn.disabled = qty <= 0;
  }
}

async function closePosition(symbol, kind) {
  try {
    if (kind === "future") {
      const { res, data } = await postJSON("/api/futures/close", { symbol });
      if (!res.ok) { toast(data.error || "Close failed.", true); return; }
      portfolio = data.portfolio;
      toast(`Closed ${data.order.contracts} ${symbol} · ${signedUsd(data.order.realizedPL)}`);
    } else {
      const h = portfolio?.holdings?.find((x) => x.symbol === symbol);
      if (!h) return;
      const { res, data } = await postJSON("/api/orders", { symbol, side: "sell", quantity: h.shares });
      if (!res.ok) { toast(data.error || "Sell failed.", true); return; }
      portfolio = data.portfolio;
      toast(`Sold ${h.shares} ${symbol} at ${usd(data.order.price)}. Filled.`);
    }
    await refresh();
  } catch {
    toast("Network error. The position is still open — try again.", true);
  }
}

// --- positions table -------------------------------------------------
function renderPortfolio() {
  if (!portfolio) return;
  const body = $("portfolio-body");
  const holdings = portfolio.holdings || [];
  const positions = portfolio.positions || [];
  const n = holdings.length + positions.length;
  $("pf-meta").textContent = n ? `${n} position${n === 1 ? "" : "s"} · marked to market` : "";

  if (!n) {
    body.innerHTML = `<p class="bt-empty-card">No open positions. Place your first trade above.</p>`;
    return;
  }

  const row = (r) => `<tr>
    <td><button class="bt-row-btn" data-symbol="${r.symbol}"><span class="mono">${r.symbol}</span> <span class="bt-sub">${esc(r.name)}</span></button></td>
    <td><span class="acme-badge">${r.side}</span></td>
    <td class="acme-table__num">${r.qty}</td>
    <td class="acme-table__num">${money(r.entry)}</td>
    <td class="acme-table__num">${money(r.mark)}</td>
    <td class="acme-table__num">${r.value}</td>
    <td class="acme-table__num">${r.lev}</td>
    <td class="acme-table__num bt-pl${downClass(r.pl)}">${signedUsd(r.pl)}</td>
    <td class="bt-actions"><button type="button" class="acme-btn acme-btn--ghost acme-btn--sm" data-close="${r.symbol}" data-kind="${r.kind}">Close</button></td>
  </tr>`;

  const rows = [
    ...positions.map((p) => ({
      kind: "future", symbol: p.symbol, name: p.name, side: p.direction === "long" ? "Long" : "Short",
      qty: p.contracts, entry: p.entry, mark: p.mark, value: `${usd(p.margin)} margin`,
      lev: p.leverage ? p.leverage + "×" : "—", pl: p.unrealizedPL,
    })),
    ...holdings.map((h) => ({
      kind: "spot", symbol: h.symbol, name: h.name, side: "Long",
      qty: h.shares, entry: h.avgCost, mark: h.price, value: usd(h.marketValue), lev: "—", pl: h.unrealizedPL,
    })),
  ];

  body.innerHTML = `<div class="bt-table-scroll"><table class="acme-table">
    <thead><tr>
      <th scope="col">Instrument</th><th scope="col">Side</th>
      <th scope="col" class="acme-table__num">Qty</th><th scope="col" class="acme-table__num">Entry</th>
      <th scope="col" class="acme-table__num">Mark</th><th scope="col" class="acme-table__num">Value / margin</th>
      <th scope="col" class="acme-table__num">Leverage</th><th scope="col" class="acme-table__num">Open P&amp;L</th>
      <th scope="col"><span class="sr-only">Actions</span></th>
    </tr></thead>
    <tbody>${rows.map(row).join("")}</tbody>
  </table></div>`;

  body.querySelectorAll(".bt-row-btn").forEach((b) =>
    b.addEventListener("click", () => selectStock(b.dataset.symbol)));
  body.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closePosition(b.dataset.close, b.dataset.kind)));
}

// --- order history ------------------------------------------------------
function orderRow(o) {
  let label, total;
  if (o.kind === "future") {
    label = o.action === "close" ? "Close" : (o.direction === "long" ? "Long" : "Short");
    total = o.action === "close"
      ? `<span class="${downClass(o.realizedPL).trim()}">${signedUsd(o.realizedPL)} realized</span>`
      : `${usd(o.margin)} margin`;
  } else {
    label = o.side === "buy" ? "Buy" : "Sell";
    total = usd(o.total);
  }
  const q = o.kind === "future" ? o.contracts : o.quantity;
  return `<tr>
    <td class="bt-time">${time(o.timestamp)}</td>
    <td><strong>${label}</strong> <span class="mono">${o.symbol}</span></td>
    <td class="acme-table__num">${q}</td>
    <td class="acme-table__num">${money(o.price)}</td>
    <td class="acme-table__num">${total}</td>
    <td><span class="acme-badge acme-badge--success">${ICON_CHECK}Filled</span></td>
  </tr>`;
}

function renderOrders() {
  const body = $("orders-body");
  $("orders-meta").textContent = orders.length
    ? (orders.length > 25 ? `Latest 25 of ${orders.length} orders` : `${orders.length} order${orders.length === 1 ? "" : "s"}`)
    : "";
  if (!orders.length) { body.innerHTML = `<p class="bt-empty-card">No orders yet.</p>`; return; }
  body.innerHTML = `<div class="bt-table-scroll"><table class="acme-table">
    <thead><tr>
      <th scope="col">Time</th><th scope="col">Order</th>
      <th scope="col" class="acme-table__num">Qty</th><th scope="col" class="acme-table__num">Fill price</th>
      <th scope="col" class="acme-table__num">Total</th><th scope="col">Status</th>
    </tr></thead>
    <tbody>${orders.slice(0, 25).map(orderRow).join("")}</tbody>
  </table></div>`;
}

// --- nav: mark the section in view as current -----------------------------
function syncNav() {
  const links = [...document.querySelectorAll(".bt-nav a")];
  let current = links[0];
  for (const a of links) {
    const target = document.querySelector(a.getAttribute("href"));
    if (target && target.getBoundingClientRect().top <= 120) current = a;
  }
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) current = links[links.length - 1];
  links.forEach((a) => (a === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
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

    const firstLoad = !Object.keys(stocks).length;
    stocks = {};
    s.forEach((q) => (stocks[q.symbol] = q));
    f.forEach((q) => (stocks[q.symbol] = q));
    portfolio = p;
    orders = o;

    if (firstLoad) renderTabs();
    renderHeader();
    renderPortfolio();
    renderOrders();

    if (!selected) selectStock(s[0]?.symbol);
    else { renderMarketList(); renderChart(); renderTicket(); }
  } catch (err) {
    console.error("refresh failed:", err);
    $("updated-label").textContent = "Can't reach the server. Retrying…";
  }
}

function init() {
  document.documentElement.dataset.theme =
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  renderTabs();
  $("search").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderMarketList();
  });
  window.addEventListener("scroll", syncNav, { passive: true });
  refresh();
  setInterval(refresh, POLL_MS);
}

document.addEventListener("DOMContentLoaded", init);

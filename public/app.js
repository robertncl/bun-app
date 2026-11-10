// BunTrade — front-end controller for the "Website Redesign" dashboard: app
// bar, account summary, a markets · chart · ticket row, then open positions
// and order history tables. Polls the simulated market every couple of
// seconds and re-renders.
//
// Color convention (ACME design language v5): every colour has one job.
// Ink (Graphite 900) fills the one primary action, the place-order button.
// Blue is interaction: the selected market row, the selected side, the chart's
// price line and last-price label (--acme-color-data-highlight). Gains read in
// --acme-color-success-soft-text, losses in --acme-color-danger-soft-text, and
// every P&L carries its sign, so direction never rests on hue alone. Red is
// never put on a control unless the action is destructive. Sparklines are
// neutral Graphite (--acme-color-data).
//
// The ticket is rendered once per symbol/side and then updated in place, so
// typing a quantity never loses focus to the 2-second refresh.
//
// All copy goes through t() and all numbers through fmt (see i18n.js), so the
// language and display currency can change at any time: rerenderAll() then
// rebuilds every section in the new locale.

const POLL_MS = 2000;

const ASSET_TABS = ["all", "equity", "crypto", "commodity", "future"];

let stocks = {};          // symbol -> quote (spot and futures combined)
let portfolio = null;
let orders = [];
let selected = null;
let side = "buy";          // buy/sell for spot, long/short for futures
let qty = 1;
let searchTerm = "";
let assetFilter = "all";
let ticketKey = "";        // symbol|side|locale|currency the ticket markup was built for

// --- formatting helpers ---------------------------------------------------
const plClass = (n) => (n < 0 ? " down" : n > 0 ? " up" : "");
const isFuture = (s) => s && s.kind === "future";
const isPoints = (s) => isFuture(s) && s.unit === "index";
// Everything interpolated into innerHTML is escaped, server data included:
// symbols and currency codes come from fixed tables today, but the templates
// shouldn't depend on that staying true.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

// Unit quotes: index futures in points, everything else converted to the
// display currency. `withSymbol` adds the currency symbol (headers, toasts).
function quote(s, v, { signed = false, withSymbol = false } = {}) {
  if (isPoints(s)) return fmt.points(v, { signed });
  if (withSymbol) return fmt.price(v);
  return fmt.amount(v, { signed });
}

function sectorLabel(s) {
  const base = s.sector.replace(/ Future$/, "");
  const key = "sector." + base;
  const label = t(key);
  return label === key ? base : label;
}

function unitLabel(unit) {
  const key = "unit." + unit;
  const label = t(key);
  return label === key ? unit : label;
}

const sideLabel = (s) => t("side." + s);
const lev = (n) => fmt.int(n) + "×";

// Server errors carry a stable `code`; show its translation when there is one.
function errorText(data, fallbackKey) {
  if (data && data.code) {
    const key = "error." + data.code;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return (data && data.error) || t(fallbackKey);
}

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
  const label = t("chart.aria", { symbol: s.symbol, count: values.length, from: quote(s, values[0]), to: quote(s, s.price) });
  return `<svg viewBox="0 0 690 260" role="img" aria-label="${esc(label)}">
    <line x1="0" y1="40" x2="690" y2="40" stroke="var(--acme-color-border)"/>
    <line x1="0" y1="110" x2="690" y2="110" stroke="var(--acme-color-border)"/>
    <line x1="0" y1="180" x2="690" y2="180" stroke="var(--acme-color-border)"/>
    <line x1="0" y1="250" x2="690" y2="250" stroke="var(--acme-color-border-strong)"/>
    <line x1="0" y1="${openY.toFixed(1)}" x2="${W}" y2="${openY.toFixed(1)}" stroke="var(--acme-color-data)" stroke-dasharray="4 4"/>
    <text x="4" y="${(openY - 6).toFixed(1)}" font-size="11" fill="var(--acme-color-text-subtle)" font-family="var(--acme-font-sans)">${th("chart.open", { price: quote(s, s.open) })}</text>
    <polyline points="${line}" fill="none" stroke="var(--acme-color-data-highlight)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${W}" cy="${lastY.toFixed(1)}" r="4" fill="var(--acme-color-data-highlight)"/>
    <text x="${W + 8}" y="${(lastY + 4).toFixed(1)}" font-size="12" font-weight="600" fill="var(--acme-color-data-highlight)" font-family="var(--acme-font-sans)">${esc(quote(s, s.price))}</text>
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

// --- language + currency pickers -------------------------------------------
function renderPrefs() {
  const lang = $("lang-select");
  lang.innerHTML = LOCALES.map((l) =>
    `<option value="${l.code}" lang="${l.code}"${l.code === i18n.locale ? " selected" : ""}>${esc(l.name)}</option>`
  ).join("");
  const cur = $("currency-select");
  cur.innerHTML = Object.keys(i18n.rates).map((code) =>
    `<option value="${esc(code)}"${code === i18n.currency ? " selected" : ""}>${esc(code)} · ${esc(fmt.currencyName(code))}</option>`
  ).join("");
}

function renderFooter() {
  const start = portfolio ? portfolio.startingCash : 100_000;
  $("footer-start").textContent = t("footer.start", { amount: fmt.money(start) });
  const fx = $("footer-fx");
  fx.hidden = i18n.currency === BASE_CURRENCY;
  fx.textContent = fx.hidden ? "" : t("footer.fx");
}

function rerenderAll() {
  applyStaticText();
  renderPrefs();
  renderTabs();
  renderFooter();
  ticketKey = "";
  renderHeader();
  renderPortfolio();
  renderOrders();
  renderMarketList();
  renderChart();
  renderTicket();
}

// --- app bar + account summary ------------------------------------------
function renderHeader() {
  $("updated-label").textContent = t("header.updated", { time: fmt.time(Date.now()) });
  if (!portfolio) return;

  const openPL = portfolio.unrealizedPL + portfolio.derivativesPL;
  const stat = (key, value, cls = "") =>
    `<div class="bt-stat"><div class="bt-stat__label">${th(key)}</div><div class="bt-stat__value num${cls}">${value}</div></div>`;

  $("trade").innerHTML = `
    <div class="bt-stat">
      <div class="bt-stat__label">${th("summary.equity")}</div>
      <div class="bt-stat__value num">${fmt.money(portfolio.equity)}</div>
      <div class="bt-stat__sub num${plClass(portfolio.totalPL)}">${th("summary.sinceStart", {
        amount: fmt.money(portfolio.totalPL, { signed: true }), pct: fmt.pct(portfolio.totalPLPct) })}</div>
    </div>
    ${stat("summary.cash", fmt.money(portfolio.cash))}
    ${stat("summary.spot", fmt.money(portfolio.marketValue))}
    ${stat("summary.margin", fmt.money(portfolio.marginUsed))}
    ${stat("summary.openPL", fmt.money(openPL, { signed: true }), plClass(openPL))}
    ${stat("summary.realizedPL", fmt.money(portfolio.realizedPL, { signed: true }), plClass(portfolio.realizedPL))}`;
  fitStatValues($("trade"));
  renderFooter();
}

// Summary amounts don't wrap (a break between "+" and "₹2,38,235.76" reads
// as two values). Most fit at the design size; the occasional long one —
// IDR or KRW balances, a peso amount shown with its ISO code — steps down
// until it fits its tile.
function fitStatValues(root) {
  root.querySelectorAll(".bt-stat__value").forEach((el) => {
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 12) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  });
}

// --- asset tabs + market list -------------------------------------------
function renderTabs() {
  const el = $("asset-tabs");
  el.innerHTML = ASSET_TABS.map((id) =>
    `<button class="acme-tab" role="tab" data-filter="${id}" aria-selected="${id === assetFilter}">${th("tabs." + id)}</button>`
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
  const tag = isFuture(s) ? `<span class="acme-badge bt-tag">${lev(s.leverage)}</span>` : "";
  const sel = s.symbol === selected;
  return `<tr data-symbol="${esc(s.symbol)}" aria-selected="${sel}">
    <td>
      <button class="bt-row-btn" data-symbol="${esc(s.symbol)}"${sel ? ' aria-current="true"' : ""}>
        <span class="bt-sym-line"><span class="mono">${esc(s.symbol)}</span>${tag}</span>
        <span class="bt-row-name">${esc(s.name)}</span>
      </button>
    </td>
    <td class="bt-col-spark">${sparkSVG(s.spark)}</td>
    <td class="acme-table__num">
      <div class="bt-price">${quote(s, s.price)}</div>
      <div class="bt-chg${plClass(s.changePct)}">${fmt.pct(s.changePct)}</div>
    </td>
  </tr>`;
}

function renderMarketList() {
  const items = visibleStocks();
  const total = Object.keys(stocks).length;
  $("market-count").textContent = items.length === total
    ? t("markets.count", { count: total })
    : t("markets.countFiltered", { shown: items.length, total });
  $("col-price").textContent = t("markets.colPrice", { currency: i18n.currency });
  const list = $("market-list");
  list.innerHTML = items.map(rowHTML).join("") ||
    `<tr><td colspan="3" class="bt-empty">${th("markets.noMatch", { term: searchTerm.trim() })}</td></tr>`;
  list.querySelectorAll("tr[data-symbol]").forEach((r) =>
    r.addEventListener("click", () => selectStock(r.dataset.symbol)));
}

// --- chart card ------------------------------------------------------
function renderChart() {
  const s = stocks[selected];
  const card = $("chart-card");
  if (!s) { card.innerHTML = `<h2 id="chart-h" class="bt-card-title">${th("chart.loading")}</h2>`; return; }

  const stats = isFuture(s)
    ? [["stat.notional", fmt.money(s.notional)], ["stat.marginPerContract", fmt.money(s.marginPerContract)],
       ["stat.leverage", lev(s.leverage)], ["stat.expiresIn", esc(t("stat.days", { count: s.daysToExpiry }))]]
    : [["stat.open", quote(s, s.open)], ["stat.dayHigh", quote(s, s.dayHigh)], ["stat.dayLow", quote(s, s.dayLow)],
       ["stat.volume", fmt.compact(s.volume)]];

  const ticks = s.spark.length;
  card.innerHTML = `
    <div class="bt-chart__head">
      <div class="bt-chart__sym">
        <h2 id="chart-h" class="bt-chart__title"><span class="mono">${esc(s.symbol)}</span> <span class="bt-chart__name">${esc(s.name)}</span></h2>
        <span class="acme-badge">${th("class." + s.assetClass)} · ${esc(sectorLabel(s))}</span>
      </div>
      <div class="bt-chart__quote">
        <div class="bt-chart__price num">${quote(s, s.price, { withSymbol: true })}</div>
        <div class="bt-chart__chg num${plClass(s.change)}">${th("chart.today", {
          change: quote(s, s.change, { signed: true }), pct: fmt.pct(s.changePct) })}</div>
      </div>
    </div>
    <figure class="bt-figure" dir="ltr">
      ${chartSVG(s)}
      <figcaption><span>${esc(fmt.secondsAgo(Math.round((ticks * POLL_MS) / 1000)))}</span><span>${th("chart.live", { count: ticks })}</span><span>${th("chart.now")}</span></figcaption>
    </figure>
    <dl class="bt-stats">
      ${stats.map(([k, v]) => `<div><dt>${th(k)}</dt><dd>${v}</dd></div>`).join("")}
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

const ticketId = () => [selected, side, i18n.locale, i18n.currency].join("|");

function buildTicket() {
  const s = stocks[selected];
  const card = $("trade-card");
  if (!s) { card.innerHTML = `<h2 id="ticket-h" class="bt-card-title">${th("ticket.title")}</h2>`; ticketKey = ""; return; }

  const [a, b] = ticketSides(s);
  const fut = isFuture(s);
  const quick = fut ? [1, 2, 5] : [1, 10, 50];
  const sizeHelp = !fut ? t("ticket.wholeUnits")
    : isPoints(s) ? t("ticket.contractSizeIndex", { size: s.multiplier })
    : t("ticket.contractSize", { size: s.multiplier, unit: unitLabel(s.unit) });
  const settles = i18n.currency === BASE_CURRENCY ? "" :
    ` ${th("ticket.settlesUsd", { currency: i18n.currency })}`;

  card.innerHTML = `
    <div class="bt-ticket__body">
    <div>
      <h2 id="ticket-h" class="bt-card-title">${th(fut ? "ticket.titleFuture" : "ticket.title")}</h2>
      <p class="bt-ticket__sub">${fut
        ? th("ticket.subFuture", { rate: fmt.pct(s.marginRate * 100, { digits: 0, signed: false }) })
        : th("ticket.subSpot")}</p>
    </div>
    <div class="acme-tabs bt-side" role="group" aria-label="${th(fut ? "ticket.direction" : "ticket.side")}">
      <button type="button" class="acme-tab" data-side="${a}" aria-pressed="${side === a}">${esc(sideLabel(a))}</button>
      <button type="button" class="acme-tab" data-side="${b}" aria-pressed="${side === b}">${esc(sideLabel(b))}</button>
    </div>
    <div class="acme-field">
      <label class="acme-label" for="qty">${th(fut ? "ticket.contracts" : "ticket.quantity")}</label>
      <input id="qty" class="acme-input" type="number" min="1" step="1" value="${qty}" inputmode="numeric" />
      <span class="acme-help">${esc(sizeHelp)}</span>
    </div>
    <div class="bt-quick">
      ${quick.map((n) => `<button type="button" class="acme-btn acme-btn--secondary acme-btn--sm" data-qty="${n}">${fmt.int(n)}</button>`).join("")}
      <button type="button" class="acme-btn acme-btn--secondary acme-btn--sm" data-qty="max">${th("ticket.max")}</button>
    </div>
    <dl class="bt-estimate" id="ticket-est"></dl>
    <div class="bt-held" id="ticket-held" hidden></div>
    </div>
    <div class="bt-ticket__foot">
      <button type="button" id="place-order" class="acme-btn acme-btn--primary acme-btn--lg bt-place"></button>
      <p class="bt-fineprint">${th("ticket.fineprint")}${settles}</p>
    </div>`;

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
  ticketKey = ticketId();
}

function updateTicket() {
  const s = stocks[selected];
  if (!s) return;
  const row = (key, v, cls = "", params) => `<div class="${cls}"><dt>${th(key, params)}</dt><dd>${v}</dd></div>`;
  const est = $("ticket-est");
  const heldEl = $("ticket-held");
  const btn = $("place-order");
  const cash = portfolio ? portfolio.cash : 0;

  if (isFuture(s)) {
    const notional = qty * s.notional;
    const margin = qty * s.marginPerContract;
    const perMove = isPoints(s)
      ? row("ticket.perPoint", fmt.money(qty * s.multiplier), "bt-rule")
      : row("ticket.perMove", fmt.money(qty * s.multiplier), "bt-rule", { move: fmt.usd(1) });
    est.innerHTML =
      row("ticket.notional", fmt.money(notional)) +
      `<div><dt>${th("ticket.marginLocked")}</dt><dd class="bt-strong">${fmt.money(margin)}</dd></div>` +
      row("ticket.leverage", lev(s.leverage)) +
      perMove;

    const pos = portfolio?.positions?.find((p) => p.symbol === s.symbol);
    if (pos) {
      const same = pos.direction === side;
      heldEl.innerHTML = `${ICON_INFO}<span>${th("ticket.heldFuture", {
        direction: sideLabel(pos.direction), count: pos.contracts, symbol: s.symbol })} ${th(same ? "ticket.heldAdds" : "ticket.heldReduces")}</span>`;
      heldEl.hidden = false;
    } else heldEl.hidden = true;

    btn.textContent = t(side === "long" ? "ticket.btnLong" : "ticket.btnShort", { count: qty, symbol: s.symbol });
  } else {
    const total = qty * s.price;
    const holding = portfolio?.holdings?.find((h) => h.symbol === s.symbol);
    const after = cash - total;
    est.innerHTML = row("ticket.price", quote(s, s.price, { withSymbol: true })) + (side === "buy"
      ? `<div><dt>${th("ticket.estCost")}</dt><dd class="bt-strong">${fmt.money(total)}</dd></div>` +
        row("ticket.cashAfter", `<span class="${after < 0 ? "down" : ""}">${fmt.money(after)}</span>`, "bt-rule")
      : `<div><dt>${th("ticket.estProceeds")}</dt><dd class="bt-strong">${fmt.money(total)}</dd></div>` +
        row("ticket.youHold", th("ticket.holdQty", { count: holding ? holding.shares : 0, symbol: s.symbol }), "bt-rule"));

    if (holding && side === "buy") {
      heldEl.innerHTML = `${ICON_INFO}<span>${th("ticket.heldSpot", {
        count: holding.shares, symbol: s.symbol, price: quote(s, holding.avgCost, { withSymbol: true }) })}</span>`;
      heldEl.hidden = false;
    } else heldEl.hidden = true;

    btn.textContent = t(side === "buy" ? "ticket.btnBuy" : "ticket.btnSell", { count: qty, symbol: s.symbol });
  }
  btn.disabled = qty <= 0;
}

// --- your position in the selected instrument ------------------------------
function renderHolding() {
  const s = stocks[selected];
  const card = $("holding-card");
  if (!s) { card.innerHTML = ""; card.hidden = true; return; }
  card.hidden = false;
  const fut = isFuture(s);
  const held = fut
    ? portfolio?.positions?.find((p) => p.symbol === s.symbol)
    : portfolio?.holdings?.find((h) => h.symbol === s.symbol);
  const item = (key, v, cls = "") => `<div><dt>${th(key)}</dt><dd class="num${cls}">${v}</dd></div>`;
  const pl = (n, pct) => `${fmt.money(n, { signed: true })} (${fmt.pct(pct)})`;

  let body;
  if (!held) {
    body = `<p class="bt-holding__none">${th("holding.none", { symbol: s.symbol })}</p>`;
  } else if (fut) {
    body = `<dl class="bt-holding__grid">
      ${item("positions.colSide", esc(t("stat.holdFuture", { direction: sideLabel(held.direction), count: held.contracts })), " bt-holding__big")}
      ${item("holding.margin", fmt.money(held.margin), " bt-holding__big")}
      ${item("positions.colEntry", quote(s, held.entry))}
      ${item("positions.colOpenPL", pl(held.unrealizedPL, held.unrealizedPLPct), plClass(held.unrealizedPL))}
    </dl>`;
  } else {
    body = `<dl class="bt-holding__grid">
      ${item("ticket.quantity", fmt.int(held.shares), " bt-holding__big")}
      ${item("holding.value", fmt.money(held.marketValue), " bt-holding__big")}
      ${item("holding.avgCost", quote(s, held.avgCost, { withSymbol: true }))}
      ${item("holding.unrealized", pl(held.unrealizedPL, held.unrealizedPLPct), plClass(held.unrealizedPL))}
    </dl>`;
  }
  card.innerHTML = `
    <h2 id="holding-h" class="bt-card-title">${th("holding.title", { symbol: s.symbol })}</h2>
    ${body}
    <a class="bt-holding__link" href="${fut ? "#futures" : "#portfolio"}">${th("holding.seeAll")}</a>`;
}

function renderTicket() {
  const s = stocks[selected];
  if (s && !ticketSides(s).includes(side)) side = ticketSides(s)[0];
  if (!s || ticketKey !== ticketId()) buildTicket();
  updateTicket();
  renderHolding();
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
  if (!s || qty <= 0) { toast(t("toast.enterQty"), true); return; }
  const btn = $("place-order");
  if (btn) btn.disabled = true;

  try {
    const { res, data } = isFuture(s)
      ? await postJSON("/api/futures/orders", { symbol: selected, direction: side, contracts: qty })
      : await postJSON("/api/orders", { symbol: selected, side, quantity: qty });
    if (!res.ok) { toast(errorText(data, "toast.rejected"), true); return; }
    portfolio = data.portfolio;
    const o = data.order;
    const price = quote(s, o.price, { withSymbol: true });
    toast(isFuture(s)
      ? t(side === "long" ? "toast.filledLong" : "toast.filledShort", { count: o.contracts, symbol: o.symbol, price })
      : t(o.side === "buy" ? "toast.filledBuy" : "toast.filledSell", { count: o.quantity, symbol: o.symbol, price }));
    await refresh();
  } catch {
    toast(t("toast.network"), true);
  } finally {
    if (btn) btn.disabled = qty <= 0;
  }
}

async function closePosition(symbol, kind) {
  try {
    if (kind === "future") {
      const { res, data } = await postJSON("/api/futures/close", { symbol });
      if (!res.ok) { toast(errorText(data, "toast.closeFailed"), true); return; }
      portfolio = data.portfolio;
      toast(t("toast.closed", { count: data.order.contracts, symbol, pl: fmt.money(data.order.realizedPL, { signed: true }) }));
    } else {
      const h = portfolio?.holdings?.find((x) => x.symbol === symbol);
      if (!h) return;
      const { res, data } = await postJSON("/api/orders", { symbol, side: "sell", quantity: h.shares });
      if (!res.ok) { toast(errorText(data, "toast.sellFailed"), true); return; }
      portfolio = data.portfolio;
      toast(t("toast.filledSell", { count: h.shares, symbol, price: quote(stocks[symbol], data.order.price, { withSymbol: true }) }));
    }
    await refresh();
  } catch {
    toast(t("toast.networkClose"), true);
  }
}

// --- spot holdings + futures positions tables ------------------------------
function tableHTML(head, rows) {
  return `<div class="bt-table-scroll"><table class="acme-table">
    <thead><tr>${head.map(([key, num]) => key
      ? `<th scope="col"${num ? ' class="acme-table__num"' : ""}>${th(key)}</th>`
      : `<th scope="col"><span class="sr-only">${th("positions.colActions")}</span></th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table></div>`;
}

const instrumentCell = (symbol, name) =>
  `<td><button class="bt-row-btn" data-symbol="${esc(symbol)}"><span class="mono">${esc(symbol)}</span><span class="bt-row-name">${esc(name)}</span></button></td>`;
const closeCell = (symbol, kind) =>
  `<td class="bt-actions"><button type="button" class="acme-btn acme-btn--${kind === "future" ? "secondary" : "ghost"} acme-btn--sm" data-close="${esc(symbol)}" data-kind="${kind}">${th("side.close")}</button></td>`;

function wireTable(body) {
  body.querySelectorAll(".bt-row-btn").forEach((b) =>
    b.addEventListener("click", () => selectStock(b.dataset.symbol)));
  body.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closePosition(b.dataset.close, b.dataset.kind)));
}

function renderPortfolio() {
  if (!portfolio) return;
  const holdings = portfolio.holdings || [];
  const positions = portfolio.positions || [];

  const spot = $("spot-body");
  $("spot-meta").textContent = holdings.length ? t("positions.meta", { count: holdings.length }) : "";
  spot.innerHTML = !holdings.length ? `<p class="bt-empty-card">${th("positions.spotEmpty")}</p>`
    : tableHTML(
      [["positions.colInstrument"], ["positions.colQty", 1], ["holding.avgCost", 1], ["ticket.price", 1],
       ["holding.value", 1], ["holding.unrealized", 1], [null]],
      holdings.map((h) => {
        const inst = stocks[h.symbol] || { kind: "spot" };
        return `<tr>${instrumentCell(h.symbol, h.name)}
          <td class="acme-table__num">${fmt.int(h.shares)}</td>
          <td class="acme-table__num">${quote(inst, h.avgCost)}</td>
          <td class="acme-table__num">${quote(inst, h.price)}</td>
          <td class="acme-table__num bt-pl">${fmt.money(h.marketValue)}</td>
          <td class="acme-table__num bt-pl${plClass(h.unrealizedPL)}">${fmt.money(h.unrealizedPL, { signed: true })}</td>
          ${closeCell(h.symbol, "spot")}</tr>`;
      }));
  wireTable(spot);

  const fut = $("futures-body");
  $("fut-meta").textContent = positions.length ? t("positions.meta", { count: positions.length }) : "";
  fut.innerHTML = !positions.length ? `<p class="bt-empty-card">${th("positions.futuresEmpty")}</p>`
    : tableHTML(
      [["positions.colContract"], ["positions.colSide"], ["ticket.contracts", 1], ["positions.colEntry", 1],
       ["positions.colMark", 1], ["stat.notional", 1], ["holding.margin", 1], ["positions.colOpenPL", 1], [null]],
      positions.map((p) => {
        const inst = stocks[p.symbol] || { kind: "future" };
        return `<tr>${instrumentCell(p.symbol, p.leverage ? `${p.name} · ${lev(p.leverage)}` : p.name)}
          <td><span class="acme-badge">${esc(sideLabel(p.direction))}</span></td>
          <td class="acme-table__num">${fmt.int(p.contracts)}</td>
          <td class="acme-table__num">${quote(inst, p.entry)}</td>
          <td class="acme-table__num">${quote(inst, p.mark)}</td>
          <td class="acme-table__num">${fmt.money(p.notional)}</td>
          <td class="acme-table__num">${fmt.money(p.margin)}</td>
          <td class="acme-table__num bt-pl${plClass(p.unrealizedPL)}">${fmt.money(p.unrealizedPL, { signed: true })}</td>
          ${closeCell(p.symbol, "future")}</tr>`;
      }));
  wireTable(fut);
}

// --- order history ------------------------------------------------------
function orderRow(o) {
  let label, total;
  if (o.kind === "future") {
    label = sideLabel(o.action === "close" ? "close" : o.direction);
    total = o.action === "close"
      ? `<span class="${plClass(o.realizedPL).trim()}">${th("orders.realized", { amount: fmt.money(o.realizedPL, { signed: true }) })}</span>`
      : th("positions.margin", { amount: fmt.money(o.margin) });
  } else {
    label = sideLabel(o.side);
    total = fmt.money(o.total);
  }
  const q = o.kind === "future" ? o.contracts : o.quantity;
  return `<tr>
    <td class="bt-time">${fmt.time(o.timestamp)}</td>
    <td><strong>${esc(label)}</strong> <span class="mono">${esc(o.symbol)}</span></td>
    <td class="acme-table__num">${fmt.int(q)}</td>
    <td class="acme-table__num">${quote(stocks[o.symbol] || { kind: o.kind }, o.price)}</td>
    <td class="acme-table__num">${total}</td>
    <td><span class="acme-badge acme-badge--success">${ICON_CHECK}${th("orders.filled")}</span></td>
  </tr>`;
}

function renderOrders() {
  const body = $("orders-body");
  $("orders-meta").textContent = orders.length
    ? (orders.length > 25 ? t("orders.metaLatest", { shown: 25, count: orders.length }) : t("orders.meta", { count: orders.length }))
    : "";
  if (!orders.length) { body.innerHTML = `<p class="bt-empty-card">${th("orders.empty")}</p>`; return; }
  body.innerHTML = `<div class="bt-table-scroll"><table class="acme-table">
    <thead><tr>
      <th scope="col">${th("orders.colTime")}</th><th scope="col">${th("orders.colOrder")}</th>
      <th scope="col" class="acme-table__num">${th("orders.colQty")}</th><th scope="col" class="acme-table__num">${th("orders.colFill")}</th>
      <th scope="col" class="acme-table__num">${th("orders.colTotal")}</th><th scope="col">${th("orders.colStatus")}</th>
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

    stocks = {};
    s.forEach((q) => (stocks[q.symbol] = q));
    f.forEach((q) => (stocks[q.symbol] = q));
    portfolio = p;
    orders = o;

    renderHeader();
    renderPortfolio();
    renderOrders();

    if (!selected) selectStock(s[0]?.symbol);
    else { renderMarketList(); renderChart(); renderTicket(); }
  } catch (err) {
    console.error("refresh failed:", err);
    $("updated-label").textContent = t("header.offline");
  }
}

async function init() {
  await initI18n();
  applyStaticText();
  renderPrefs();
  renderTabs();
  renderFooter();
  $("search").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderMarketList();
  });
  $("lang-select").addEventListener("change", async (e) => {
    await setLocale(e.target.value);
    rerenderAll();
  });
  $("currency-select").addEventListener("change", (e) => {
    setCurrency(e.target.value);
    rerenderAll();
  });
  window.addEventListener("scroll", syncNav, { passive: true });
  window.addEventListener("resize", () => fitStatValues($("trade")), { passive: true });
  refresh();
  setInterval(refresh, POLL_MS);
}

document.addEventListener("DOMContentLoaded", init);

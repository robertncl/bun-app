// BunTrade — front-end controller.
// A tabbed mobile app (Watchlist / Detail / Portfolio / Orders / Account)
// per the "Stock Trading App Mobile" design, driven by the real simulated
// market API. Screens are template functions rendered wholesale into #app
// on every state change; the DOM trees are small enough that this is
// simpler than incremental patching and still cheap on every 2s poll.
//
// Two instrument families share the app: spot (equities, crypto,
// commodities) trade buy/sell outright; futures trade long/short on
// margin. The order ticket adapts its language (Buy/Sell vs Long/Short,
// "shares" vs "contracts") to whichever kind is selected.

const POLL_MS = 2000;
const THEME_KEY = "buntrade-theme";

const CATEGORIES = [
  { id: "watch", label: "Watch" },
  { id: "equity", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
  { id: "commodity", label: "Commodities" },
  { id: "future", label: "Futures" },
];

// The backend keeps a rolling 60-tick in-memory history per instrument (no
// real calendar data), so range selection just slices more or less of that
// buffer rather than fetching a different time series.
const RANGE_POINTS = { "1D": 15, "1W": 24, "1M": 40, "3M": 60, "1Y": 60 };

let stocks = {};          // symbol -> quote (spot and futures combined)
let portfolio = null;     // latest portfolio view
let orders = [];          // server-executed orders (always "filled")
let pendingOrders = [];   // client-only limit/stop tickets — see placeTicketOrder
const prevPrice = {};     // symbol -> last seen price, for row tick flashes

let theme = localStorage.getItem(THEME_KEY) || "dark";
let screen = "home";      // home | detail | portfolio | orders | account
let category = "watch";
let searchQuery = "";
let watchlist = new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "TSLA"]);

let activeSymbol = null;
let range = "1M";
let detailHistory = [];   // full history buffer for the active detail chart

let ticket = null;        // { symbol, kind, side, type, qty, price, step, resultSummary, resultId }

let notif = { price: true, fills: true, news: false };
let twoFactor = true;

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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- chart (dependency-free SVG area + line) -------------------------------
function buildChart(values, w, h, padY = 8) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - padY - ((v - min) / range) * (h - padY * 2),
  }));
  const path = pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const areaPath = `${path} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`;
  return { path, areaPath, rising: values[values.length - 1] >= values[0] };
}

function chartSVG(values) {
  if (!values || values.length < 2) return "";
  const { path, areaPath, rising } = buildChart(values, 360, 160);
  const color = rising ? "success" : "danger";
  const gid = "grad-" + Math.random().toString(36).slice(2, 8);
  return `<svg class="detail-chart" viewBox="0 0 360 160" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--acme-color-${color})" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="var(--acme-color-${color})" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${areaPath}" fill="url(#${gid})"/>
    <path d="${path}" fill="none" stroke="var(--acme-color-${color})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// --- icons ------------------------------------------------------------------
const ICONS = {
  sun: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--acme-color-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  starFilled: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starOutline: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  up: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>`,
  down: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  close: `×`,
  check: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--acme-color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  tabHome: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>`,
  tabPortfolio: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7"/></svg>`,
  tabOrders: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11"/></svg>`,
  tabAccount: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`,
};

// --- toast --------------------------------------------------------------
let toastTimer;
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3200);
}

// --- navigation -----------------------------------------------------------
function goHome() { screen = "home"; render(); }
function goPortfolio() { screen = "portfolio"; render(); }
function goOrders() { screen = "orders"; render(); }
function goAccount() { screen = "account"; render(); }

function selectSymbol(symbol) {
  activeSymbol = symbol;
  screen = "detail";
  searchQuery = "";
  loadDetailHistory();
  render();
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  render();
}

function toggleWatch(symbol) {
  if (watchlist.has(symbol)) watchlist.delete(symbol);
  else watchlist.add(symbol);
  render();
}

async function loadDetailHistory() {
  if (!activeSymbol) return;
  try {
    const res = await fetch(`/api/stocks/${encodeURIComponent(activeSymbol)}`);
    if (!res.ok) return;
    const q = await res.json();
    detailHistory = q.history || [];
    render();
  } catch {
    // keep whatever history we already have; the next poll will retry
  }
}

// --- home / watchlist -------------------------------------------------------
function categorySymbols() {
  if (category === "watch") return [...watchlist];
  return Object.values(stocks).filter((s) => s.assetClass === category).map((s) => s.symbol);
}

function renderHomeHTML() {
  const q = searchQuery.trim().toLowerCase();
  let body;

  if (q) {
    const results = Object.values(stocks)
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 8);
    body = results.length
      ? results.map((s) => `
        <button class="list-row search-row" data-select="${s.symbol}">
          <span class="row-symbol">${s.symbol}</span>
          <span class="row-name">${esc(s.name)}</span>
        </button>`).join("")
      : `<p class="hint-text">No matches for "${esc(searchQuery)}".</p>`;
  } else {
    const chips = CATEGORIES.map((c) =>
      `<button class="chip${c.id === category ? " active" : ""}" data-category="${c.id}">${c.label}</button>`
    ).join("");

    const symbols = categorySymbols();
    const rows = symbols
      .map((sym) => stocks[sym])
      .filter(Boolean)
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((s) => {
        const up = s.changePct >= 0;
        const tag = isFuture(s) ? `<span class="row-tag">${s.leverage}×</span>` : "";
        const prev = prevPrice[s.symbol];
        const flash = prev !== undefined && s.price !== prev ? (s.price > prev ? " tick-up" : " tick-down") : "";
        return `<button class="list-row" data-select="${s.symbol}">
          <span><span class="row-symbol">${s.symbol}${tag}</span><span class="row-name" style="display:block">${esc(s.name)}</span></span>
          <span><span class="row-price num${flash}" style="display:block">${usd(s.price)}</span><span class="row-change num ${up ? "up" : "down"}" style="display:block">${pct(s.changePct)}</span></span>
        </button>`;
      })
      .join("");

    body = `<div class="chip-row">${chips}</div>` +
      (rows || `<p class="hint-text">No symbols yet. Search above and add to your watchlist.</p>`);
  }

  return `
    <div class="screen-header">
      <div class="screen-title-row">
        <h1 class="screen-title">Watchlist</h1>
        <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme">${theme === "dark" ? ICONS.moon : ICONS.sun}</button>
      </div>
      <div class="search-bar">
        ${ICONS.search}
        <input id="search-input" value="${esc(searchQuery)}" placeholder="Search ticker or company" autocomplete="off" />
      </div>
    </div>
    <div class="screen-body">${body}</div>`;
}

// --- detail ------------------------------------------------------------
function renderDetailHTML() {
  const s = stocks[activeSymbol];
  if (!s) return `<div class="screen-body"><p class="hint-text">Loading…</p></div>`;

  const up = s.changePct >= 0;
  const watched = watchlist.has(activeSymbol);
  const series = detailHistory.length >= 2
    ? detailHistory.slice(-RANGE_POINTS[range])
    : (s.spark || []);

  const ranges = Object.keys(RANGE_POINTS).map((r) =>
    `<button class="range-btn${r === range ? " active" : ""}" data-range="${r}">${r}</button>`
  ).join("");

  const stats = isFuture(s)
    ? [
        ["Notional", "$" + compact(s.notional)],
        ["Leverage", s.leverage + "×"],
        ["Margin/contract", "$" + compact(s.marginPerContract)],
        ["Expires", s.daysToExpiry + "d"],
      ]
    : [
        ["Prev close", usd(s.prevClose)],
        ["Open", usd(s.open)],
        ["Day range", usd(s.dayLow) + " – " + usd(s.dayHigh)],
        ["Volume", compact(s.volume)],
      ];
  const statsHTML = stats.map(([label, value]) =>
    `<div><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`
  ).join("");

  const news = [
    { title: `${s.name} extends move as investors weigh the outlook`, meta: "Market Wire · 2h ago" },
    { title: `Analysts split on ${s.symbol} after latest guidance`, meta: "Ticker Daily · 6h ago" },
    { title: `What to watch in ${s.name} this week`, meta: "Desk Notes · 1d ago" },
  ].map((n) => `<div class="news-item"><div class="news-title">${esc(n.title)}</div><div class="news-meta">${n.meta}</div></div>`).join("");

  const footer = isFuture(s)
    ? `<button class="acme-btn acme-btn--primary" data-open-ticket="long">Long</button>
       <button class="acme-btn" style="border:1px solid var(--acme-color-border-strong);background:var(--acme-color-surface-raised)" data-open-ticket="short">Short</button>`
    : `<button class="acme-btn acme-btn--primary" style="background:var(--acme-color-success)" data-open-ticket="buy">Buy</button>
       <button class="acme-btn" style="border:1px solid var(--acme-color-border-strong);background:var(--acme-color-surface-raised)" data-open-ticket="sell">Sell</button>`;

  return `
    <div class="screen-header detail-header">
      <button class="icon-btn" id="detail-back" aria-label="Back">${ICONS.back}</button>
      <div class="screen-title">${s.symbol}</div>
      <button class="icon-btn${watched ? " icon-btn--warning" : ""}" id="watch-toggle" aria-label="Toggle watch">${watched ? ICONS.starFilled : ICONS.starOutline}</button>
    </div>
    <div class="screen-body">
      <div class="detail-sub">${esc(s.name)} · ${esc(s.sector)}</div>
      <div class="detail-price num">${usd(s.price)}</div>
      <div class="detail-change ${up ? "up" : "down"}">${up ? ICONS.up : ICONS.down} ${money(Math.abs(s.change))} (${pct(s.changePct)})</div>

      <div class="range-row">${ranges}</div>
      <div class="detail-chart-wrap">${chartSVG(series)}</div>

      <div class="stats-grid">${statsHTML}</div>

      <h3 class="section-h3">Latest news</h3>
      ${news}
    </div>
    <div class="sticky-footer">${footer}</div>`;
}

// --- portfolio ------------------------------------------------------------
const ALLOC_COLORS = ["var(--acme-blue-600)", "var(--acme-blue-500)", "var(--acme-blue-400)", "var(--acme-blue-300)", "var(--acme-blue-200)", "var(--acme-blue-700)"];

function renderPortfolioHTML() {
  if (!portfolio) return `<div class="screen-body"><p class="hint-text">Loading…</p></div>`;

  const holdings = portfolio.holdings || [];
  const positions = portfolio.positions || [];
  const up = portfolio.totalPL >= 0;

  const segments = holdings.map((h, i) => ({
    pct: portfolio.marketValue ? (h.marketValue / portfolio.marketValue) * 100 : 0,
    color: ALLOC_COLORS[i % ALLOC_COLORS.length],
  }));
  if (portfolio.marginUsed > 0) {
    const denom = portfolio.marketValue + portfolio.marginUsed;
    segments.forEach((seg, i) => (segments[i] = { ...seg, pct: denom ? (holdings[i].marketValue / denom) * 100 : 0 }));
    segments.push({ pct: denom ? (portfolio.marginUsed / denom) * 100 : 0, color: "var(--acme-color-border-strong)" });
  }
  const allocBar = segments.map((seg) => `<div style="width:${seg.pct.toFixed(2)}%;background:${seg.color}"></div>`).join("");

  const holdingsHTML = holdings.map((h) => {
    const hUp = h.unrealizedPL >= 0;
    return `<button class="list-row" data-select="${h.symbol}">
      <span><span class="row-symbol">${h.symbol}</span><span class="row-name" style="display:block">${h.shares} shares · avg ${usd(h.avgCost)}</span></span>
      <span><span class="row-price num" style="display:block">${usd(h.marketValue)}</span><span class="row-change num ${hUp ? "up" : "down"}" style="display:block">${signedUsd(h.unrealizedPL)}</span></span>
    </button>`;
  }).join("");

  const positionsHTML = positions.length ? `
    <h3 class="section-h3">Derivatives · margin ${usd(portfolio.marginUsed)}</h3>
    ${positions.map((p) => {
      const pUp = p.unrealizedPL >= 0;
      return `<div class="pos-row">
        <button class="pos-select" data-select="${p.symbol}">
          <span><span class="row-symbol">${p.symbol}<span class="dir-badge ${p.direction}">${p.direction.toUpperCase()}</span></span><span class="row-name" style="display:block">${p.contracts} @ ${usd(p.entry)} · ${p.leverage}×</span></span>
          <span><span class="row-price num ${pUp ? "up" : "down"}" style="display:block">${signedUsd(p.unrealizedPL)}</span><span class="row-change num ${pUp ? "up" : "down"}" style="display:block">${pct(p.unrealizedPLPct)}</span></span>
        </button>
        <button class="pos-close" data-close-position="${p.symbol}">Close</button>
      </div>`;
    }).join("")}` : "";

  return `
    <div class="screen-header"><h1 class="screen-title">Portfolio</h1></div>
    <div class="screen-body">
      <div class="portfolio-total-label">Total value</div>
      <div class="portfolio-total-value num">${usd(portfolio.equity)}</div>
      <div class="portfolio-gain ${up ? "up" : "down"}">${signedUsd(portfolio.totalPL)} (${pct(portfolio.totalPLPct)}) all time</div>
      ${segments.length ? `<div class="alloc-bar">${allocBar}</div>` : ""}
      ${holdings.length || positions.length ? "" : `<p class="hint-text">No open positions. Search a symbol and place your first trade.</p>`}
      ${holdings.length ? `<h3 class="section-h3">Holdings</h3>${holdingsHTML}` : ""}
      ${positionsHTML}
    </div>`;
}

// --- orders ------------------------------------------------------------
function allOrderRows() {
  const server = orders.map((o) => ({
    id: "ORD-" + o.id,
    date: new Date(o.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    timestamp: o.timestamp,
    symbol: o.symbol,
    side: o.kind === "future" ? (o.action === "close" ? "close" : o.direction) : o.side,
    type: "Market",
    qty: o.kind === "future" ? o.contracts : o.quantity,
    price: o.price,
    status: "filled",
    client: false,
  }));
  const client = pendingOrders.map((o) => ({ ...o, date: new Date(o.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) }));
  return [...server, ...client].sort((a, b) => b.timestamp - a.timestamp);
}

function renderOrdersHTML() {
  const rows = allOrderRows();
  const body = rows.length ? rows.map((o) => {
    const pillClass = o.status === "filled" ? "status-pill--filled" : o.status === "pending" ? "status-pill--pending" : "status-pill--canceled";
    const cancel = o.client && o.status === "pending" ? `<button class="order-cancel" data-cancel-order="${o.id}">Cancel</button>` : "";
    return `<div class="order-item">
      <div class="order-top">
        <span class="order-symbol">${o.symbol}</span>
        <span style="display:flex;align-items:center"><span class="status-pill ${pillClass}">${o.status[0].toUpperCase() + o.status.slice(1)}</span>${cancel}</span>
      </div>
      <div class="order-bottom">
        <span>${o.side} · ${o.type} · ${o.qty} ${o.kind === "future" ? "ct" : "sh"} @ ${usd(o.price)}</span>
        <span>${o.date}</span>
      </div>
    </div>`;
  }).join("") : `<p class="hint-text">No orders yet.</p>`;

  return `
    <div class="screen-header"><h1 class="screen-title">Orders</h1></div>
    <div class="screen-body">${body}</div>`;
}

// --- account ------------------------------------------------------------
function switchHTML(on, action) {
  return `<button class="switch ${on ? "on" : "off"}" data-toggle="${action}"><span class="switch-knob"></span></button>`;
}

function renderAccountHTML() {
  return `
    <div class="screen-header"><h1 class="screen-title">Account</h1></div>
    <div class="screen-body">
      <div class="account-header">
        <div class="avatar">PT</div>
        <div><div class="account-name">Paper Trader</div><div class="account-id">Demo account · single shared session</div></div>
      </div>

      <h3 class="settings-h3">Appearance</h3>
      <div class="settings-row">
        <div class="settings-label">Dark theme</div>
        ${switchHTML(theme === "dark", "theme")}
      </div>

      <h3 class="settings-h3">Notifications</h3>
      <div class="settings-row"><div class="settings-label">Price alerts</div>${switchHTML(notif.price, "notif-price")}</div>
      <div class="settings-row"><div class="settings-label">Order fills</div>${switchHTML(notif.fills, "notif-fills")}</div>
      <div class="settings-row"><div class="settings-label">News digest</div>${switchHTML(notif.news, "notif-news")}</div>

      <h3 class="settings-h3">Security</h3>
      <div class="settings-row"><div class="settings-label">Two-factor authentication</div>${switchHTML(twoFactor, "twofactor")}</div>
      <button class="link-btn" id="change-password">Change password</button>
      <button class="signout-btn" id="sign-out">Sign out</button>
    </div>`;
}

// --- tab bar & ticket sheet -------------------------------------------------
function tabBarHTML() {
  const tabs = [
    { id: "home", label: "Home", icon: ICONS.tabHome, go: "goHome", active: screen === "home" || screen === "detail" },
    { id: "portfolio", label: "Portfolio", icon: ICONS.tabPortfolio, go: "goPortfolio", active: screen === "portfolio" },
    { id: "orders", label: "Orders", icon: ICONS.tabOrders, go: "goOrders", active: screen === "orders" },
    { id: "account", label: "Account", icon: ICONS.tabAccount, go: "goAccount", active: screen === "account" },
  ];
  return `<div class="tab-bar">${tabs.map((t) =>
    `<button class="tab-btn${t.active ? " active" : ""}" data-nav="${t.go}">${t.icon}<span>${t.label}</span></button>`
  ).join("")}</div>`;
}

function openTicket(symbol, side) {
  const s = stocks[symbol];
  if (!s) return;
  ticket = { symbol, kind: s.kind, side, type: "market", qty: "10", price: "", step: "ticket" };
  render();
}
function closeTicket() { ticket = null; render(); }
function updateTicket(patch) { ticket = { ...ticket, ...patch }; render(); }

function ticketEstimate(t, s) {
  const qty = parseInt(t.qty, 10) || 0;
  if (t.kind === "future") {
    return qty * s.marginPerContract;
  }
  const price = t.type === "market" ? s.price : (parseFloat(t.price) || s.price);
  return qty * price;
}

function ticketSheetHTML() {
  const t = ticket;
  const s = stocks[t.symbol];
  if (!s) return "";
  const isLong = t.kind === "future";
  const verb = isLong ? (t.side === "long" ? "Long" : "Short") : (t.side === "buy" ? "Buy" : "Sell");
  const unit = isLong ? "contracts" : "shares";

  if (t.step === "ticket") {
    const sideButtons = isLong
      ? `<button class="side-choice${t.side === "long" ? " buy-active" : ""}" data-ticket-side="long">Long</button>
         <button class="side-choice${t.side === "short" ? " sell-active" : ""}" data-ticket-side="short">Short</button>`
      : `<button class="side-choice${t.side === "buy" ? " buy-active" : ""}" data-ticket-side="buy">Buy</button>
         <button class="side-choice${t.side === "sell" ? " sell-active" : ""}" data-ticket-side="sell">Sell</button>`;

    const priceField = t.type !== "market" ? `
      <div class="ticket-field">
        <label>${t.type === "limit" ? "Limit price" : "Stop price"}</label>
        <input class="acme-input" type="number" step="0.01" id="ticket-price" value="${esc(t.price)}" />
      </div>` : "";

    const estimate = ticketEstimate(t, s);
    const totalLabel = isLong ? "Margin required" : "Estimated total";

    return `<div class="sheet-overlay" id="sheet-overlay">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <h3>${verb} ${t.symbol}</h3>
          <button class="icon-btn" id="ticket-close" aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="side-row">${sideButtons}</div>
        <div class="ticket-form">
          <div class="ticket-field">
            <label>Order type</label>
            <select class="acme-input" id="ticket-type">
              <option value="market"${t.type === "market" ? " selected" : ""}>Market</option>
              <option value="limit"${t.type === "limit" ? " selected" : ""}>Limit</option>
              <option value="stop"${t.type === "stop" ? " selected" : ""}>Stop</option>
            </select>
          </div>
          <div class="ticket-field">
            <label>Quantity (${unit})</label>
            <input class="acme-input" type="number" min="1" step="1" id="ticket-qty" value="${esc(t.qty)}" />
          </div>
          ${priceField}
          <div class="ticket-total-row"><span>${totalLabel}</span><span class="num">${usd(estimate)}</span></div>
        </div>
        <button class="acme-btn acme-btn--primary review-btn" id="ticket-review">Review order</button>
      </div>
    </div>`;
  }

  if (t.step === "confirm") {
    const qty = parseInt(t.qty, 10) || 0;
    const priceLabel = t.type === "market" ? `Market price (${usd(s.price)})` : usd(parseFloat(t.price) || s.price);
    const estimate = ticketEstimate(t, s);
    const totalLabel = isLong ? "Margin required" : "Estimated total";

    return `<div class="sheet-overlay" id="sheet-overlay">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <h3 style="font:700 18px var(--acme-font-display);margin:0 0 14px">Confirm order</h3>
        <div class="confirm-rows">
          <div class="confirm-row"><span>Symbol</span><span class="row-symbol">${t.symbol}</span></div>
          <div class="confirm-row"><span>Side</span><span style="text-transform:capitalize">${t.side}</span></div>
          <div class="confirm-row"><span>Type</span><span style="text-transform:capitalize">${t.type}</span></div>
          <div class="confirm-row"><span>Quantity</span><span class="num">${qty} ${unit}</span></div>
          <div class="confirm-row"><span>Price</span><span class="num">${priceLabel}</span></div>
          <div class="confirm-total"><span>${totalLabel}</span><span class="num">${usd(estimate)}</span></div>
        </div>
        <div class="warning-callout"><p>Market orders fill at the prevailing price. Limit and stop orders are recorded as pending — this demo has no matching engine, so they won't fill automatically. Once filled, an order can't be undone.</p></div>
        <div class="confirm-actions">
          <button class="acme-btn" style="background:var(--acme-material-glass);box-shadow:var(--acme-glass-edge),var(--acme-shadow-sm)" id="ticket-back">Back</button>
          <button class="acme-btn acme-btn--primary" id="ticket-place">Place order</button>
        </div>
      </div>
    </div>`;
  }

  // step === "success"
  return `<div class="sheet-overlay" id="sheet-overlay">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="success-wrap">
        <div class="success-icon">${ICONS.check}</div>
        <h3>Order placed</h3>
        <p class="success-summary">${esc(t.resultSummary)}</p>
        <p class="success-id">${esc(t.resultId)}</p>
        <div class="success-actions">
          <button class="acme-btn" style="background:var(--acme-material-glass);box-shadow:var(--acme-glass-edge),var(--acme-shadow-sm)" id="ticket-done">Done</button>
          <button class="acme-btn acme-btn--primary" id="ticket-view-orders">View orders</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function placeTicketOrder() {
  const t = ticket;
  const s = stocks[t.symbol];
  const qty = parseInt(t.qty, 10) || 0;
  if (qty <= 0) { toast("Enter a valid quantity", "error"); return; }
  const unit = t.kind === "future" ? "contracts" : "shares";
  const verb = t.kind === "future" ? (t.side === "long" ? "Went long" : "Went short") : (t.side === "buy" ? "Bought" : "Sold");

  if (t.type !== "market") {
    // No matching engine on the backend — record as a client-only pending
    // order rather than pretending it executed. It never auto-fills; the
    // Orders screen offers a Cancel action instead.
    const price = parseFloat(t.price) || s.price;
    const order = {
      id: "ORD-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      timestamp: Date.now(),
      symbol: t.symbol, kind: t.kind, side: t.side,
      type: t.type, qty, price, status: "pending", client: true,
    };
    pendingOrders.unshift(order);
    ticket = { ...t, step: "success", resultSummary: `${verb} ${qty} ${unit} of ${t.symbol} — pending fill.`, resultId: order.id };
    render();
    return;
  }

  try {
    const endpoint = t.kind === "future" ? "/api/futures/orders" : "/api/orders";
    const body = t.kind === "future"
      ? { symbol: t.symbol, direction: t.side, contracts: qty }
      : { symbol: t.symbol, side: t.side, quantity: qty };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || "Order rejected", "error"); return; }
    portfolio = data.portfolio;
    const o = data.order;
    ticket = { ...t, step: "success", resultSummary: `${verb} ${qty} ${unit} of ${t.symbol} — filled at ${usd(o.price)}.`, resultId: "ORD-" + o.id };
    await refresh();
  } catch {
    toast("Network error — order not placed", "error");
    return;
  }
  render();
}

async function closePosition(symbol) {
  try {
    const res = await fetch("/api/futures/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || "Close failed", "error"); return; }
    portfolio = data.portfolio;
    toast(`Closed ${data.order.contracts} ${symbol} · ${signedUsd(data.order.realizedPL)}`, data.order.realizedPL >= 0 ? "success" : "error");
    await refresh();
  } catch {
    toast("Network error — position not closed", "error");
  }
}

function cancelPendingOrder(id) {
  const o = pendingOrders.find((p) => p.id === id);
  if (o) o.status = "canceled";
  render();
}

// --- master render + event wiring ------------------------------------------
function render() {
  document.documentElement.setAttribute("data-theme", theme);
  const app = document.getElementById("app");

  let body;
  if (screen === "detail") body = renderDetailHTML();
  else if (screen === "portfolio") body = renderPortfolioHTML();
  else if (screen === "orders") body = renderOrdersHTML();
  else if (screen === "account") body = renderAccountHTML();
  else body = renderHomeHTML();

  app.innerHTML = body + (screen !== "detail" ? tabBarHTML() : "") + (ticket ? ticketSheetHTML() : "");
  wireEvents();
}

function wireEvents() {
  const app = document.getElementById("app");

  app.querySelectorAll("[data-nav]").forEach((el) =>
    el.addEventListener("click", () => ({ goHome, goPortfolio, goOrders, goAccount }[el.dataset.nav]())));
  app.querySelectorAll("[data-select]").forEach((el) =>
    el.addEventListener("click", () => selectSymbol(el.dataset.select)));
  app.querySelectorAll("[data-category]").forEach((el) =>
    el.addEventListener("click", () => {
      category = el.dataset.category;
      render();
      document.querySelector(".chip.active")?.scrollIntoView({ inline: "center", block: "nearest" });
    }));
  app.querySelectorAll("[data-range]").forEach((el) =>
    el.addEventListener("click", () => { range = el.dataset.range; render(); }));
  app.querySelectorAll("[data-open-ticket]").forEach((el) =>
    el.addEventListener("click", () => openTicket(activeSymbol, el.dataset.openTicket)));
  app.querySelectorAll("[data-close-position]").forEach((el) =>
    el.addEventListener("click", () => closePosition(el.dataset.closePosition)));
  app.querySelectorAll("[data-cancel-order]").forEach((el) =>
    el.addEventListener("click", () => cancelPendingOrder(el.dataset.cancelOrder)));
  app.querySelectorAll("[data-ticket-side]").forEach((el) =>
    el.addEventListener("click", () => updateTicket({ side: el.dataset.ticketSide })));

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) themeToggle.addEventListener("click", toggleTheme);

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => { searchQuery = e.target.value; render(); });
    searchInput.focus();
    searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
  }

  const detailBack = document.getElementById("detail-back");
  if (detailBack) detailBack.addEventListener("click", goHome);
  const watchToggle = document.getElementById("watch-toggle");
  if (watchToggle) watchToggle.addEventListener("click", () => toggleWatch(activeSymbol));

  document.getElementById("sheet-overlay")?.addEventListener("click", (e) => { if (e.target.id === "sheet-overlay") closeTicket(); });
  document.getElementById("ticket-close")?.addEventListener("click", closeTicket);
  document.getElementById("ticket-type")?.addEventListener("change", (e) => updateTicket({ type: e.target.value }));
  document.getElementById("ticket-qty")?.addEventListener("input", (e) => updateTicket({ qty: e.target.value }));
  document.getElementById("ticket-price")?.addEventListener("input", (e) => updateTicket({ price: e.target.value }));
  document.getElementById("ticket-review")?.addEventListener("click", () => updateTicket({ step: "confirm" }));
  document.getElementById("ticket-back")?.addEventListener("click", () => updateTicket({ step: "ticket" }));
  document.getElementById("ticket-place")?.addEventListener("click", placeTicketOrder);
  document.getElementById("ticket-done")?.addEventListener("click", closeTicket);
  document.getElementById("ticket-view-orders")?.addEventListener("click", () => { ticket = null; goOrders(); });

  document.getElementById("change-password")?.addEventListener("click", () => toast("Not available in this demo", "info"));
  document.getElementById("sign-out")?.addEventListener("click", () => location.reload());
  document.querySelector('[data-toggle="theme"]')?.addEventListener("click", toggleTheme);
  document.querySelector('[data-toggle="notif-price"]')?.addEventListener("click", () => { notif.price = !notif.price; render(); });
  document.querySelector('[data-toggle="notif-fills"]')?.addEventListener("click", () => { notif.fills = !notif.fills; render(); });
  document.querySelector('[data-toggle="notif-news"]')?.addEventListener("click", () => { notif.news = !notif.news; render(); });
  document.querySelector('[data-toggle="twofactor"]')?.addEventListener("click", () => { twoFactor = !twoFactor; render(); });
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

    if (screen === "detail" && activeSymbol) loadDetailHistory();
    render();
    // Snapshot prices after rendering so the next tick's flash comparison
    // is against what was actually on screen this time, not this tick's own price.
    s.concat(f).forEach((q) => (prevPrice[q.symbol] = q.price));
  } catch (err) {
    console.error("refresh failed:", err);
  }
}

function init() {
  refresh();
  setInterval(refresh, POLL_MS);
}

document.addEventListener("DOMContentLoaded", init);

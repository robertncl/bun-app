// BunTrade — localization and display-currency support.
//
// Strings live in public/locales/<code>.json as flat "dotted.key" → text maps.
// Text may contain {name} placeholders; a value can also be an object keyed by
// Intl.PluralRules category ("one", "few", "other", …) and is picked with the
// `count` parameter. Missing keys fall back to English, then to the key.
//
// Money is held in USD everywhere (the account settles in USD). The display
// currency only changes how amounts are rendered: fmt.* converts with the
// server's indicative rates and formats with Intl for the active locale, so
// symbols, digit systems, grouping and decimals all follow the locale.

const LOCALES = [
  { code: "en", name: "English" },
  { code: "zh-CN", name: "中文（简体）" },
  { code: "hi", name: "हिन्दी" },
  { code: "es", name: "Español" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "fr", name: "Français" },
  { code: "bn", name: "বাংলা" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "ru", name: "Русский" },
  { code: "id", name: "Bahasa Indonesia" },
];

// Inter has no glyphs for these scripts; load a matching Noto face so the UI
// doesn't depend on whatever the OS happens to fall back to.
const LOCALE_FONTS = {
  "zh-CN": "Noto+Sans+SC:wght@400;500;600;700",
  hi: "Noto+Sans+Devanagari:wght@400;500;600;700",
  ar: "Noto+Sans+Arabic:wght@400;500;600;700",
  bn: "Noto+Sans+Bengali:wght@400;500;600;700",
};

const DEFAULT_LOCALE = "en";
const BASE_CURRENCY = "USD";
const PREF_LANG = "bt.lang";
const PREF_CURRENCY = "bt.currency";

const i18n = {
  locale: DEFAULT_LOCALE,
  currency: BASE_CURRENCY,
  rates: { USD: 1 },
  messages: {},
  fallback: {},
};

// Preferences are a per-viewer convenience; storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* not persisted */ }
}

function matchLocale(tags) {
  const codes = LOCALES.map((l) => l.code);
  for (const tag of tags) {
    if (!tag) continue;
    const exact = codes.find((c) => c.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const primary = tag.split("-")[0].toLowerCase();
    const partial = codes.find((c) => c.split("-")[0].toLowerCase() === primary);
    if (partial) return partial;
  }
  return null;
}

async function fetchMessages(code) {
  const res = await fetch(`locales/${code}.json`);
  if (!res.ok) throw new Error(`locale ${code}: HTTP ${res.status}`);
  return res.json();
}

function loadFont(code) {
  const family = LOCALE_FONTS[code];
  if (!family || document.querySelector(`link[data-locale-font="${code}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  link.dataset.localeFont = code;
  document.head.appendChild(link);
}

async function setLocale(code) {
  const target = LOCALES.some((l) => l.code === code) ? code : DEFAULT_LOCALE;
  if (!Object.keys(i18n.fallback).length) {
    i18n.fallback = await fetchMessages(DEFAULT_LOCALE);
  }
  try {
    i18n.messages = target === DEFAULT_LOCALE ? i18n.fallback : await fetchMessages(target);
    i18n.locale = target;
  } catch (err) {
    console.error(err);
    i18n.messages = i18n.fallback;
    i18n.locale = DEFAULT_LOCALE;
  }
  formatters.clear();
  const meta = LOCALES.find((l) => l.code === i18n.locale);
  document.documentElement.lang = i18n.locale;
  document.documentElement.dir = meta.dir || "ltr";
  loadFont(i18n.locale);
  writePref(PREF_LANG, i18n.locale);
}

function setCurrency(code) {
  i18n.currency = Object.hasOwn(i18n.rates, code) ? code : BASE_CURRENCY;
  formatters.clear();
  writePref(PREF_CURRENCY, i18n.currency);
}

async function initI18n() {
  try {
    const fx = await fetch("/api/fx").then((r) => r.json());
    if (fx && fx.rates) i18n.rates = fx.rates;
  } catch (err) {
    console.error("fx rates unavailable, showing USD:", err);
  }
  const lang = matchLocale([readPref(PREF_LANG), ...(navigator.languages || [navigator.language])]);
  await setLocale(lang || DEFAULT_LOCALE);
  setCurrency(readPref(PREF_CURRENCY) || BASE_CURRENCY);
}

// --- messages -------------------------------------------------------------
function lookup(key) {
  if (Object.hasOwn(i18n.messages, key)) return i18n.messages[key];
  if (Object.hasOwn(i18n.fallback, key)) return i18n.fallback[key];
  return key;
}

function t(key, params = {}) {
  let msg = lookup(key);
  if (msg && typeof msg === "object") {
    const n = Number(params.count ?? 0);
    const cat = formatter("plural", {}, () => new Intl.PluralRules(i18n.locale)).select(n);
    msg = msg[cat] ?? msg.other ?? "";
  }
  // Numeric params are formatted for the locale (digits, grouping); callers
  // pass pre-formatted strings for money and percentages.
  return String(msg).replace(/\{(\w+)\}/g, (m, name) => {
    if (!Object.hasOwn(params, name)) return m;
    const v = params[name];
    return typeof v === "number" ? num(v) : String(v);
  });
}

// Escaped variant for interpolating into innerHTML templates.
const th = (key, params) => esc(t(key, params));

// --- formatting -----------------------------------------------------------
// Intl formatter construction is comparatively slow and the UI re-renders
// every 2s, so formatters are cached per locale/currency (cleared on change).
const formatters = new Map();
function formatter(kind, opts, make) {
  const key = kind + "|" + JSON.stringify(opts);
  if (!formatters.has(key)) formatters.set(key, make());
  return formatters.get(key);
}

function currencyDigits(currency) {
  return formatter("digits:" + currency, {}, () =>
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits);
}

const LRI = "⁦", PDI = "⁩";

// In right-to-left locales a formatted amount is a left-to-right island in
// RTL text. Intl prefixes Arabic output with an RLM/ALM, and a Latin currency
// symbol ("US$", "JP¥") then gets reordered by the bidi algorithm into
// "$US" / "¥JP". Dropping the leading mark and wrapping the string in an LTR
// isolate keeps sign, digits and symbol together in reading order; trailing
// marks stay, since Arabic-script symbols such as "ر.س.‏" rely on them.
function num(n, opts = {}) {
  const s = formatter("num", opts, () => new Intl.NumberFormat(i18n.locale, opts)).format(n);
  return document.documentElement.dir === "rtl" ? LRI + s.replace(/^[‏؜]+/, "") + PDI : s;
}

const toDisplay = (usd) => Number(usd) * (i18n.rates[i18n.currency] ?? 1);

const fmt = {
  // Account money (cash, equity, P&L, notional, margin): converted, with the
  // currency's own symbol and minor units.
  money(usd, { signed = false } = {}) {
    const opts = { style: "currency", currency: i18n.currency, signDisplay: signed ? "exceptZero" : "auto" };
    return num(toDisplay(usd), opts);
  },
  // Unit prices without a symbol, for dense tables. At least two decimals so
  // small prices (sugar at $0.21) still move visibly in zero-decimal
  // currencies such as JPY or IDR.
  amount(usd, { signed = false } = {}) {
    const d = currencyDigits(i18n.currency);
    return num(toDisplay(usd), {
      minimumFractionDigits: d,
      maximumFractionDigits: Math.max(d, 2),
      signDisplay: signed ? "exceptZero" : "auto",
    });
  },
  // A unit price with the currency symbol (chart header, ticket, toasts).
  price(usd) {
    const d = currencyDigits(i18n.currency);
    return num(toDisplay(usd), {
      style: "currency",
      currency: i18n.currency,
      minimumFractionDigits: d,
      maximumFractionDigits: Math.max(d, 2),
    });
  },
  // Index futures are quoted in index points, which are not money and are
  // never converted.
  points(n, { signed = false } = {}) {
    return num(n, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: signed ? "exceptZero" : "auto" });
  },
  // A money value that must stay in USD regardless of display currency.
  usd(n) {
    return num(n, { style: "currency", currency: BASE_CURRENCY });
  },
  int(n) {
    return num(n, { maximumFractionDigits: 0 });
  },
  pct(n, { digits = 2, signed = true } = {}) {
    return num(Number(n) / 100, {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? "exceptZero" : "auto",
    });
  },
  compact(n) {
    return num(n, { notation: "compact", maximumFractionDigits: 2 });
  },
  time(ts) {
    return formatter("time", {}, () =>
      new Intl.DateTimeFormat(i18n.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })).format(ts);
  },
  secondsAgo(s) {
    return formatter("rtf", {}, () =>
      new Intl.RelativeTimeFormat(i18n.locale, { numeric: "always", style: "short" })).format(-s, "second");
  },
  currencyName(code) {
    try {
      return formatter("dn", {}, () => new Intl.DisplayNames(i18n.locale, { type: "currency" })).of(code) || code;
    } catch {
      return code;
    }
  },
};

// --- static markup ----------------------------------------------------------
// index.html marks translatable text with data-i18n="key" and attributes with
// data-i18n-<attr>="key" (placeholder, aria-label).
function applyStaticText(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  for (const attr of ["placeholder", "aria-label"]) {
    const data = "i18n" + attr.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase());
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach((el) => el.setAttribute(attr, t(el.dataset[data])));
  }
  document.title = t("meta.title");
}

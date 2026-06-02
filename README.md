# BunTrade — Multi-Asset Trading Platform (MVP)

A paper-trading platform built with the [Bun](https://bun.sh) runtime. It serves a
single-page trading dashboard backed by a simulated live market and a REST API for
trading **stocks, crypto, commodities and derivatives** against an in-memory portfolio.

> ⚠️ **This is a simulation.** Prices are randomly generated, no real money or
> brokerage is involved, and all state is held in memory (it resets on restart).
> It is a learning/demo MVP, not a real trading system.

## Features

- **Live market** — 33 instruments whose prices random-walk every 2 seconds, each with
  day open/high/low, volume and a rolling price history, across four asset classes:
  - **Stocks** (12 equities) and **Crypto** (BTC, ETH) — traded spot.
  - **Commodities** (10) — gold, silver, crude (WTI/Brent), natural gas, copper, and
    agricultural products (wheat, corn, coffee, sugar) — also traded spot.
  - **Derivatives** (9 futures) — metals, energy, grains and equity-index contracts.
- **Spot trading** — buy/sell instruments outright; orders fill instantly at the current
  price and are held long-only.
- **Derivatives trading** — cash-settled futures that trade on **margin** (leverage =
  1 ⁄ margin rate), can be held **long _or_ short**, and are **marked to market**
  continuously. Each contract controls a `multiplier` of the underlying, so notional =
  price × multiplier and only a fraction is locked as margin. Positions can be opened,
  added to, partially closed, fully closed, or flipped from one side to the other.
- **Trading dashboard** — asset-class tabs, a searchable market list with live
  sparklines, a price chart for the selected symbol, and a ticket that adapts to the
  instrument: buy/sell with an estimated cost for spot, or long/short with margin and
  notional for futures.
- **Paper portfolio** — a single account seeded with **$100,000**. Tracks cash, spot
  holdings (with average cost), open futures positions (entry, mark, margin, leverage,
  open P&L), margin used, and combined realized / unrealized P&L. Equity rolls up cash,
  spot value, locked margin and open derivative P&L.
- **No build step, no runtime dependencies** — vanilla JS/CSS front end served straight
  from `public/`; charts are hand-rendered SVG.

## Project Structure

```
bun-app
├── src
│   └── index.js          # Bun server: market simulation, portfolio, order engine, API
├── public
│   ├── index.html        # Dashboard markup
│   ├── app.js            # Front-end controller (polling, rendering, trading)
│   └── style.css         # Dark trading theme
├── tests
│   └── index.test.js     # API + trading-engine tests
├── package.json
└── README.md
```

## Getting Started

```sh
bun install
bun run src/index.js      # or: bun run dev   (hot reload)
```

The server starts on http://localhost:3000.

## API

| Method | Endpoint               | Description                                              |
| ------ | ---------------------- | -------------------------------------------------------- |
| GET    | `/api/health`          | Liveness probe — `{ "status": "ok" }`.                   |
| GET    | `/api/stocks`          | Spot instruments (equities, crypto, commodities) with price, change and sparkline. |
| GET    | `/api/stocks/:symbol`  | One instrument with full price `history` (case-insensitive). |
| GET    | `/api/futures`         | Futures contracts with `multiplier`, `marginRate`, `leverage`, `notional` and `marginPerContract`. |
| GET    | `/api/portfolio`       | Cash, holdings, futures positions, margin used, equity and realized/unrealized P&L. |
| GET    | `/api/orders`          | Executed orders (spot and futures), newest first.       |
| POST   | `/api/orders`          | Place a spot market order (buy/sell).                    |
| POST   | `/api/futures/orders`  | Open/add a futures position (long/short).                |
| POST   | `/api/futures/close`   | Close a futures position (all, or `contracts` of it).    |

### Placing a spot order

```sh
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{ "symbol": "AAPL", "side": "buy", "quantity": 10 }'
```

```json
{
  "order": { "id": 1, "kind": "spot", "symbol": "AAPL", "side": "buy", "quantity": 10, "price": 195.2, "total": 1952 },
  "portfolio": { "cash": 98048, "equity": 100000, "holdings": [ ... ], "positions": [] }
}
```

Spot orders are rejected with HTTP `400` for an unknown symbol, a futures symbol (use the
derivatives endpoints), an invalid side, a non-positive/fractional quantity, insufficient
funds (buy), or insufficient shares (sell).

### Trading a future

```sh
# Go long 2 crude-oil contracts (only the margin is locked, not the full notional)
curl -X POST http://localhost:3000/api/futures/orders \
  -H "Content-Type: application/json" \
  -d '{ "symbol": "CL", "direction": "long", "contracts": 2 }'

# Later, close one of them
curl -X POST http://localhost:3000/api/futures/close \
  -H "Content-Type: application/json" \
  -d '{ "symbol": "CL", "contracts": 1 }'
```

```json
{
  "order": { "id": 2, "kind": "future", "symbol": "CL", "action": "open", "direction": "long", "contracts": 2, "price": 78.6, "margin": 11004 },
  "portfolio": { "cash": 88996, "marginUsed": 11004, "derivativesPL": 0, "equity": 100000, "positions": [ { "symbol": "CL", "direction": "long", "contracts": 2, "entry": 78.6, "mark": 78.6, "leverage": 14, "margin": 11004, "unrealizedPL": 0 } ] }
}
```

Futures orders are rejected with HTTP `400` for an unknown contract, an invalid direction
(must be `long`/`short`), a non-positive/fractional contract count, or insufficient
margin. An order opposite an existing position offsets it (and may flip the side); a
close never flips. Auto-settlement at expiry is intentionally out of scope for this MVP.

## Testing

```sh
bun test
```

The suite covers static serving, directory-traversal protection, every API endpoint, the
spot order engine (fills, P&L bookkeeping, validation), commodities, and the derivatives
engine (margin locking, long/short, partial close, and the rejection paths).

## Vulnerability Scanning

This project includes **Trivy** scanning for Docker image vulnerabilities.

**Local scan** (requires Docker and Trivy):
```sh
./scan-image.sh              # Show summary
./scan-image.sh --strict     # Fail on HIGH/CRITICAL
./scan-image.sh --json       # Output JSON
```

**In CI**: the [`trivy-scan.yml`](.github/workflows/trivy-scan.yml) workflow
automatically scans the image on push to `main`, on PR, and on-demand. Results are
uploaded to GitHub's Security tab (SARIF format). The workflow runs the app's unit
tests first to ensure a good build before scanning.

## Continuous Integration

GitHub Actions installs dependencies, runs `bun test`, and verifies the server boots
on push/PR. See `.github/workflows/build.yaml`.

## Roadmap / non-goals

Out of scope for this MVP but natural next steps: persistence (DB), authentication and
multi-user accounts, limit/stop orders, an order book and partial fills, a real
market-data feed, options (calls/puts), futures auto-settlement and roll at expiry, and
margin calls / liquidation when equity falls below maintenance margin.

## Contributing

Issues and pull requests welcome.

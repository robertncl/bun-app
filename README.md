# BunTrade — Stock Trading Platform (MVP)

A paper-trading platform built with the [Bun](https://bun.sh) runtime. It serves a
single-page trading dashboard backed by a simulated live market and a REST API for
placing market orders against an in-memory portfolio.

> ⚠️ **This is a simulation.** Prices are randomly generated, no real money or
> brokerage is involved, and all state is held in memory (it resets on restart).
> It is a learning/demo MVP, not a real trading system.

## Features

- **Live market** — 14 instruments (equities + crypto) whose prices random-walk every
  2 seconds, each with day open/high/low, volume and a rolling price history.
- **Trading dashboard** — searchable market list with live sparklines, a price chart
  for the selected symbol, and a buy/sell ticket with an estimated cost.
- **Paper portfolio** — a single account seeded with **$100,000**. Tracks cash, holdings
  (with average cost), market value, and realized / unrealized P&L.
- **Market orders** — buy/sell fill instantly at the current price, with validation for
  funds, share count, symbol and quantity.
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
| GET    | `/api/stocks`          | All instruments with current price, change and sparkline.|
| GET    | `/api/stocks/:symbol`  | One instrument with full price `history` (case-insensitive). |
| GET    | `/api/portfolio`       | Cash, holdings, equity and realized/unrealized P&L.      |
| GET    | `/api/orders`          | Executed orders, newest first.                           |
| POST   | `/api/orders`          | Place a market order.                                    |

### Placing an order

```sh
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{ "symbol": "AAPL", "side": "buy", "quantity": 10 }'
```

```json
{
  "order": { "id": 1, "symbol": "AAPL", "side": "buy", "quantity": 10, "price": 195.2, "total": 1952 },
  "portfolio": { "cash": 98048, "equity": 100000, "holdings": [ ... ] }
}
```

Orders are rejected with HTTP `400` and an `{ "error": ... }` body for an unknown
symbol, an invalid side, a non-positive/fractional quantity, insufficient funds (buy),
or insufficient shares (sell).

## Testing

```sh
bun test
```

The suite covers static serving, directory-traversal protection, every API endpoint,
and the order engine (fills, P&L bookkeeping, and validation/rejection paths).

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
multi-user accounts, limit/stop orders, an order book and partial fills, and a real
market-data feed.

## Contributing

Issues and pull requests welcome.

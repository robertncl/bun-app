import { serve } from "bun";
import fs from "node:fs";
import path from "node:path";

// Mock Data Service
const STOCKS = {
  AAPL: { name: "Apple Inc.", price: 150.00, change: 0.5, history: [] },
  GOOGL: { name: "Alphabet Inc.", price: 2800.00, change: -1.2, history: [] },
  TSLA: { name: "Tesla, Inc.", price: 700.00, change: 2.3, history: [] },
  AMZN: { name: "Amazon.com, Inc.", price: 3300.00, change: 0.8, history: [] },
  MSFT: { name: "Microsoft Corporation", price: 290.00, change: 0.1, history: [] },
};

// Generate initial history
for (const symbol in STOCKS) {
  let price = STOCKS[symbol].price;
  for (let i = 0; i < 30; i++) {
    STOCKS[symbol].history.push(price);
    price = price * (1 + (Math.random() * 0.04 - 0.02)); // +/- 2%
  }
  STOCKS[symbol].history.reverse(); // Oldest first
}



export function startServer(port = 3000) {
  const server = serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // API Routes
      if (url.pathname.startsWith("/api")) {
        const headers = { "Content-Type": "application/json" };

        if (url.pathname === "/api/search") {
          const query = url.searchParams.get("q")?.toUpperCase() || "";
          const results = Object.keys(STOCKS)
            .filter(symbol => symbol.includes(query) || STOCKS[symbol].name.toUpperCase().includes(query))
            .map(symbol => ({ symbol, name: STOCKS[symbol].name }));
          return new Response(JSON.stringify(results), { headers });
        }

        if (url.pathname.startsWith("/api/quote/")) {
          const symbol = url.pathname.split("/").pop()?.toUpperCase();
          if (symbol && STOCKS[symbol]) {
            // Simulate live update
            const change = (Math.random() * 2 - 1); // +/- 1
            STOCKS[symbol].price += change;
            STOCKS[symbol].change = (change / STOCKS[symbol].price) * 100;
            STOCKS[symbol].history.shift();
            STOCKS[symbol].history.push(STOCKS[symbol].price);

            return new Response(JSON.stringify({
              symbol,
              ...STOCKS[symbol]
            }), { headers });
          }
          return new Response("Not Found", { status: 404 });
        }

        if (url.pathname.startsWith("/api/history/")) {
          const symbol = url.pathname.split("/").pop()?.toUpperCase();
          if (symbol && STOCKS[symbol]) {
            return new Response(JSON.stringify(STOCKS[symbol].history), { headers });
          }
          return new Response("Not Found", { status: 404 });
        }

        return new Response("Not Found", { status: 404 });
      }

      // Static File Serving
      let filePath = path.join("public", url.pathname === "/" ? "index.html" : url.pathname);

      // Security check to prevent directory traversal
      if (!filePath.startsWith("public")) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }

      return new Response("Not Found", { status: 404 });
    },
  });
  return server;
}

if (import.meta.main) {
  const server = startServer(3000);
  console.log(`Listening on http://localhost:${server.port} ...`);
}


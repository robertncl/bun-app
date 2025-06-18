// This file is the entry point of the application. It initializes the Bun server and sets up middleware and routes.

import { serve } from "bun";
import { calculator } from "./calculator.js";

function parseQuery(url) {
  const params = {};
  for (const [key, value] of new URL(url).searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

export function startServer(port = 3000) {
  return serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const params = parseQuery(req.url);
      const a = parseFloat(params.a);
      const b = parseFloat(params.b);

      function json(data) {
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (["/add", "/subtract", "/multiply", "/divide"].includes(url.pathname)) {
        const op = url.pathname.slice(1);
        return json(calculator(op, a, b));
      }

      return new Response(
        "Calculator API. Use /add, /subtract, /multiply, or /divide with query params a and b.",
        { status: 404 }
      );
    },
  });
}

if (import.meta.main) {
  startServer();
  console.log("Calculator server is running on http://localhost:3000");
}

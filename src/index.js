// This file is the entry point of the application. It initializes the Bun server and sets up middleware and routes.

import { serve } from "bun";

function parseQuery(url) {
  const params = {};
  for (const [key, value] of new URL(url).searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

const server = serve({
  port: 3000,
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

    if (url.pathname === "/add") {
      if (isNaN(a) || isNaN(b)) return json({ error: "Invalid numbers" });
      return json({ result: a + b });
    }
    if (url.pathname === "/subtract") {
      if (isNaN(a) || isNaN(b)) return json({ error: "Invalid numbers" });
      return json({ result: a - b });
    }
    if (url.pathname === "/multiply") {
      if (isNaN(a) || isNaN(b)) return json({ error: "Invalid numbers" });
      return json({ result: a * b });
    }
    if (url.pathname === "/divide") {
      if (isNaN(a) || isNaN(b)) return json({ error: "Invalid numbers" });
      if (b === 0) return json({ error: "Division by zero" });
      return json({ result: a / b });
    }

    return new Response(
      "Calculator API. Use /add, /subtract, /multiply, or /divide with query params a and b.",
      { status: 404 }
    );
  },
});

console.log("Calculator server is running on http://localhost:3000");
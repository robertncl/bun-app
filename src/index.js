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
      // Only allow GET requests
      if (req.method !== 'GET') {
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { 
            status: 405,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const url = new URL(req.url);
      const params = parseQuery(req.url);
      const a = parseFloat(params.a);
      const b = parseFloat(params.b);

      function json(data, status = 200) {
        return new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (["/add", "/subtract", "/multiply", "/divide"].includes(url.pathname)) {
        const op = url.pathname.slice(1);
        const result = calculator(op, a, b);
        
        // Return appropriate status code based on result
        if (result.error) {
          return json(result, 400);
        }
        return json(result);
      }

      return new Response(
        JSON.stringify({ 
          error: 'Not found',
          message: 'Calculator API. Use /add, /subtract, /multiply, or /divide with query params a and b.'
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    },
  });
}

if (import.meta.main) {
  startServer();
  console.log("Calculator server is running on http://localhost:3000");
}

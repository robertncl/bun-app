// This file is the entry point of the application. It initializes the Bun server and sets up middleware and routes.

import { serve } from "bun";
import { calculator } from "./calculator.js";
import { evaluateExpression } from "./evaluator.js";

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

      // Handle CORS preflight and restrict methods
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "600"
          }
        });
      }
      if (req.method !== 'GET') {
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { 
            status: 405,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      const params = parseQuery(req.url);
      const a = parseFloat(params.a);
      const b = parseFloat(params.b);

      function json(data, status = 200) {
        return new Response(JSON.stringify(data), {
          status,
          headers: {
            "Content-Type": "application/json",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
            "Access-Control-Allow-Origin": "*"
          },
        });
      }

      // Serve static files from public/ and root index
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const file = Bun.file("public/index.html");
        if (file.size > 0) {
          return new Response(file, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }

      if (url.pathname.startsWith("/public/") || url.pathname.startsWith("/assets/")) {
        const fsPath = url.pathname.replace(/^\/(public|assets)\//, "public/");
        const file = Bun.file(fsPath);
        if (file.size > 0) {
          // very basic content type detection
          const type = fsPath.endsWith('.css') ? 'text/css' : fsPath.endsWith('.js') ? 'text/javascript' : fsPath.endsWith('.png') ? 'image/png' : fsPath.endsWith('.jpg') || fsPath.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream';
          return new Response(file, { headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } });
        }
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

      if (url.pathname === '/calculate') {
        const expr = params.expr || '';
        const deg = params.deg === '1' || params.deg === 'true';
        const result = evaluateExpression(expr, { deg });
        if (result.error) return json(result, 400);
        return json(result);
      }

      return new Response(
        JSON.stringify({ 
          error: 'Not found',
          message: 'Calculator API. Use /add, /subtract, /multiply, or /divide with query params a and b.'
        }),
        { status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    },
  });
}

if (import.meta.main) {
  startServer();
  console.log("Calculator server is running on http://localhost:3000");
}

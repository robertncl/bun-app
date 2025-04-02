// This file is the entry point of the application. It initializes the Bun server and sets up middleware and routes.

import { serve } from "bun";
import { handleRequest } from "./routes/api";

const server = serve({
  port: 3000,
  fetch: handleRequest
});

console.log("Server is running on http://localhost:3000");
FROM oven/bun:1.4.3-alpine@sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373 AS deps

WORKDIR /app

# Copy only dependency manifests first for better caching
COPY package.json bun.lock ./

# Runtime needs no packages from npm (the server only uses Bun built-ins), so
# skip devDependencies like Playwright and TypeScript to keep them out of the image.
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.3-alpine@sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy node_modules from deps stage and the application source
# (.dockerignore keeps .env, .git, host node_modules etc. out of the context)
COPY --from=deps /app/node_modules /app/node_modules
COPY . ./

# Expose app port
EXPOSE 3000

# Health check via Bun itself, so the image doesn't need curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

USER app

CMD ["bun", "run", "src/index.js"]

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS deps

WORKDIR /app

# Copy only dependency manifests first for better caching
COPY package.json bun.lock ./

# Install production and dev dependencies
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy node_modules from deps stage and the application source
COPY --from=deps /app/node_modules /app/node_modules
COPY . ./

# Expose app port
EXPOSE 3000

# Health check (optional but helpful)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

USER app

CMD ["bun", "run", "src/index.js"]
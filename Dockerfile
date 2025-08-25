FROM oven/bun:1.2.20-alpine AS deps

WORKDIR /app

# Copy only dependency manifests first for better caching
COPY package.json bun.lockb ./

# Install production and dev dependencies
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.20-alpine AS runner

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
  CMD curl -fsS http://127.0.0.1:3000/invalid || exit 1

USER app

CMD ["bun", "run", "src/index.js"]
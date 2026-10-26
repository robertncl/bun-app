FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS deps

WORKDIR /app

# Copy only dependency manifests first for better caching
COPY package.json bun.lock ./

# Runtime needs no packages from npm (the server only uses Bun built-ins), so
# skip devDependencies like Playwright and TypeScript to keep them out of the image.
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS runner

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

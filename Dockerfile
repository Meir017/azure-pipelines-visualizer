# ── Stage 1: Install dependencies and build web ───────────────────────
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json

RUN bun install

COPY tsconfig.base.json ./
COPY packages/core/src/ packages/core/src/
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/web/src/ packages/web/src/
COPY packages/web/index.html packages/web/index.html
COPY packages/web/tsconfig.json packages/web/tsconfig.json
COPY packages/web/vite.config.ts packages/web/vite.config.ts

RUN cd packages/web && bun x --bun vite build

# ── Stage 3: Production image ─────────────────────────────────────────
FROM oven/bun:1-slim AS runtime

WORKDIR /app/packages/server

# Copy node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/core/node_modules /app/packages/core/node_modules
COPY --from=build /app/packages/server/node_modules /app/packages/server/node_modules

# Copy workspace package.json files (needed for workspace resolution)
COPY package.json /app/package.json
COPY packages/core/package.json /app/packages/core/package.json
COPY packages/server/package.json /app/packages/server/package.json

# Copy source code (bun runs TypeScript directly)
COPY packages/core/src/ /app/packages/core/src/
COPY packages/server/src/ /app/packages/server/src/

# Copy built web frontend into public/ for static serving
COPY --from=build /app/packages/web/dist/ ./public/

# Copy the config schema so users can reference it
COPY apv.config.schema.json /app/apv.config.schema.json

ENV NODE_ENV=production

EXPOSE 3001

CMD ["bun", "src/index.ts"]

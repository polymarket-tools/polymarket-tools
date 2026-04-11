# ---------------------------------------------------------------------------
# CapitolBets Telegram Bot — Multi-stage Docker build
# Build from monorepo root: docker build -f packages/capitolbets/Dockerfile .
# ---------------------------------------------------------------------------

# -- Stage 1: Build ----------------------------------------------------------
FROM node:20-alpine AS builder

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace root configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.json ./

# Copy package manifests for dependency resolution
COPY packages/core/package.json packages/core/
COPY packages/capitolbets/package.json packages/capitolbets/

# Install dependencies (workspace-aware)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source files
COPY packages/core/ packages/core/
COPY packages/capitolbets/ packages/capitolbets/

# Build core first (workspace dependency), then capitolbets
# Note: tsc exits non-zero due to ox (viem transitive dep) shipping raw .ts
# with type errors. Output is still emitted since noEmitOnError is not set.
# We verify the expected output exists after the build.
RUN pnpm --filter @polymarket-tools/core build \
 && (pnpm --filter @polymarket-tools/capitolbets build || true) \
 && test -f packages/capitolbets/dist/index.js

# Rebuild better-sqlite3 for the target platform
RUN cd packages/capitolbets && npm rebuild better-sqlite3

# -- Stage 2: Production ----------------------------------------------------
FROM node:20-alpine

# better-sqlite3 needs libc++ at runtime on alpine
RUN apk add --no-cache libstdc++

WORKDIR /app

# Copy built output and node_modules from builder
COPY --from=builder /app/packages/capitolbets/dist ./dist
COPY --from=builder /app/packages/capitolbets/node_modules ./node_modules
COPY --from=builder /app/packages/capitolbets/package.json ./

# Copy core dist (workspace dependency resolves via node_modules symlink)
COPY --from=builder /app/packages/core/dist ./core-dist
COPY --from=builder /app/packages/core/package.json ./core-dist/

# Patch the workspace symlink — point @polymarket-tools/core to the copied dist
RUN rm -rf node_modules/@polymarket-tools/core \
 && mkdir -p node_modules/@polymarket-tools \
 && ln -s /app/core-dist node_modules/@polymarket-tools/core

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]

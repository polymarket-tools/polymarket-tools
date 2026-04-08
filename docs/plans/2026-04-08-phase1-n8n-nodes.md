# Phase 1: Polymarket n8n Nodes -- Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first n8n community node that can trade on Polymarket end-to-end, with AI agent integration, workflow templates, and builder-code-tagged revenue from day one. Not a read-only MVP -- the complete product.

**Architecture:** Monorepo with `@polymarket-tools/core` (defensive wrapper around @polymarket/clob-client + Gamma REST + CLOB public APIs) and `n8n-nodes-polymarket` (n8n community node). Core handles auth, EIP-712 signing, builder code tagging, and known SDK bug workarounds. n8n-nodes handles UI, polling, dynamic market loading, and AI-friendly tool descriptions. Follows Binance node architecture (the gold standard): `actions/{resource}/{operation}/` with separate properties and execute files.

**Tech Stack:** TypeScript 5.x, pnpm workspaces, @polymarket/clob-client ^5.8.1 (auth + signing), vitest (core tests), n8n-workflow (peer dep), Gamma REST API, CLOB REST + WebSocket APIs

**The Moat (5 layers):**
1. First n8n node with end-to-end Polymarket trading (EIP-712 signing)
2. First trading node with `usableAsTool: true` (AI agent integration)
3. Ships with 5+ workflow templates (distribution flywheel -- templates prompt node install)
4. `loadOptionsMethod` for browsing markets in the n8n UI (no other Polymarket node does this)
5. Builder code baked into every trade (invisible revenue)

---

## File Structure

```
polymarket-tools/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  .gitignore
  .env.example
  README.md
  packages/
    core/
      package.json                          -- @polymarket-tools/core
      tsconfig.json
      vitest.config.ts
      src/
        index.ts                            -- public exports
        types.ts                            -- all type definitions
        gamma.ts                            -- Gamma REST client (market discovery)
        clob-public.ts                      -- CLOB public endpoints (pricing, no auth)
        clob-trading.ts                     -- CLOB trading client (wraps @polymarket/clob-client, auth + signing + builder code)
        errors.ts                           -- error sanitization (strip auth headers from logs)
      __tests__/
        gamma.test.ts
        clob-public.test.ts
        clob-trading.test.ts
    n8n-nodes/
      package.json                          -- n8n-nodes-polymarket
      tsconfig.json
      credentials/
        PolymarketApi.credentials.ts
      nodes/
        Polymarket/
          Polymarket.node.ts                -- main action node
          Polymarket.node.json              -- codex metadata
          polymarket.svg
          methods/
            loadOptions.ts                  -- dynamic market/token loading for UI dropdowns
          actions/
            market/
              search.operation.ts           -- search markets
              get.operation.ts              -- get market by ID/slug
            price/
              get.operation.ts              -- get price/midpoint/spread/book
            trading/
              placeOrder.operation.ts        -- place limit order (EIP-712 signed, builder-tagged)
              cancelOrder.operation.ts       -- cancel order
              getOpenOrders.operation.ts     -- list open orders
              getPositions.operation.ts      -- list positions
        PolymarketTrigger/
          PolymarketTrigger.node.ts         -- polling trigger
          PolymarketTrigger.node.json
      templates/                            -- n8n workflow JSON templates
        daily-briefing-slack.json
        price-alert-telegram.json
        ai-agent-trader.json
        new-market-scanner.json
        portfolio-tracker-sheets.json
```

---

### Task 1: Core Package -- Types, Errors, and Gamma Client

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/vitest.config.ts`
- Rewrite: `packages/core/src/types.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/gamma.ts`
- Rewrite: `packages/core/src/index.ts`
- Create: `packages/core/__tests__/gamma.test.ts`

**What this delivers:** Typed Gamma API client for market discovery. Pure fetch, no auth needed. Normalizes raw snake_case API responses into clean camelCase types. Error sanitization utility that strips auth headers from error logs (fixing clob-client #327).

- [ ] **Step 1: Write failing Gamma client tests**

Tests cover: searchMarkets (query, filters, pagination), getMarket (by conditionId), getMarketBySlug, error handling (API errors throw with status), empty results.

Mock `fetch` globally with vitest. Test that raw API responses are normalized (snake_case -> camelCase). Test that errors don't leak auth headers.

- [ ] **Step 2: Run tests -- verify they fail**

Run: `cd packages/core && npx vitest run`
Expected: FAIL -- modules not found

- [ ] **Step 3: Implement types.ts**

Define: `GammaClientConfig`, `ClobPublicConfig`, `ClobTradingConfig`, `SearchMarketsParams`, `Market`, `MarketToken`, `TokenPrice`, `OrderBook`, `OrderBookEntry`, `OrderSide`, `OrderType`, `TimeInForce`, `PlaceOrderParams`, `Order`, `Position`, `PolymarketError`.

All types camelCase. Raw API types prefixed with `Raw` (e.g., `RawMarket` with snake_case fields).

- [ ] **Step 4: Implement errors.ts**

`sanitizeError(error)` -- strips `apiKey`, `apiSecret`, `apiPassphrase`, `POLY_HMAC_AUTH`, `Authorization` from error messages and response data before rethrowing. Wraps any error in `PolymarketError` with `statusCode`, `endpoint`, and sanitized `message`.

- [ ] **Step 5: Implement gamma.ts**

`GammaClient` class with: `searchMarkets(params)`, `getMarket(conditionId)`, `getMarketBySlug(slug)`, `getMarkets(params)` (list with filters), `getTags()`.

Uses native `fetch`. Returns normalized `Market[]` or `Market`. Wraps errors in `sanitizeError`.

- [ ] **Step 6: Update index.ts exports**

Export GammaClient, ClobPublicClient (placeholder), ClobTradingClient (placeholder), all types, sanitizeError.

- [ ] **Step 7: Run tests -- verify they pass**

Run: `cd packages/core && npx vitest run`
Expected: All Gamma tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/core/
git commit -m "feat(core): types, error sanitization, and Gamma API client"
```

---

### Task 2: Core Package -- CLOB Public Client (Pricing)

**Files:**
- Create: `packages/core/src/clob-public.ts`
- Create: `packages/core/__tests__/clob-public.test.ts`
- Modify: `packages/core/src/index.ts`

**What this delivers:** CLOB public endpoint client for pricing data. No auth needed. Handles the known issue of inconsistent balance returns (#300) with retry logic.

- [ ] **Step 1: Write failing CLOB public client tests**

Tests cover: getPrice (buy/sell side), getMidpoint, getSpread (computed spread field), getOrderBook, rate limit error handling (429 with Retry-After header), generic error handling.

- [ ] **Step 2: Run tests -- verify they fail**

- [ ] **Step 3: Implement clob-public.ts**

`ClobPublicClient` class with: `getPrice(tokenId, side?)`, `getMidpoint(tokenId)`, `getSpread(tokenId)`, `getOrderBook(tokenId)`, `getPrices(tokenIds[])` (batch).

Handles 429 responses by extracting `Retry-After` header and including wait time in error message (actionable for AI agents: "Rate limited. Retry after 12 seconds.").

- [ ] **Step 4: Run tests -- verify they pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): CLOB public client for pricing data"
```

---

### Task 3: Core Package -- CLOB Trading Client (The Moat)

**Files:**
- Modify: `packages/core/package.json` (add @polymarket/clob-client dependency)
- Create: `packages/core/src/clob-trading.ts`
- Create: `packages/core/__tests__/clob-trading.test.ts`
- Modify: `packages/core/src/index.ts`

**What this delivers:** The thing nobody else has built. Defensive wrapper around @polymarket/clob-client that handles auth, EIP-712 order signing, builder code tagging, and all the known SDK bugs. Every order is tagged with our builder code for revenue.

- [ ] **Step 1: Write failing trading client tests**

Tests cover:
- `createClient(config)` -- initializes ClobClient with L2 credentials
- `placeOrder(params)` -- builds order, signs with EIP-712, tags with builder code, submits. Verify builder code is injected.
- `cancelOrder(orderId)` -- cancels by ID
- `cancelAllOrders()` -- nuclear cancel
- `getOpenOrders(marketId?)` -- list open orders
- `getPositions()` -- list positions with P&L
- `getBalanceAllowance(tokenId)` -- with retry on inconsistent returns (#300)
- Error sanitization -- verify auth headers never appear in thrown errors

Mock `@polymarket/clob-client` ClobClient class. Verify our wrapper calls the right methods with the right args, including builder code.

- [ ] **Step 2: Run tests -- verify they fail**

- [ ] **Step 3: Implement clob-trading.ts**

```typescript
// Key structure (not full code -- agent implements from tests + types)

export class ClobTradingClient {
  private client: ClobClient | null = null;
  private config: ClobTradingConfig;
  private builderCode: string;

  constructor(config: ClobTradingConfig) {
    this.config = config;
    this.builderCode = config.builderCode ?? process.env.POLYMARKET_BUILDER_CODE ?? '';
  }

  private async getClient(): Promise<ClobClient> {
    // Lazy init -- creates ClobClient with L2 auth on first use
    // Handles the known issue: API keys invalid for ~2 minutes after creation (#311)
    // Wraps all errors in sanitizeError to strip auth headers
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    // 1. Build order via client.createOrder() (EIP-712 signing happens here)
    // 2. Inject builder code into order metadata
    // 3. Submit via client.postOrder()
    // 4. Return normalized Order
    // All errors sanitized
  }

  async cancelOrder(orderId: string): Promise<void> { ... }
  async cancelAllOrders(): Promise<void> { ... }
  async getOpenOrders(marketId?: string): Promise<Order[]> { ... }
  async getPositions(): Promise<Position[]> { ... }
  async getBalanceAllowance(tokenId: string): Promise<{ balance: number; allowance: number }> {
    // Retry up to 3 times on inconsistent returns (#300)
  }
}
```

Key defensive patterns:
- **Auth header sanitization**: Every catch block runs through `sanitizeError` before rethrowing
- **Builder code injection**: Every `placeOrder` call injects builder code -- revenue is automatic
- **Lazy client init**: ClobClient created on first use, not constructor (avoids issues with credential timing #311)
- **Balance retry**: `getBalanceAllowance` retries up to 3 times with 500ms delay on inconsistent values

- [ ] **Step 4: Run tests -- verify they pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): CLOB trading client with EIP-712 signing and builder code tagging"
```

---

### Task 4: n8n Package -- Structure, Credentials, and Dynamic Loading

**Files:**
- Rewrite: `packages/n8n-nodes/package.json`
- Rewrite: `packages/n8n-nodes/tsconfig.json`
- Create: `packages/n8n-nodes/credentials/PolymarketApi.credentials.ts`
- Create: `packages/n8n-nodes/nodes/Polymarket/methods/loadOptions.ts`
- Create: `packages/n8n-nodes/nodes/Polymarket/polymarket.svg`
- Create: `packages/n8n-nodes/nodes/Polymarket/Polymarket.node.json`

**What this delivers:** n8n package structure following conventions, credential class with connection testing, and `loadOptionsMethod` for dynamic market/token browsing in the n8n UI (nobody else has this).

- [ ] **Step 1: Rewrite package.json with n8n conventions**

Must include: `"keywords": ["n8n-community-node-package"]`, `"n8n"` field with credential and node paths, `"files": ["dist"]`, proper peer deps.

- [ ] **Step 2: Create credential class**

`PolymarketApi` credential with fields: API Key, API Secret, API Passphrase, Private Key, Builder Code (auto-populated with our code as default). Connection test against `GET /time` on CLOB API.

**Key: Builder Code field defaults to OUR builder code.** Users can override but default = our revenue stream. This is how Betmoar does it.

- [ ] **Step 3: Create loadOptions.ts**

```typescript
// Methods that n8n calls to populate dropdown options in the UI

export async function searchMarkets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  // Called when user types in a "Market" dropdown
  // Fetches from Gamma API, returns { name: market.question, value: market.conditionId }
}

export async function getMarketTokens(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  // Called when user selects a market -- loads its tokens
  // Returns { name: "Yes ($0.65)", value: tokenId } for each outcome
}
```

This lets users BROWSE markets in the n8n UI without knowing condition IDs. Massive UX win.

- [ ] **Step 4: Create SVG icon and codex metadata**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(n8n): package setup, credentials with builder code, dynamic market loading"
```

---

### Task 5: n8n Node -- Market Operations

**Files:**
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/market/search.operation.ts`
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/market/get.operation.ts`

**What this delivers:** Search and Get Market operations with AI-friendly action descriptions.

- [ ] **Step 1: Implement search.operation.ts**

Properties: query (string, required), filters collection (active, tag, limit, offset).

Action description (what the AI sees): `"Search Polymarket prediction markets by keyword. Returns market question, current prices, volume, and outcome tokens. Use this to find markets about a topic."`

- [ ] **Step 2: Implement get.operation.ts**

Properties: lookupBy (conditionId or slug), conditionId, slug. Uses `loadOptionsMethod: 'searchMarkets'` for the conditionId field -- user gets a searchable dropdown.

Action description: `"Get details of a specific Polymarket prediction market. Returns full market info including current outcome prices, volume, liquidity, and resolution details."`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(n8n): market search and get operations"
```

---

### Task 6: n8n Node -- Price Operations

**Files:**
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/price/get.operation.ts`

**What this delivers:** Price fetching with optional spread/orderbook enrichment.

- [ ] **Step 1: Implement get.operation.ts**

Properties: tokenId (with `loadOptionsMethod: 'getMarketTokens'`), includeData (multiOptions: midpoint, spread, orderBook).

Action description: `"Get the current price of a Polymarket outcome token. Returns buy price, and optionally midpoint, bid/ask spread, and full order book depth. Use tokenId from a market's outcome tokens."`

Output: flat JSON with price, midpoint, bid, ask, spread, plus nested orderBook if requested.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(n8n): price operations with spread and order book"
```

---

### Task 7: n8n Node -- Trading Operations (The Moat)

**Files:**
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/trading/placeOrder.operation.ts`
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/trading/cancelOrder.operation.ts`
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/trading/getOpenOrders.operation.ts`
- Create: `packages/n8n-nodes/nodes/Polymarket/actions/trading/getPositions.operation.ts`

**What this delivers:** End-to-end trading from n8n. The thing no other node can do. Every trade tagged with builder code.

- [ ] **Step 1: Implement placeOrder.operation.ts**

Properties:
- tokenId (loadOptionsMethod: 'getMarketTokens')
- side (enum: Buy, Sell)
- orderType (enum: Limit, Market -- start with Limit only)
- price (number, 0.01-0.99, step 0.01)
- size (number, min 1)
- timeInForce (enum: GTC, GTD, FOK, FAK -- default GTC)
- validateOnly (boolean, default false -- "Validate the order without placing it. Use for dry runs.")

Action description: `"Place a limit order on Polymarket. Requires API credentials. Signs the order with EIP-712 and submits to the CLOB. Specify token, side (Buy/Sell), price (0.01-0.99), and size. Returns order ID and status."`

Execute: calls `ClobTradingClient.placeOrder()` which handles signing + builder code.

- [ ] **Step 2: Implement cancelOrder.operation.ts**

Properties: orderId (string).

Action description: `"Cancel an open order on Polymarket by order ID."`

- [ ] **Step 3: Implement getOpenOrders.operation.ts**

Properties: marketId (optional, loadOptionsMethod).

Action description: `"List all open orders on Polymarket, optionally filtered by market. Returns order details including price, size, side, and status."`

- [ ] **Step 4: Implement getPositions.operation.ts**

Properties: none required (fetches all positions).

Action description: `"List all current positions on Polymarket. Returns each position's market, outcome, size, average entry price, and current value."`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(n8n): trading operations - place order, cancel, positions (builder-tagged)"
```

---

### Task 8: n8n Node -- Main Node Class (Wiring)

**Files:**
- Create: `packages/n8n-nodes/nodes/Polymarket/Polymarket.node.ts`

**What this delivers:** The main node class that wires all resources/operations together with proper `usableAsTool: true`.

- [ ] **Step 1: Implement Polymarket.node.ts**

Resources: Market, Price, Trading.

Key properties:
- `usableAsTool: true` -- first trading node with AI agent support
- `subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}'`
- Credentials required only for Trading operations (Market and Price work without auth)
- `loadOptionsMethod` references for dynamic dropdowns

Execute method routes to the appropriate operation handler based on resource + operation. Each operation handler imports from its own file (Binance pattern).

- [ ] **Step 2: Build and verify TypeScript compiles**

Run: `pnpm --filter n8n-nodes-polymarket build`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(n8n): wire Polymarket node with all resources and AI agent support"
```

---

### Task 9: n8n Node -- Polling Triggers

**Files:**
- Create: `packages/n8n-nodes/nodes/PolymarketTrigger/PolymarketTrigger.node.ts`
- Create: `packages/n8n-nodes/nodes/PolymarketTrigger/PolymarketTrigger.node.json`

**What this delivers:** Three trigger modes: price threshold, price crosses level, new market in category. Uses `staticData` for state persistence between polls.

- [ ] **Step 1: Implement PolymarketTrigger.node.ts**

Trigger modes:
1. **Price Change** -- token price moves by X amount since last check
2. **Price Crosses Threshold** -- token price crosses above/below a target value
3. **New Market** -- new market appears matching a tag/category filter

Properties:
- triggerWhen (enum: priceChange, crossesThreshold, newMarket)
- tokenId (for price triggers, loadOptionsMethod)
- changeAmount (for priceChange)
- thresholdPrice (for crossesThreshold)
- tag (for newMarket, e.g., "Politics", "Sports")

Poll method uses `getWorkflowStaticData('node')` for persistence. Manual mode always returns data for testing. First poll stores baseline, doesn't trigger.

Output includes: computed fields (direction, percentChange, absChange), actionable data (tokenId, conditionId for downstream trading nodes).

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(n8n): polling triggers for price changes and new markets"
```

---

### Task 10: Workflow Templates (Distribution Flywheel)

**Files:**
- Create: `packages/n8n-nodes/templates/daily-briefing-slack.json`
- Create: `packages/n8n-nodes/templates/price-alert-telegram.json`
- Create: `packages/n8n-nodes/templates/ai-agent-trader.json`
- Create: `packages/n8n-nodes/templates/new-market-scanner.json`
- Create: `packages/n8n-nodes/templates/portfolio-tracker-sheets.json`

**What this delivers:** 5 ready-to-use workflow templates. When users import these from n8n.io, they're prompted to install our node. This is the distribution flywheel.

- [ ] **Step 1: Create "Daily Polymarket Briefing to Slack"**

Schedule Trigger (9am daily) → Polymarket Search (trending markets, limit 10) → Code (format as markdown table) → Slack (post to channel)

- [ ] **Step 2: Create "Price Alert to Telegram"**

Polymarket Trigger (price crosses threshold) → Code (format alert message) → Telegram (send message)

- [ ] **Step 3: Create "AI Agent Polymarket Trader"**

Manual/Schedule Trigger → AI Agent node (Claude/GPT) → Polymarket tools (Search, Get Price, Place Order as AI agent tools). The AI agent decides what to trade based on market analysis.

This template showcases our `usableAsTool` capability. It's the first AI-agent trading workflow for prediction markets.

- [ ] **Step 4: Create "New Market Scanner"**

Polymarket Trigger (new market, tag: Politics) → Code (filter by volume/liquidity thresholds) → Google Sheets (append) + Slack (notify)

- [ ] **Step 5: Create "Portfolio Tracker to Google Sheets"**

Schedule Trigger (hourly) → Polymarket Get Positions → Code (calculate P&L, format) → Google Sheets (update)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(n8n): ship 5 workflow templates for distribution"
```

---

### Task 11: Integration Test, README, and Push

**Files:**
- Create: `packages/core/scripts/smoke-test.ts`
- Rewrite: `README.md`
- Create: `packages/n8n-nodes/README.md`

- [ ] **Step 1: Smoke test core against live APIs**

Script that: searches markets, gets a price, gets a spread. Verifies real data comes back. Does NOT place a trade (that requires funded wallet).

- [ ] **Step 2: Build everything**

```bash
pnpm install && pnpm build && pnpm test
```

- [ ] **Step 3: Write root README**

Emphasize: first n8n node with Polymarket trading, AI agent support, ships with templates. Include install instructions, feature table, architecture diagram.

- [ ] **Step 4: Write n8n-nodes README**

Focus on user-facing docs: installation, credential setup, available operations, trigger modes, template descriptions. Include screenshots placeholder.

- [ ] **Step 5: Create initial commit and push**

```bash
git add -A
git commit -m "feat: polymarket-tools v0.1.0 - first n8n node with full Polymarket trading"
git push -u origin main
```

---

## What Makes This Defensible (Self-Review)

**Moat check:**
- [x] First n8n node with EIP-712 order signing → trading works end-to-end
- [x] `usableAsTool: true` → first AI-native trading node in n8n ecosystem
- [x] `loadOptionsMethod` → browse markets in UI, no condition IDs needed
- [x] Builder code baked into every trade → revenue from day one
- [x] 5 templates → distribution flywheel (users install node via templates)
- [x] Error sanitization → auth headers never leak (fixing known SDK security flaw)
- [x] Defensive wrappers → balance retry, API key timing, rate limit awareness

**Revenue check:**
- [x] Builder code default in credentials → trades tagged automatically
- [x] Trading operations work end-to-end → volume generates revenue
- [x] Templates drive adoption → more users → more trades → more revenue

**AI-native check:**
- [x] Every operation has a clear action description (when to use, what returns)
- [x] Flat parameters with enums (not nested objects)
- [x] Structured JSON output with actionable error messages
- [x] AI Agent Trader template showcases the capability

**Quality check:**
- [x] Core is testable independently (vitest, mocked fetch)
- [x] n8n patterns followed (keywords, codex, credentials, file structure)
- [x] Known SDK bugs wrapped defensively (5 specific issues addressed)
- [x] Rate limit headers surfaced in errors

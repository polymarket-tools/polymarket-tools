# polymarket-tools

**[polymarket-tools.github.io/polymarket-tools](https://polymarket-tools.github.io/polymarket-tools/)** -- Install guide, templates, Claude prompts, and FAQ.

Open-source n8n community node that brings the full Polymarket prediction market API into workflow automation. Search markets, track whale wallets, get real-time pricing, place EIP-712 signed orders, and build AI-powered trading agents. 12 operations, 3 triggers, 15 workflow templates. Free.

Built for the [Polymarket Builder Program](https://builders.polymarket.com).

## What This Is

polymarket-tools connects n8n to Polymarket's Gamma API (market discovery), CLOB API (pricing and trading), and Data API (leaderboard, wallet positions, trade history). It handles EIP-712 order signing via a viem WalletClient, wraps known SDK quirks defensively, and exposes everything as n8n actions and triggers.

Every operation that reads market data, pricing, or wallet information works without credentials. The Polymarket Data API is fully public: you can look up any trader's positions, trade history, and P&L with just their wallet address. The leaderboard ranks every trader by profit. This transparency is what makes Polymarket uniquely automatable.

Trading operations (placing and canceling orders) require Polymarket CLOB API credentials and a wallet private key for EIP-712 signing. The node handles the full order lifecycle: build, sign, submit, track, cancel.

Both nodes support `usableAsTool`, making them available as tools inside n8n's AI Agent node. Build autonomous agents that search markets, analyze prices, and execute trades.

## What It Does

### Polymarket Node (Actions)

| Resource | Operation | Description |
|----------|-----------|-------------|
| Market | Search | Find prediction markets by keyword with filters (active, category, limit) |
| Market | Get | Get full market details by condition ID or slug |
| Price | Get | Current price, midpoint, spread, and order book depth |
| Trading | Place Order | EIP-712 signed limit orders with time-in-force options and dry-run validation |
| Trading | Cancel Order | Cancel by order ID |
| Trading | Get Open Orders | List open orders, optionally filtered by market |
| Data | Get Leaderboard | Top traders ranked by profit (day/week/month/all time) |
| Data | Get Wallet Positions | Any wallet's open positions with P&L |
| Data | Get Wallet Trades | Trade history for any wallet |
| Data | Get Market Holders | Top holders of any prediction market |

### Polymarket Trigger (Polling)

| Mode | Description |
|------|-------------|
| Price Change | Fires when a token's price moves by a configurable amount |
| Price Crosses Threshold | Fires when price crosses above or below a target value |
| New Market | Fires when a new market appears matching a category filter |

### AI Agent Integration

Both nodes set `usableAsTool: true`, making them available as tools in n8n's AI Agent node. This is the first trading node in the n8n ecosystem with AI agent support -- enabling workflows where an LLM analyzes markets and executes trades autonomously.

### Dynamic UI

The node uses `loadOptionsMethod` to populate dropdowns with live Polymarket data. Users browse markets and select tokens from the n8n UI without copying condition IDs or token IDs manually.

### Workflow Templates

Five demand-backed templates ship with the package, built on what Polymarket traders actually use and pay for:

1. **Smart Money Radar** -- Track top traders from the leaderboard, monitor whale trades, get alerts on Telegram
2. **AI News-to-Market Matcher** -- RSS feed triggers AI analysis matched to Polymarket markets with directional signals
3. **Mispricing Scanner** -- Detect logically inconsistent pricing across correlated markets
4. **Daily Portfolio Digest** -- Morning P&L summary of your wallet positions
5. **Resolution Watcher** -- Monitor markets approaching resolution, get alerts before they close

## How It Drives Volume

Automated workflows generate recurring trades, not one-time clicks. A user who configures "buy when AI confidence exceeds 80%" trades every time conditions are met, indefinitely. Every order is tagged with our builder code via the credentials configuration.

The node is free to use. Revenue comes from the Polymarket Builder Program's volume-based rewards.

## Architecture

```
polymarket-tools/
  packages/
    core/                           @polymarket-tools/core
      src/
        http.ts                     Shared fetch with rate limit handling + error sanitization
        gamma.ts                    Gamma REST API client (market discovery)
        clob-public.ts              CLOB public API client (pricing)
        clob-trading.ts             CLOB trading client (viem wallet + EIP-712 signing)
        data-api.ts                 Data API client (leaderboard, positions, trades, holders)
        errors.ts                   Auth header sanitization (prevents credential leaks in logs)
        types.ts                    Full TypeScript type definitions
    n8n-nodes/                      n8n-nodes-polymarket-tools
      credentials/                  API credential management with builder code
      nodes/
        Polymarket/                 Action node (Market, Price, Trading, Data resources)
          actions/                  Modular operation handlers
          methods/                  Dynamic option loading (live market browsing)
          utils/                    Shared helpers (credential-to-client mapping)
        PolymarketTrigger/          Polling trigger node (3 modes)
      templates/                    5 workflow templates
```

### Design Decisions

- **Core wraps `@polymarket/clob-client`** for EIP-712 signing -- we don't reimplement cryptographic operations
- **viem `WalletClient`** created from private key for proper signer type compatibility
- **Defensive error handling** around known SDK issues: auth header sanitization (#327), balance retry on inconsistent returns (#300), NaN price validation, and graceful handling of non-array API responses
- **Builder code baked into credentials** -- defaults to our code, users can override
- **Shared `fetchJson` utility** -- single error handling path for both Gamma and CLOB APIs with 429 rate limit awareness
- **Real API fixtures in tests** -- normalizers tested against actual Polymarket API response shapes, not assumed structures

## Verified Against Live APIs

All read operations have been tested end-to-end against production Polymarket APIs inside an n8n Docker container:

- Market search returns live markets with correct token parsing (outcomes, prices, token IDs from JSON-encoded string arrays)
- Price, midpoint, spread, and order book data from the CLOB API
- EIP-712 order signing verified via `validateOnly` mode (signs without submitting)

## Test Coverage

127 tests across both packages:

| Package | Tests | Coverage |
|---------|-------|---------|
| @polymarket-tools/core | 105 | Gamma client, CLOB public, CLOB trading, HTTP utility, error sanitization, real API fixtures |
| n8n-nodes-polymarket | 22 | Node execute routing, trigger polling (all 3 modes), state management, credential mapping |

## Installation

### n8n Users

In your n8n instance: **Settings > Community Nodes > Install > `n8n-nodes-polymarket`**

### Developers

```bash
git clone https://github.com/polymarket-tools/polymarket-tools.git
cd polymarket-tools
pnpm install
pnpm build
pnpm test
```

### Docker (Local Development)

```bash
docker compose up -d
# n8n available at http://localhost:5678
```

## Credentials Setup

Market and Price operations work without credentials (public endpoints). Trading requires:

1. Go to [polymarket.com/settings?tab=builder](https://polymarket.com/settings?tab=builder)
2. Generate CLOB API credentials (Key, Secret, Passphrase)
3. In n8n, create **Polymarket API** credentials with your key, secret, passphrase, and wallet private key

## Packages

| Package | Description |
|---------|-------------|
| [`@polymarket-tools/core`](packages/core) | Polymarket API client library (Gamma + CLOB + Trading) |
| [`n8n-nodes-polymarket`](packages/n8n-nodes) | n8n community node with actions, triggers, and templates |

## Roadmap

- [ ] Positions via Data API (currently unimplemented -- CLOB SDK doesn't support it)
- [ ] Full builder code integration (key + secret + passphrase)
- [ ] Kalshi support as a second exchange
- [ ] npm publish and n8n community node submission
- [ ] WebSocket triggers (when Polymarket fixes `market_resolved` events)

## License

MIT

## Links

- [Polymarket API Docs](https://docs.polymarket.com)
- [Polymarket Builder Program](https://builders.polymarket.com)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
- [Report Issues](https://github.com/polymarket-tools/polymarket-tools/issues)

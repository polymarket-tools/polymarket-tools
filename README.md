# polymarket-tools

The first n8n community node with full Polymarket trading support -- including EIP-712 order signing, AI agent integration, and workflow templates.

Built for the [Polymarket Builder Program](https://builders.polymarket.com). Every trade placed through this node is tagged with a builder code for volume attribution.

## Why This Exists

There are two existing Polymarket n8n community nodes. Neither can place a trade. One has placeholder "Coming Soon" errors for all trading operations. The other requires users to pre-sign orders externally and paste raw payloads into the node.

**polymarket-tools solves this.** It wraps `@polymarket/clob-client` with a proper viem `WalletClient` for EIP-712 signing, handles the known SDK quirks defensively, and exposes the full Polymarket API surface as n8n actions and triggers.

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

Five ready-to-use templates ship with the package. When users import these from [n8n.io/workflows](https://n8n.io/workflows), n8n prompts them to install `n8n-nodes-polymarket`:

1. **Daily Polymarket Briefing to Slack** -- Morning market summary
2. **Price Alert to Telegram** -- Threshold-based notifications
3. **AI Agent Polymarket Trader** -- LLM-powered market analysis and trading
4. **New Market Scanner** -- Category-filtered new market alerts
5. **Portfolio Tracker to Google Sheets** -- Hourly position snapshots

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
        errors.ts                   Auth header sanitization (prevents credential leaks in logs)
        types.ts                    Full TypeScript type definitions
    n8n-nodes/                      n8n-nodes-polymarket
      credentials/                  API credential management with builder code
      nodes/
        Polymarket/                 Action node (Market, Price, Trading resources)
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

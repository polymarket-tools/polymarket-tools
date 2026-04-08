[![npm version](https://img.shields.io/npm/v/n8n-nodes-polymarket-tools.svg)](https://www.npmjs.com/package/n8n-nodes-polymarket-tools)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-polymarket-tools.svg)](https://www.npmjs.com/package/n8n-nodes-polymarket-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

# n8n-nodes-polymarket-tools

The first n8n community node with **full Polymarket trading support** -- EIP-712 order signing, real-time pricing, AI agent integration, and ready-to-use workflow templates.

## How to Automate Polymarket with n8n

This node lets you build automated prediction market workflows in n8n without writing code:

- **Monitor markets** for price movements, new listings, or whale activity
- **Analyze opportunities** with AI agents that can search and price markets
- **Execute trades** with cryptographically signed orders
- **Track portfolios** with scheduled position snapshots

## Installation

In your n8n instance: **Settings > Community Nodes > Install**

```
n8n-nodes-polymarket-tools
```

## Nodes

### Polymarket (Action Node)

| Resource | Operation | Description |
|----------|-----------|-------------|
| **Market** | Search | Find prediction markets by keyword, category, or tag |
| **Market** | Get | Get full market details by condition ID or slug |
| **Price** | Get | Current price, midpoint, spread, and order book depth |
| **Trading** | Place Order | EIP-712 signed limit orders with GTC/GTD/FOK/FAK |
| **Trading** | Cancel Order | Cancel an open order by ID |
| **Trading** | Get Open Orders | List all open orders with optional market filter |

### Polymarket Trigger (Polling Node)

| Mode | Description |
|------|-------------|
| **Price Change** | Triggers when a token's price moves by a configurable amount |
| **Price Crosses Threshold** | Triggers when price crosses above or below a target value |
| **New Market** | Triggers when new markets appear in a category |

## What Makes This Different

| Feature | This Node | n8n-nodes-polymarket (v4.2.0) |
|---------|-----------|-------------------------------|
| Market search | Yes | Partial |
| Price data | Yes (price + midpoint + spread + book) | No |
| Place orders | Yes (EIP-712 signed) | "Coming Soon" error |
| Cancel orders | Yes | No |
| Polling triggers | Yes (3 modes) | Broken (in-memory state) |
| AI agent support | Yes (`usableAsTool`) | No |
| Dynamic dropdowns | Yes (`loadOptionsMethod`) | No |
| Workflow templates | 5 included | None |
| Credential testing | Yes | Collects but never sends |
| Active maintenance | Yes | Last updated Jan 2026 |

## AI Agent Support

Both nodes set `usableAsTool: true`, making them available as tools in n8n's AI Agent node. Build workflows where an LLM:

1. Searches for markets related to a topic
2. Checks current prices and spreads
3. Places trades based on analysis

This is the **first trading node in the n8n ecosystem with AI agent support**.

## Workflow Templates

Import ready-to-use templates:

1. **Daily Polymarket Briefing to Slack** -- Automated morning market summary
2. **Price Alert to Telegram** -- Real-time threshold notifications
3. **AI Agent Polymarket Trader** -- LLM-powered market analysis and trading
4. **New Market Scanner** -- Category-filtered new market discovery
5. **Portfolio Tracker to Google Sheets** -- Hourly position snapshots

## Credentials

**Market and Price operations work without credentials** (public API endpoints).

Trading operations require Polymarket CLOB API credentials:

1. Go to [polymarket.com/settings](https://polymarket.com/settings?tab=builder)
2. Generate CLOB API credentials (Key, Secret, Passphrase)
3. In n8n, create **Polymarket API** credentials with your key, secret, passphrase, and wallet private key

## FAQ

### How do I automate Polymarket trading?

Install this node in n8n, set up your Polymarket API credentials, and use the Place Order operation. Orders are cryptographically signed with EIP-712 and submitted to Polymarket's CLOB.

### Can I use this with n8n's AI Agent?

Yes. Both nodes support `usableAsTool`. Connect them to an AI Agent node and the LLM can search markets, check prices, and place orders.

### Does this work with n8n Cloud?

Yes. Go to **Settings > Community Nodes > Install** and search for `n8n-nodes-polymarket-tools`. Works on any n8n instance (self-hosted or Cloud).

### How is this different from the other Polymarket node?

The existing `n8n-nodes-polymarket` (v4.2.0) cannot place trades -- all trading operations throw "Coming Soon" errors. This node implements full EIP-712 order signing via viem and @polymarket/clob-client.

## Links

- [GitHub](https://github.com/polymarket-tools/polymarket-tools)
- [npm](https://www.npmjs.com/package/n8n-nodes-polymarket-tools)
- [Polymarket API Docs](https://docs.polymarket.com)
- [Polymarket Builder Program](https://builders.polymarket.com)
- [Report Issues](https://github.com/polymarket-tools/polymarket-tools/issues)

## License

MIT

# n8n-nodes-polymarket

Polymarket nodes for [n8n](https://n8n.io) workflow automation. The first n8n node with full Polymarket trading support including EIP-712 order signing.

## Nodes

### Polymarket (Action Node)

**Market Operations:**
- **Search Markets** -- Find prediction markets by keyword
- **Get Market** -- Get market details by ID or slug

**Price Operations:**
- **Get Price** -- Current price, midpoint, spread, and order book

**Trading Operations:**
- **Place Order** -- Signed limit orders with EIP-712
- **Cancel Order** -- Cancel by order ID
- **Get Open Orders** -- List open orders
- **Get Positions** -- View current positions

### Polymarket Trigger

- **Price Change** -- Trigger when price moves by X amount
- **Price Crosses Threshold** -- Trigger when price crosses a level
- **New Market** -- Trigger when new markets appear in a category

## AI Agent Support

This node supports `usableAsTool`, making it available as a tool for n8n's AI Agent node. Build AI-powered trading workflows that analyze markets and execute trades.

## Workflow Templates

Import ready-to-use templates:
1. **Daily Polymarket Briefing to Slack**
2. **Price Alert to Telegram**
3. **AI Agent Polymarket Trader**
4. **New Market Scanner**
5. **Portfolio Tracker to Google Sheets**

## Installation

In your n8n instance: **Settings > Community Nodes > Install > `n8n-nodes-polymarket`**

## Credentials

Market and Price operations work without credentials. Trading operations require:
1. Go to [polymarket.com/settings](https://polymarket.com/settings?tab=builder)
2. Generate API credentials (Key, Secret, Passphrase)
3. In n8n, create Polymarket API credentials with your key, secret, passphrase, and wallet private key

## Links

- [Polymarket API Docs](https://docs.polymarket.com)
- [GitHub](https://github.com/polymarket-tools/polymarket-tools)
- [Report Issues](https://github.com/polymarket-tools/polymarket-tools/issues)

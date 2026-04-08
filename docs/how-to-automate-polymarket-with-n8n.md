# How to Automate Polymarket Trading with n8n

## What is Polymarket?

Polymarket is the world's largest prediction market platform with over $21 billion in monthly trading volume. Users trade on the outcomes of real-world events -- elections, sports, crypto prices, geopolitics, and more.

## What is n8n?

n8n is an open-source workflow automation platform with 1M+ self-hosted installations. It lets you connect apps and automate tasks with a visual builder -- no coding required.

## Automating Polymarket with n8n

The **n8n-nodes-polymarket-tools** community node brings Polymarket directly into n8n. You can:

### Search and Monitor Markets

Create workflows that search Polymarket for markets matching your interests, monitor price movements, and alert you when conditions change.

**Example:** Schedule a daily workflow that searches for active markets in "Politics", formats the top 10 by volume, and sends a summary to Slack.

### Get Real-Time Price Data

Fetch current prices, midpoints, bid-ask spreads, and full order book depth for any Polymarket outcome token.

**Example:** Set up a polling trigger that watches a specific market and sends a Telegram alert when the price crosses your target threshold.

### Trade with AI Agents

This is the first n8n trading node with AI agent support (`usableAsTool`). Connect Polymarket to n8n's AI Agent node and let an LLM analyze markets and execute trades autonomously.

**Example:** Build a workflow where Claude or GPT-4 searches for markets about a topic, analyzes the current odds, and places a trade when it identifies a mispricing.

### Place and Manage Orders

Place cryptographically signed limit orders directly from n8n workflows. Orders use EIP-712 signing via viem -- the same standard used by Polymarket's official trading interface.

**Example:** Create a workflow triggered by a webhook that places a buy order when your external signal fires, then cancels it if not filled within an hour.

## Installation

1. Open your n8n instance
2. Go to **Settings > Community Nodes**
3. Click **Install**
4. Enter `n8n-nodes-polymarket-tools`
5. Click **Install**

The node appears in your node panel as "Polymarket" and "Polymarket Trigger".

## Getting Started

### No credentials needed for market data

Market search, price data, and triggers work immediately -- Polymarket's public API endpoints require no authentication.

### Trading requires API credentials

1. Go to [polymarket.com/settings?tab=builder](https://polymarket.com/settings?tab=builder)
2. Generate your CLOB API credentials
3. In n8n, create a **Polymarket API** credential with your key, secret, passphrase, and wallet private key

## Available Operations

- **Search Markets** -- Find prediction markets by keyword with filters
- **Get Market** -- Full market details by condition ID or slug
- **Get Price** -- Price, midpoint, spread, and order book
- **Place Order** -- EIP-712 signed limit orders
- **Cancel Order** -- Cancel by order ID
- **Get Open Orders** -- List open orders
- **Price Change Trigger** -- Poll for price movements
- **Threshold Crossing Trigger** -- Alert when price crosses a level
- **New Market Trigger** -- Detect new markets by category

## Workflow Templates

Five ready-to-use templates are included:

1. Daily Polymarket Briefing to Slack
2. Price Alert to Telegram
3. AI Agent Polymarket Trader
4. New Market Scanner
5. Portfolio Tracker to Google Sheets

## Links

- **Install:** `n8n-nodes-polymarket-tools` in n8n Community Nodes
- **npm:** [npmjs.com/package/n8n-nodes-polymarket-tools](https://www.npmjs.com/package/n8n-nodes-polymarket-tools)
- **GitHub:** [github.com/polymarket-tools/polymarket-tools](https://github.com/polymarket-tools/polymarket-tools)
- **Polymarket API:** [docs.polymarket.com](https://docs.polymarket.com)

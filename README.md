# polymarket-tools

Open-source Polymarket workflow automation tools. The first n8n community node with full Polymarket trading support.

## Features

- **Search & browse** prediction markets by keyword, category, or slug
- **Real-time pricing** with midpoint, spread, and order book data
- **End-to-end trading** with EIP-712 order signing (the first n8n node to support this)
- **AI agent integration** via `usableAsTool` -- use with n8n's AI Agent node
- **Polling triggers** for price changes, threshold crossings, and new markets
- **5 workflow templates** ready to import

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [@polymarket-tools/core](packages/core) | Polymarket API client library | `@polymarket-tools/core` |
| [n8n-nodes-polymarket](packages/n8n-nodes) | n8n community node | `n8n-nodes-polymarket` |

## Quick Start

### n8n Users

In your n8n instance, go to **Settings > Community Nodes** and install:

```
n8n-nodes-polymarket
```

### Developers

```bash
git clone https://github.com/polymarket-tools/polymarket-tools.git
cd polymarket-tools
pnpm install
pnpm build
pnpm test
```

## Architecture

```
packages/
  core/           @polymarket-tools/core
    gamma.ts      Gamma REST API (market discovery)
    clob-public.ts  CLOB public API (pricing)
    clob-trading.ts CLOB trading (EIP-712 signing + builder code)
    errors.ts     Auth header sanitization
  n8n-nodes/      n8n-nodes-polymarket
    credentials/  API credential management
    nodes/
      Polymarket/     Action node (Market, Price, Trading)
      PolymarketTrigger/  Polling trigger node
    templates/    5 ready-to-use workflow templates
```

## License

MIT

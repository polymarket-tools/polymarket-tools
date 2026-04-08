# Changelog

## [1.0.0] - 2026-04-08

### Added
- **Polymarket Action Node** with Market, Price, and Trading resources
  - Search markets by keyword with filters (active, category, limit)
  - Get market details by condition ID or slug
  - Get price, midpoint, spread, and order book depth
  - Place EIP-712 signed limit orders with time-in-force options
  - Cancel orders by ID
  - List open orders with optional market filter
- **Polymarket Trigger Node** with 3 polling modes
  - Price change amount detection
  - Price threshold crossing detection
  - New market discovery by category
- **AI Agent Support** via `usableAsTool` on both nodes
- **Dynamic UI Dropdowns** via `loadOptionsMethod` for market/token browsing
- **Builder Code Integration** for Polymarket Builder Program volume attribution
- **5 Workflow Templates** for quick-start automation
  - Daily Polymarket Briefing to Slack
  - Price Alert to Telegram
  - AI Agent Polymarket Trader
  - New Market Scanner
  - Portfolio Tracker to Google Sheets
- **@polymarket-tools/core** client library
  - Gamma REST API client for market discovery
  - CLOB public API client for pricing with NaN validation
  - CLOB trading client with viem WalletClient for EIP-712 signing
  - Shared fetchJson with rate limit handling and auth header sanitization
  - Real API response fixtures for testing
- **Docker development setup** with docker-compose
- **127 tests** across both packages

// ── Configuration Types ──────────────────────────────────────────

export interface GammaClientConfig {
  host?: string;
}

export interface ClobPublicConfig {
  host?: string;
}

export interface ClobTradingConfig {
  host: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  privateKey: string;
  chainId?: string;
  builderCode?: string;
}

// ── Search / Query Types ─────────────────────────────────────────

export interface SearchMarketsParams {
  query: string;
  active?: boolean;
  closed?: boolean;
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
  tag?: string;
}

// ── Market Types ─────────────────────────────────────────────────

export interface MarketToken {
  tokenId: string;
  outcome: string;
  price: number;
}

export interface Market {
  conditionId: string;
  question: string;
  slug: string;
  description: string;
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
  startDate: string;
  endDate: string;
  tokens: MarketToken[];
  tags: string[];
  image: string;
  icon: string;
}

// ── Price / OrderBook Types ──────────────────────────────────────

export interface TokenPrice {
  tokenId: string;
  price: number;
  midpoint: number;
  bid: number;
  ask: number;
  spread: number;
}

export interface OrderBookEntry {
  price: string;
  size: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

// ── Order Types ──────────────────────────────────────────────────

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type TimeInForce = 'GTC' | 'GTD' | 'FOK' | 'FAK';

export interface PlaceOrderParams {
  tokenId: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  size: number;
  timeInForce?: TimeInForce;
  validateOnly?: boolean;
}

export interface Order {
  id: string;
  status: string;
  tokenId: string;
  side: OrderSide;
  price: string;
  size: string;
  createdAt: string;
}

// ── Position Types ───────────────────────────────────────────────

export interface Position {
  marketId: string;
  conditionId: string;
  tokenId: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
}

// ── Tag Type ────────────────────────────────────────────────────

export interface Tag {
  id: string;
  label: string;
  slug: string;
}

// ── Raw API Types (camelCase from Gamma API) ────────────────────
// The Gamma API returns camelCase fields, JSON-encoded arrays for
// outcomes/outcomePrices/clobTokenIds, and string numbers for
// volume/liquidity.

export interface RawMarket {
  conditionId: string;
  question: string;
  slug: string;
  description: string;
  active: boolean;
  closed: boolean;
  /** Volume as a string number, e.g. "1435224.264825003" */
  volume: string;
  /** Liquidity as a string number, e.g. "61001.0135" */
  liquidity: string;
  startDate: string;
  endDate: string;
  /** JSON-encoded string array, e.g. '["Yes", "No"]' */
  outcomes: string;
  /** JSON-encoded string array, e.g. '["0.535", "0.465"]' */
  outcomePrices: string;
  /** JSON-encoded string array of token IDs */
  clobTokenIds: string;
  tags: Tag[];
  image: string;
  icon: string;
}

// ── Error Types ──────────────────────────────────────────────────

export class PolymarketError extends Error {
  public statusCode: number;
  public endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string) {
    super(message);
    this.name = 'PolymarketError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

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

// ── Data API Types ──────────────────────────────────────────────

export interface DataApiConfig {
  host?: string;
}

export interface LeaderboardEntry {
  rank: number;
  proxyWallet: string;
  userName: string;
  volume: number;
  pnl: number;
}

export interface WalletPosition {
  market: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
}

export interface WalletTrade {
  market: string;
  side: string;
  price: number;
  size: number;
  timestamp: string;
  transactionHash: string;
}

export interface MarketHolder {
  wallet: string;
  size: number;
  avgPrice: number;
}

export interface MarketPosition {
  proxyWallet: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  realizedPnl: number;
  totalPnl: number;
}

// ── Data API Raw Response Types ─────────────────────────────────

export interface RawLeaderboardEntry {
  rank: string;
  proxyWallet: string;
  userName: string;
  xUsername: string;
  verifiedBadge: boolean;
  vol: number;
  pnl: number;
  profileImage: string;
}

export interface RawWalletPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventId: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

export interface RawWalletTrade {
  proxyWallet: string;
  side: string;
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name: string;
  pseudonym: string;
  bio: string;
  profileImage: string;
  profileImageOptimized: string;
  transactionHash: string;
}

export interface RawHolderEntry {
  proxyWallet: string;
  bio: string;
  asset: string;
  pseudonym: string;
  amount: number;
  displayUsernamePublic: boolean;
  outcomeIndex: number;
  name: string;
  profileImage: string;
  profileImageOptimized: string;
  verified: boolean;
}

export interface RawHoldersResponse {
  token: string;
  holders: RawHolderEntry[];
}

export interface RawValueResponse {
  user: string;
  value: number;
}

export interface RawMarketPositionEntry {
  proxyWallet: string;
  name: string;
  profileImage: string;
  verified: boolean;
  asset: string;
  conditionId: string;
  avgPrice: number;
  size: number;
  currPrice: number;
  currentValue: number;
  cashPnl: number;
  totalBought: number;
  realizedPnl: number;
  totalPnl: number;
  outcome: string;
  outcomeIndex: number;
}

export interface RawMarketPositionsResponse {
  token: string;
  positions: RawMarketPositionEntry[];
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

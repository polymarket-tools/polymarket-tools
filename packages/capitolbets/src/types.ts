export interface User {
  telegram_id: number;
  privy_user_id: string;
  safe_address: string;
  deposit_address: string;
  created_at: string;
  alert_preferences: AlertPreferences;
  referred_by: number | null;
  fee_rate: number; // default 0.005
  fee_rate_expires: string | null;
  digest_enabled: boolean; // default true
}

export interface AlertPreferences {
  whales: boolean;
  politics: boolean;
  movers: boolean;
  new_markets: boolean;
  risk_reward: boolean;
  smart_money: boolean;
}

export interface Trade {
  id: number;
  user_telegram_id: number;
  market_condition_id: string;
  token_id: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  fee_amount: number;
  source: 'manual' | 'copy' | 'signal';
  tx_hash: string;
  created_at: string;
}

export interface CopyConfig {
  id: number;
  user_telegram_id: number;
  target_wallet: string;
  sizing_mode: 'percent' | 'fixed' | 'mirror';
  sizing_value: number;
  direction: 'all' | 'buys_only' | 'sells_only';
  max_per_trade: number | null;
  active: boolean;
  last_seen_trade_id: string | null;
  smart_copy_enabled: boolean;
  smart_copy_min_confidence: number;
  smart_copy_categories: string[] | null;
}

export interface AlertSent {
  id: number;
  category: string;
  title: string;
  market_condition_id: string;
  created_at: string;
}

export interface LeaderboardCache {
  user_telegram_id: number;
  period: '7d' | '30d' | 'all';
  pnl: number;
  win_rate: number;
  trade_count: number;
  calculated_at: string;
}

export interface CopyLeaderEarning {
  leader_telegram_id: number;
  copier_telegram_id: number;
  fee_earned: number;
  trade_id: number;
  created_at: string;
}

export interface AlertPayload {
  category:
    | 'whales'
    | 'politics'
    | 'movers'
    | 'new_markets'
    | 'risk_reward'
    | 'smart_money';
  title: string;
  body: string;
  market: {
    conditionId: string;
    question: string;
    tokenId: string;
    currentPrice: number;
  };
  metadata: Record<string, unknown>;
  urgent?: boolean;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  price: number;
  size: number;
  feeAmount: number;
  txHash?: string;
  error?: string;
}

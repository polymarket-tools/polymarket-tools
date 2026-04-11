import type { Database } from './db';
import type {
  User,
  AlertPreferences,
  Trade,
  CopyConfig,
  AlertSent,
  LeaderboardCache,
  CopyLeaderEarning,
} from './types';

// ---------- Row types (SQLite stores booleans as 0/1, JSON as TEXT) ----------

interface UserRow {
  telegram_id: number;
  privy_user_id: string;
  privy_wallet_id: string;
  signer_address: string;
  safe_address: string;
  deposit_address: string;
  created_at: string;
  alert_preferences: string;
  referred_by: number | null;
  fee_rate: number;
  fee_rate_expires: string | null;
  digest_enabled: number;
}

interface TradeRow {
  id: number;
  user_telegram_id: number;
  market_condition_id: string;
  token_id: string;
  side: string;
  price: number;
  size: number;
  fee_amount: number;
  source: string;
  tx_hash: string;
  created_at: string;
}

interface CopyConfigRow {
  id: number;
  user_telegram_id: number;
  target_wallet: string;
  sizing_mode: string;
  sizing_value: number;
  direction: string;
  max_per_trade: number | null;
  active: number;
  last_seen_trade_id: string | null;
  smart_copy_enabled: number;
  smart_copy_min_confidence: number;
  smart_copy_categories: string | null;
}

interface LeaderboardRow {
  user_telegram_id: number;
  period: string;
  pnl: number;
  win_rate: number;
  trade_count: number;
  calculated_at: string;
}

// ---------- Mappers ----------

function mapUser(row: UserRow): User {
  return {
    ...row,
    alert_preferences: JSON.parse(row.alert_preferences) as AlertPreferences,
    digest_enabled: row.digest_enabled === 1,
  };
}

function mapTrade(row: TradeRow): Trade {
  return { ...row, side: row.side as Trade['side'], source: row.source as Trade['source'] };
}

function mapCopyConfig(row: CopyConfigRow): CopyConfig {
  return {
    ...row,
    sizing_mode: row.sizing_mode as CopyConfig['sizing_mode'],
    direction: row.direction as CopyConfig['direction'],
    active: row.active === 1,
    smart_copy_enabled: row.smart_copy_enabled === 1,
    smart_copy_categories: row.smart_copy_categories
      ? (JSON.parse(row.smart_copy_categories) as string[])
      : null,
  };
}

function mapLeaderboard(row: LeaderboardRow): LeaderboardCache {
  return {
    ...row,
    period: row.period as LeaderboardCache['period'],
  };
}

// ---------- UserQueries ----------

export class UserQueries {
  constructor(private db: Database) {}

  create(params: {
    telegram_id: number;
    privy_user_id: string;
    privy_wallet_id?: string;
    signer_address?: string;
    safe_address: string;
    deposit_address: string;
  }): void {
    this.db.raw
      .prepare(
        `INSERT INTO users (telegram_id, privy_user_id, privy_wallet_id, signer_address, safe_address, deposit_address)
         VALUES (@telegram_id, @privy_user_id, @privy_wallet_id, @signer_address, @safe_address, @deposit_address)`
      )
      .run({
        ...params,
        privy_wallet_id: params.privy_wallet_id ?? '',
        signer_address: params.signer_address ?? '',
      });
  }

  getByTelegramId(telegramId: number): User | undefined {
    const row = this.db.raw
      .prepare('SELECT * FROM users WHERE telegram_id = ?')
      .get(telegramId) as UserRow | undefined;
    return row ? mapUser(row) : undefined;
  }

  updateAlertPreferences(
    telegramId: number,
    prefs: AlertPreferences
  ): void {
    this.db.raw
      .prepare('UPDATE users SET alert_preferences = ? WHERE telegram_id = ?')
      .run(JSON.stringify(prefs), telegramId);
  }

  setFeeRate(
    telegramId: number,
    rate: number,
    expires: string | null = null
  ): void {
    this.db.raw
      .prepare(
        'UPDATE users SET fee_rate = ?, fee_rate_expires = ? WHERE telegram_id = ?'
      )
      .run(rate, expires, telegramId);
  }

  setDigestEnabled(telegramId: number, enabled: boolean): void {
    this.db.raw
      .prepare('UPDATE users SET digest_enabled = ? WHERE telegram_id = ?')
      .run(enabled ? 1 : 0, telegramId);
  }

  setReferredBy(telegramId: number, referrerId: number): void {
    this.db.raw
      .prepare('UPDATE users SET referred_by = ? WHERE telegram_id = ?')
      .run(referrerId, telegramId);
  }

  listDigestEnabled(): User[] {
    const rows = this.db.raw
      .prepare('SELECT * FROM users WHERE digest_enabled = 1')
      .all() as UserRow[];
    return rows.map(mapUser);
  }
}

// ---------- TradeQueries ----------

export class TradeQueries {
  constructor(private db: Database) {}

  insert(params: {
    user_telegram_id: number;
    market_condition_id: string;
    token_id: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    fee_amount: number;
    source: 'manual' | 'copy' | 'signal';
    tx_hash: string;
  }): number {
    const result = this.db.raw
      .prepare(
        `INSERT INTO trades (user_telegram_id, market_condition_id, token_id, side, price, size, fee_amount, source, tx_hash)
         VALUES (@user_telegram_id, @market_condition_id, @token_id, @side, @price, @size, @fee_amount, @source, @tx_hash)`
      )
      .run(params);
    return Number(result.lastInsertRowid);
  }

  getByUser(telegramId: number, limit?: number): Trade[] {
    const sql = limit
      ? 'SELECT * FROM trades WHERE user_telegram_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM trades WHERE user_telegram_id = ? ORDER BY created_at DESC';
    const rows = (
      limit
        ? this.db.raw.prepare(sql).all(telegramId, limit)
        : this.db.raw.prepare(sql).all(telegramId)
    ) as TradeRow[];
    return rows.map(mapTrade);
  }

  getByUserAndPeriod(
    telegramId: number,
    startDate: string,
    endDate: string
  ): Trade[] {
    const rows = this.db.raw
      .prepare(
        `SELECT * FROM trades
         WHERE user_telegram_id = ? AND created_at >= ? AND created_at <= ?
         ORDER BY created_at DESC`
      )
      .all(telegramId, startDate, endDate) as TradeRow[];
    return rows.map(mapTrade);
  }
}

// ---------- CopyConfigQueries ----------

export class CopyConfigQueries {
  constructor(private db: Database) {}

  create(params: {
    user_telegram_id: number;
    target_wallet: string;
    sizing_mode: 'percent' | 'fixed' | 'mirror';
    sizing_value: number;
    direction: 'all' | 'buys_only' | 'sells_only';
    max_per_trade: number | null;
    smart_copy_enabled: boolean;
    smart_copy_min_confidence: number;
    smart_copy_categories: string[] | null;
  }): number {
    const result = this.db.raw
      .prepare(
        `INSERT INTO copy_configs (user_telegram_id, target_wallet, sizing_mode, sizing_value, direction, max_per_trade, smart_copy_enabled, smart_copy_min_confidence, smart_copy_categories)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.user_telegram_id,
        params.target_wallet,
        params.sizing_mode,
        params.sizing_value,
        params.direction,
        params.max_per_trade,
        params.smart_copy_enabled ? 1 : 0,
        params.smart_copy_min_confidence,
        params.smart_copy_categories
          ? JSON.stringify(params.smart_copy_categories)
          : null
      );
    return Number(result.lastInsertRowid);
  }

  getActiveByUser(telegramId: number): CopyConfig[] {
    const rows = this.db.raw
      .prepare(
        'SELECT * FROM copy_configs WHERE user_telegram_id = ? AND active = 1'
      )
      .all(telegramId) as CopyConfigRow[];
    return rows.map(mapCopyConfig);
  }

  getByUserAndWallet(
    telegramId: number,
    targetWallet: string
  ): CopyConfig | undefined {
    const row = this.db.raw
      .prepare(
        'SELECT * FROM copy_configs WHERE user_telegram_id = ? AND target_wallet = ?'
      )
      .get(telegramId, targetWallet) as CopyConfigRow | undefined;
    return row ? mapCopyConfig(row) : undefined;
  }

  updateLastSeenTrade(configId: number, tradeId: string): void {
    this.db.raw
      .prepare(
        'UPDATE copy_configs SET last_seen_trade_id = ? WHERE id = ?'
      )
      .run(tradeId, configId);
  }

  deactivate(configId: number): void {
    this.db.raw
      .prepare('UPDATE copy_configs SET active = 0 WHERE id = ?')
      .run(configId);
  }

  listAllActive(): CopyConfig[] {
    const rows = this.db.raw
      .prepare('SELECT * FROM copy_configs WHERE active = 1')
      .all() as CopyConfigRow[];
    return rows.map(mapCopyConfig);
  }

  getById(configId: number): CopyConfig | undefined {
    const row = this.db.raw
      .prepare('SELECT * FROM copy_configs WHERE id = ?')
      .get(configId) as CopyConfigRow | undefined;
    return row ? mapCopyConfig(row) : undefined;
  }

  activate(configId: number): void {
    this.db.raw
      .prepare('UPDATE copy_configs SET active = 1 WHERE id = ?')
      .run(configId);
  }

  updateSizing(
    configId: number,
    mode: 'percent' | 'fixed' | 'mirror',
    value: number,
  ): void {
    this.db.raw
      .prepare(
        'UPDATE copy_configs SET sizing_mode = ?, sizing_value = ? WHERE id = ?',
      )
      .run(mode, value, configId);
  }

  updateDirection(
    configId: number,
    direction: 'all' | 'buys_only' | 'sells_only',
  ): void {
    this.db.raw
      .prepare('UPDATE copy_configs SET direction = ? WHERE id = ?')
      .run(direction, configId);
  }

  updateMaxPerTrade(configId: number, max: number | null): void {
    this.db.raw
      .prepare('UPDATE copy_configs SET max_per_trade = ? WHERE id = ?')
      .run(max, configId);
  }
}

// ---------- AlertSentQueries ----------

export class AlertSentQueries {
  constructor(private db: Database) {}

  insert(params: {
    category: string;
    title: string;
    market_condition_id: string;
  }): void {
    this.db.raw
      .prepare(
        `INSERT INTO alerts_sent (category, title, market_condition_id)
         VALUES (@category, @title, @market_condition_id)`
      )
      .run(params);
  }

  /** Check if an alert was sent for this category+market within the last `minutes` minutes. */
  existsRecent(
    category: string,
    marketConditionId: string,
    minutes: number
  ): boolean {
    const row = this.db.raw
      .prepare(
        `SELECT 1 FROM alerts_sent
         WHERE category = ? AND market_condition_id = ?
           AND created_at >= datetime('now', '-' || ? || ' minutes')
         LIMIT 1`
      )
      .get(category, marketConditionId, minutes);
    return row !== undefined;
  }
}

// ---------- LeaderboardCacheQueries ----------

export class LeaderboardCacheQueries {
  constructor(private db: Database) {}

  upsert(params: {
    user_telegram_id: number;
    period: '7d' | '30d' | 'all';
    pnl: number;
    win_rate: number;
    trade_count: number;
  }): void {
    this.db.raw
      .prepare(
        `INSERT INTO leaderboard_cache (user_telegram_id, period, pnl, win_rate, trade_count, calculated_at)
         VALUES (@user_telegram_id, @period, @pnl, @win_rate, @trade_count, datetime('now'))
         ON CONFLICT (user_telegram_id, period) DO UPDATE SET
           pnl = excluded.pnl,
           win_rate = excluded.win_rate,
           trade_count = excluded.trade_count,
           calculated_at = excluded.calculated_at`
      )
      .run(params);
  }

  getTop(period: '7d' | '30d' | 'all', limit: number): LeaderboardCache[] {
    const rows = this.db.raw
      .prepare(
        'SELECT * FROM leaderboard_cache WHERE period = ? ORDER BY pnl DESC LIMIT ?'
      )
      .all(period, limit) as LeaderboardRow[];
    return rows.map(mapLeaderboard);
  }
}

// ---------- CopyLeaderEarningQueries ----------

export class CopyLeaderEarningQueries {
  constructor(private db: Database) {}

  insert(params: {
    leader_telegram_id: number;
    copier_telegram_id: number;
    fee_earned: number;
    trade_id: number;
  }): void {
    this.db.raw
      .prepare(
        `INSERT INTO copy_leader_earnings (leader_telegram_id, copier_telegram_id, fee_earned, trade_id)
         VALUES (@leader_telegram_id, @copier_telegram_id, @fee_earned, @trade_id)`
      )
      .run(params);
  }

  getTotalByLeader(leaderTelegramId: number): number {
    const row = this.db.raw
      .prepare(
        'SELECT COALESCE(SUM(fee_earned), 0) as total FROM copy_leader_earnings WHERE leader_telegram_id = ?'
      )
      .get(leaderTelegramId) as { total: number };
    return row.total;
  }

  getWeeklyByLeader(leaderTelegramId: number): number {
    const row = this.db.raw
      .prepare(
        `SELECT COALESCE(SUM(fee_earned), 0) as total FROM copy_leader_earnings
         WHERE leader_telegram_id = ? AND created_at >= datetime('now', '-7 days')`
      )
      .get(leaderTelegramId) as { total: number };
    return row.total;
  }

  getCopierCount(leaderTelegramId: number): number {
    const row = this.db.raw
      .prepare(
        'SELECT COUNT(DISTINCT copier_telegram_id) as count FROM copy_leader_earnings WHERE leader_telegram_id = ?'
      )
      .get(leaderTelegramId) as { count: number };
    return row.count;
  }
}

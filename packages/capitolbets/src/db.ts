import BetterSqlite3 from 'better-sqlite3';

export class Database {
  readonly raw: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.raw = new BetterSqlite3(dbPath);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('foreign_keys = ON');
  }

  migrate(): void {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        privy_user_id TEXT NOT NULL,
        safe_address TEXT NOT NULL,
        deposit_address TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        alert_preferences TEXT NOT NULL DEFAULT '{"whales":true,"politics":true,"movers":true,"new_markets":true,"risk_reward":true,"smart_money":true}',
        referred_by INTEGER,
        fee_rate REAL NOT NULL DEFAULT 0.005,
        fee_rate_expires TEXT,
        digest_enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
        market_condition_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
        price REAL NOT NULL,
        size REAL NOT NULL,
        fee_amount REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual', 'copy', 'signal')),
        tx_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_telegram_id);
      CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_telegram_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_condition_id);

      CREATE TABLE IF NOT EXISTS copy_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
        target_wallet TEXT NOT NULL,
        sizing_mode TEXT NOT NULL CHECK (sizing_mode IN ('percent', 'fixed', 'mirror')),
        sizing_value REAL NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('all', 'buys_only', 'sells_only')),
        max_per_trade REAL,
        active INTEGER NOT NULL DEFAULT 1,
        last_seen_trade_id TEXT,
        smart_copy_enabled INTEGER NOT NULL DEFAULT 0,
        smart_copy_min_confidence REAL NOT NULL DEFAULT 0.7,
        smart_copy_categories TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_copy_configs_user ON copy_configs(user_telegram_id);
      CREATE INDEX IF NOT EXISTS idx_copy_configs_active ON copy_configs(active);

      CREATE TABLE IF NOT EXISTS alerts_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        market_condition_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_sent_category_market ON alerts_sent(category, market_condition_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_sent_created ON alerts_sent(created_at);

      CREATE TABLE IF NOT EXISTS leaderboard_cache (
        user_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
        period TEXT NOT NULL CHECK (period IN ('7d', '30d', 'all')),
        pnl REAL NOT NULL,
        win_rate REAL NOT NULL,
        trade_count INTEGER NOT NULL,
        calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_telegram_id, period)
      );

      CREATE TABLE IF NOT EXISTS copy_leader_earnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leader_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
        copier_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
        fee_earned REAL NOT NULL,
        trade_id INTEGER NOT NULL REFERENCES trades(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_copy_leader_earnings_leader ON copy_leader_earnings(leader_telegram_id);
      CREATE INDEX IF NOT EXISTS idx_copy_leader_earnings_created ON copy_leader_earnings(created_at);
    `);
  }

  close(): void {
    this.raw.close();
  }
}

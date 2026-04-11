import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../src/db';
import {
  UserQueries,
  TradeQueries,
  CopyConfigQueries,
  AlertSentQueries,
  LeaderboardCacheQueries,
  CopyLeaderEarningQueries,
} from '../src/db-queries';
import type {
  AlertPreferences,
} from '../src/types';

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.migrate();
  });

  afterEach(() => {
    db.close();
  });

  describe('migrate()', () => {
    it('runs without error', () => {
      // Already ran in beforeEach -- just verify db is usable
      const result = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const tableNames = result.map((r) => r.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('trades');
      expect(tableNames).toContain('copy_configs');
      expect(tableNames).toContain('alerts_sent');
      expect(tableNames).toContain('leaderboard_cache');
      expect(tableNames).toContain('copy_leader_earnings');
    });

    it('is idempotent -- runs twice without error', () => {
      // migrate() already ran in beforeEach, run it again
      expect(() => db.migrate()).not.toThrow();
    });
  });

  describe('UserQueries', () => {
    let users: UserQueries;

    beforeEach(() => {
      users = new UserQueries(db);
    });

    const defaultPrefs: AlertPreferences = {
      whales: true,
      politics: true,
      movers: true,
      new_markets: true,
      risk_reward: true,
      smart_money: true,
    };

    it('creates a user and retrieves by telegram_id', () => {
      users.create({
        telegram_id: 12345,
        privy_user_id: 'privy_abc',
        safe_address: '0xSAFE',
        deposit_address: '0xDEPOSIT',
      });

      const user = users.getByTelegramId(12345);
      expect(user).toBeDefined();
      expect(user!.telegram_id).toBe(12345);
      expect(user!.privy_user_id).toBe('privy_abc');
      expect(user!.safe_address).toBe('0xSAFE');
      expect(user!.deposit_address).toBe('0xDEPOSIT');
    });

    it('returns undefined for non-existent user', () => {
      const user = users.getByTelegramId(99999);
      expect(user).toBeUndefined();
    });

    it('sets default fee_rate to 0.005', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      const user = users.getByTelegramId(1);
      expect(user!.fee_rate).toBe(0.005);
    });

    it('sets default digest_enabled to true', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      const user = users.getByTelegramId(1);
      expect(user!.digest_enabled).toBe(true);
    });

    it('round-trips alert_preferences as JSON', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      const customPrefs: AlertPreferences = {
        whales: false,
        politics: true,
        movers: false,
        new_markets: true,
        risk_reward: false,
        smart_money: true,
      };

      users.updateAlertPreferences(1, customPrefs);

      const user = users.getByTelegramId(1);
      expect(user!.alert_preferences).toEqual(customPrefs);
    });

    it('returns default alert_preferences JSON on create', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      const user = users.getByTelegramId(1);
      expect(user!.alert_preferences).toEqual(defaultPrefs);
    });

    it('updates fee_rate', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      users.setFeeRate(1, 0.01, '2026-12-31T00:00:00Z');
      const user = users.getByTelegramId(1);
      expect(user!.fee_rate).toBe(0.01);
      expect(user!.fee_rate_expires).toBe('2026-12-31T00:00:00Z');
    });

    it('updates digest_enabled', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      users.setDigestEnabled(1, false);
      const user = users.getByTelegramId(1);
      expect(user!.digest_enabled).toBe(false);
    });

    it('sets referred_by', () => {
      users.create({
        telegram_id: 1,
        privy_user_id: 'p1',
        safe_address: '0x1',
        deposit_address: '0xD1',
      });

      users.setReferredBy(1, 99);
      const user = users.getByTelegramId(1);
      expect(user!.referred_by).toBe(99);
    });

    it('lists digest-enabled users', () => {
      users.create({ telegram_id: 1, privy_user_id: 'p1', safe_address: '0x1', deposit_address: '0xD1' });
      users.create({ telegram_id: 2, privy_user_id: 'p2', safe_address: '0x2', deposit_address: '0xD2' });
      users.create({ telegram_id: 3, privy_user_id: 'p3', safe_address: '0x3', deposit_address: '0xD3' });

      users.setDigestEnabled(2, false);

      const digestUsers = users.listDigestEnabled();
      expect(digestUsers).toHaveLength(2);
      expect(digestUsers.map((u) => u.telegram_id)).toEqual([1, 3]);
    });
  });

  describe('TradeQueries', () => {
    let trades: TradeQueries;
    let userQ: UserQueries;

    beforeEach(() => {
      trades = new TradeQueries(db);
      userQ = new UserQueries(db);
      userQ.create({ telegram_id: 1, privy_user_id: 'p1', safe_address: '0x1', deposit_address: '0xD1' });
    });

    it('inserts a trade and retrieves by user', () => {
      trades.insert({
        user_telegram_id: 1,
        market_condition_id: 'cond_abc',
        token_id: 'tok_123',
        side: 'BUY',
        price: 0.65,
        size: 100,
        fee_amount: 0.5,
        source: 'manual',
        tx_hash: '0xTX',
      });

      const userTrades = trades.getByUser(1);
      expect(userTrades).toHaveLength(1);
      expect(userTrades[0].side).toBe('BUY');
      expect(userTrades[0].price).toBe(0.65);
      expect(userTrades[0].source).toBe('manual');
      expect(userTrades[0].tx_hash).toBe('0xTX');
    });

    it('retrieves trades by user and time period', () => {
      trades.insert({
        user_telegram_id: 1,
        market_condition_id: 'cond_1',
        token_id: 'tok_1',
        side: 'BUY',
        price: 0.5,
        size: 10,
        fee_amount: 0.05,
        source: 'manual',
        tx_hash: '0xTX1',
      });

      // Manually insert an older trade to test period filtering
      db.raw.prepare(`
        INSERT INTO trades (user_telegram_id, market_condition_id, token_id, side, price, size, fee_amount, source, tx_hash, created_at)
        VALUES (1, 'cond_2', 'tok_2', 'SELL', 0.3, 50, 0.25, 'copy', '0xTX2', '2020-01-01T00:00:00Z')
      `).run();

      const recent = trades.getByUserAndPeriod(1, '2025-01-01T00:00:00Z', '2030-01-01T00:00:00Z');
      expect(recent).toHaveLength(1);
      expect(recent[0].market_condition_id).toBe('cond_1');

      const all = trades.getByUser(1);
      expect(all).toHaveLength(2);
    });

    it('enforces foreign key on user_telegram_id', () => {
      expect(() =>
        trades.insert({
          user_telegram_id: 9999,
          market_condition_id: 'cond_1',
          token_id: 'tok_1',
          side: 'BUY',
          price: 0.5,
          size: 10,
          fee_amount: 0.05,
          source: 'manual',
          tx_hash: '0xTX',
        })
      ).toThrow();
    });
  });

  describe('CopyConfigQueries', () => {
    let configs: CopyConfigQueries;
    let userQ: UserQueries;

    beforeEach(() => {
      configs = new CopyConfigQueries(db);
      userQ = new UserQueries(db);
      userQ.create({ telegram_id: 1, privy_user_id: 'p1', safe_address: '0x1', deposit_address: '0xD1' });
    });

    it('creates a config and retrieves active by user', () => {
      configs.create({
        user_telegram_id: 1,
        target_wallet: '0xLEADER',
        sizing_mode: 'percent',
        sizing_value: 10,
        direction: 'all',
        max_per_trade: 50,
        smart_copy_enabled: false,
        smart_copy_min_confidence: 0.7,
        smart_copy_categories: null,
      });

      const active = configs.getActiveByUser(1);
      expect(active).toHaveLength(1);
      expect(active[0].target_wallet).toBe('0xLEADER');
      expect(active[0].active).toBe(true);
    });

    it('retrieves by user and wallet', () => {
      configs.create({
        user_telegram_id: 1,
        target_wallet: '0xLEADER',
        sizing_mode: 'fixed',
        sizing_value: 25,
        direction: 'buys_only',
        max_per_trade: null,
        smart_copy_enabled: false,
        smart_copy_min_confidence: 0.7,
        smart_copy_categories: null,
      });

      const config = configs.getByUserAndWallet(1, '0xLEADER');
      expect(config).toBeDefined();
      expect(config!.sizing_mode).toBe('fixed');
      expect(config!.sizing_value).toBe(25);
    });

    it('updates last_seen_trade_id', () => {
      configs.create({
        user_telegram_id: 1,
        target_wallet: '0xLEADER',
        sizing_mode: 'mirror',
        sizing_value: 1,
        direction: 'all',
        max_per_trade: null,
        smart_copy_enabled: false,
        smart_copy_min_confidence: 0.7,
        smart_copy_categories: null,
      });

      const active = configs.getActiveByUser(1);
      configs.updateLastSeenTrade(active[0].id, 'trade_xyz');

      const updated = configs.getByUserAndWallet(1, '0xLEADER');
      expect(updated!.last_seen_trade_id).toBe('trade_xyz');
    });

    it('deactivates a config', () => {
      configs.create({
        user_telegram_id: 1,
        target_wallet: '0xLEADER',
        sizing_mode: 'percent',
        sizing_value: 10,
        direction: 'all',
        max_per_trade: null,
        smart_copy_enabled: false,
        smart_copy_min_confidence: 0.7,
        smart_copy_categories: null,
      });

      const active = configs.getActiveByUser(1);
      configs.deactivate(active[0].id);

      const afterDeactivate = configs.getActiveByUser(1);
      expect(afterDeactivate).toHaveLength(0);
    });

    it('lists all active configs across users', () => {
      userQ.create({ telegram_id: 2, privy_user_id: 'p2', safe_address: '0x2', deposit_address: '0xD2' });

      configs.create({
        user_telegram_id: 1,
        target_wallet: '0xLEADER1',
        sizing_mode: 'percent',
        sizing_value: 10,
        direction: 'all',
        max_per_trade: null,
        smart_copy_enabled: false,
        smart_copy_min_confidence: 0.7,
        smart_copy_categories: null,
      });
      configs.create({
        user_telegram_id: 2,
        target_wallet: '0xLEADER2',
        sizing_mode: 'fixed',
        sizing_value: 50,
        direction: 'sells_only',
        max_per_trade: 100,
        smart_copy_enabled: true,
        smart_copy_min_confidence: 0.8,
        smart_copy_categories: ['politics', 'whales'],
      });

      const allActive = configs.listAllActive();
      expect(allActive).toHaveLength(2);
    });

    it('round-trips smart_copy_categories as JSON', () => {
      const categories = ['politics', 'whales', 'movers'];
      configs.create({
        user_telegram_id: 1,
        target_wallet: '0xLEADER',
        sizing_mode: 'percent',
        sizing_value: 10,
        direction: 'all',
        max_per_trade: null,
        smart_copy_enabled: true,
        smart_copy_min_confidence: 0.85,
        smart_copy_categories: categories,
      });

      const config = configs.getByUserAndWallet(1, '0xLEADER');
      expect(config!.smart_copy_categories).toEqual(categories);
      expect(config!.smart_copy_enabled).toBe(true);
      expect(config!.smart_copy_min_confidence).toBe(0.85);
    });
  });

  describe('AlertSentQueries', () => {
    let alerts: AlertSentQueries;

    beforeEach(() => {
      alerts = new AlertSentQueries(db);
    });

    it('inserts an alert and checks recent existence', () => {
      alerts.insert({
        category: 'whales',
        title: 'Whale alert!',
        market_condition_id: 'cond_abc',
      });

      // Should find it as recent (within last hour)
      const exists = alerts.existsRecent('whales', 'cond_abc', 60);
      expect(exists).toBe(true);
    });

    it('returns false for non-existent recent alert', () => {
      const exists = alerts.existsRecent('whales', 'cond_xyz', 60);
      expect(exists).toBe(false);
    });

    it('returns false for old alert outside window', () => {
      // Insert with an old timestamp manually
      db.raw.prepare(`
        INSERT INTO alerts_sent (category, title, market_condition_id, created_at)
        VALUES ('whales', 'Old alert', 'cond_old', '2020-01-01T00:00:00Z')
      `).run();

      const exists = alerts.existsRecent('whales', 'cond_old', 60);
      expect(exists).toBe(false);
    });
  });

  describe('LeaderboardCacheQueries', () => {
    let leaderboard: LeaderboardCacheQueries;
    let userQ: UserQueries;

    beforeEach(() => {
      leaderboard = new LeaderboardCacheQueries(db);
      userQ = new UserQueries(db);
      userQ.create({ telegram_id: 1, privy_user_id: 'p1', safe_address: '0x1', deposit_address: '0xD1' });
      userQ.create({ telegram_id: 2, privy_user_id: 'p2', safe_address: '0x2', deposit_address: '0xD2' });
      userQ.create({ telegram_id: 3, privy_user_id: 'p3', safe_address: '0x3', deposit_address: '0xD3' });
    });

    it('upserts and retrieves top entries', () => {
      leaderboard.upsert({
        user_telegram_id: 1,
        period: '7d',
        pnl: 500.5,
        win_rate: 0.65,
        trade_count: 20,
      });
      leaderboard.upsert({
        user_telegram_id: 2,
        period: '7d',
        pnl: 1200.0,
        win_rate: 0.80,
        trade_count: 15,
      });
      leaderboard.upsert({
        user_telegram_id: 3,
        period: '7d',
        pnl: 300.0,
        win_rate: 0.55,
        trade_count: 30,
      });

      const top = leaderboard.getTop('7d', 2);
      expect(top).toHaveLength(2);
      expect(top[0].user_telegram_id).toBe(2); // highest PnL
      expect(top[1].user_telegram_id).toBe(1);
    });

    it('upserts same user+period (updates rather than duplicates)', () => {
      leaderboard.upsert({
        user_telegram_id: 1,
        period: '7d',
        pnl: 100,
        win_rate: 0.5,
        trade_count: 10,
      });
      leaderboard.upsert({
        user_telegram_id: 1,
        period: '7d',
        pnl: 200,
        win_rate: 0.6,
        trade_count: 15,
      });

      const top = leaderboard.getTop('7d', 10);
      expect(top).toHaveLength(1);
      expect(top[0].pnl).toBe(200);
      expect(top[0].win_rate).toBe(0.6);
    });
  });

  describe('CopyLeaderEarningQueries', () => {
    let earnings: CopyLeaderEarningQueries;
    let userQ: UserQueries;
    let tradeQ: TradeQueries;

    beforeEach(() => {
      earnings = new CopyLeaderEarningQueries(db);
      userQ = new UserQueries(db);
      tradeQ = new TradeQueries(db);

      userQ.create({ telegram_id: 1, privy_user_id: 'p1', safe_address: '0x1', deposit_address: '0xD1' });
      userQ.create({ telegram_id: 2, privy_user_id: 'p2', safe_address: '0x2', deposit_address: '0xD2' });
      userQ.create({ telegram_id: 3, privy_user_id: 'p3', safe_address: '0x3', deposit_address: '0xD3' });

      tradeQ.insert({
        user_telegram_id: 2,
        market_condition_id: 'cond_1',
        token_id: 'tok_1',
        side: 'BUY',
        price: 0.5,
        size: 100,
        fee_amount: 0.5,
        source: 'copy',
        tx_hash: '0xTX1',
      });
      tradeQ.insert({
        user_telegram_id: 3,
        market_condition_id: 'cond_2',
        token_id: 'tok_2',
        side: 'BUY',
        price: 0.6,
        size: 200,
        fee_amount: 1.0,
        source: 'copy',
        tx_hash: '0xTX2',
      });
    });

    it('inserts earnings and gets total by leader', () => {
      earnings.insert({ leader_telegram_id: 1, copier_telegram_id: 2, fee_earned: 2.5, trade_id: 1 });
      earnings.insert({ leader_telegram_id: 1, copier_telegram_id: 3, fee_earned: 3.0, trade_id: 2 });

      const total = earnings.getTotalByLeader(1);
      expect(total).toBeCloseTo(5.5);
    });

    it('returns 0 total for leader with no earnings', () => {
      const total = earnings.getTotalByLeader(999);
      expect(total).toBe(0);
    });

    it('gets weekly earnings by leader', () => {
      earnings.insert({ leader_telegram_id: 1, copier_telegram_id: 2, fee_earned: 2.5, trade_id: 1 });

      // Insert an old earning manually
      db.raw.prepare(`
        INSERT INTO copy_leader_earnings (leader_telegram_id, copier_telegram_id, fee_earned, trade_id, created_at)
        VALUES (1, 3, 10.0, 2, '2020-01-01T00:00:00Z')
      `).run();

      const weekly = earnings.getWeeklyByLeader(1);
      expect(weekly).toBeCloseTo(2.5);
    });

    it('gets copier count', () => {
      earnings.insert({ leader_telegram_id: 1, copier_telegram_id: 2, fee_earned: 2.5, trade_id: 1 });
      earnings.insert({ leader_telegram_id: 1, copier_telegram_id: 3, fee_earned: 3.0, trade_id: 2 });
      // Duplicate copier should not be double-counted
      earnings.insert({ leader_telegram_id: 1, copier_telegram_id: 2, fee_earned: 1.0, trade_id: 1 });

      const count = earnings.getCopierCount(1);
      expect(count).toBe(2);
    });
  });
});

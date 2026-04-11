import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferralService } from '../src/referrals';
import type { User } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    telegram_id: 100,
    privy_user_id: 'privy-1',
    privy_wallet_id: 'wallet-1',
    signer_address: '0xsigner',
    safe_address: '0xsafe',
    deposit_address: '0xsafe',
    created_at: '2024-01-01T00:00:00Z',
    alert_preferences: {
      whales: true, politics: true, movers: true,
      new_markets: true, risk_reward: true, smart_money: true,
    },
    referred_by: null,
    fee_rate: 0.005,
    fee_rate_expires: null,
    digest_enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReferralService', () => {
  let service: ReferralService;
  let mockUserQueries: any;

  beforeEach(() => {
    mockUserQueries = {
      getByTelegramId: vi.fn(),
      setReferredBy: vi.fn(),
      listAll: vi.fn().mockReturnValue([]),
    };
    service = new ReferralService(mockUserQueries);
  });

  // -----------------------------------------------------------------------
  // parseReferralCode
  // -----------------------------------------------------------------------

  describe('parseReferralCode', () => {
    it('parses valid referral code', () => {
      expect(service.parseReferralCode('ref_12345')).toBe(12345);
    });

    it('returns null for empty string', () => {
      expect(service.parseReferralCode('')).toBeNull();
    });

    it('returns null for invalid format', () => {
      expect(service.parseReferralCode('ref_abc')).toBeNull();
      expect(service.parseReferralCode('copy_123')).toBeNull();
      expect(service.parseReferralCode('12345')).toBeNull();
      expect(service.parseReferralCode('ref_')).toBeNull();
    });

    it('handles large telegram IDs', () => {
      expect(service.parseReferralCode('ref_9876543210')).toBe(9876543210);
    });
  });

  // -----------------------------------------------------------------------
  // parseCopyLeaderCode
  // -----------------------------------------------------------------------

  describe('parseCopyLeaderCode', () => {
    it('parses valid copy leader code', () => {
      expect(service.parseCopyLeaderCode('copy_12345')).toBe(12345);
    });

    it('returns null for referral codes', () => {
      expect(service.parseCopyLeaderCode('ref_12345')).toBeNull();
    });

    it('returns null for invalid input', () => {
      expect(service.parseCopyLeaderCode('')).toBeNull();
      expect(service.parseCopyLeaderCode('copy_')).toBeNull();
      expect(service.parseCopyLeaderCode('copy_abc')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // processReferral
  // -----------------------------------------------------------------------

  describe('processReferral', () => {
    it('records referral when referrer exists', () => {
      mockUserQueries.getByTelegramId.mockReturnValue(
        createMockUser({ telegram_id: 100 }),
      );

      const result = service.processReferral(200, 'ref_100');

      expect(result).toBe(true);
      expect(mockUserQueries.setReferredBy).toHaveBeenCalledWith(200, 100);
    });

    it('rejects self-referral', () => {
      const result = service.processReferral(100, 'ref_100');

      expect(result).toBe(false);
      expect(mockUserQueries.setReferredBy).not.toHaveBeenCalled();
    });

    it('rejects when referrer does not exist', () => {
      mockUserQueries.getByTelegramId.mockReturnValue(undefined);

      const result = service.processReferral(200, 'ref_999');

      expect(result).toBe(false);
      expect(mockUserQueries.setReferredBy).not.toHaveBeenCalled();
    });

    it('rejects invalid referral code', () => {
      const result = service.processReferral(200, 'invalid');

      expect(result).toBe(false);
      expect(mockUserQueries.getByTelegramId).not.toHaveBeenCalled();
    });

    it('rejects empty payload', () => {
      const result = service.processReferral(200, '');

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getReferralStats
  // -----------------------------------------------------------------------

  describe('getReferralStats', () => {
    it('returns stats with correct referral count', () => {
      mockUserQueries.listAll.mockReturnValue([
        createMockUser({ telegram_id: 200, referred_by: 100 }),
        createMockUser({ telegram_id: 300, referred_by: 100 }),
        createMockUser({ telegram_id: 400, referred_by: 500 }), // different referrer
      ]);

      const stats = service.getReferralStats(100);

      expect(stats.referralCount).toBe(2);
      expect(stats.referralLink).toBe('t.me/CapitolBetsBot?start=ref_100');
    });

    it('returns zero count when no referrals', () => {
      mockUserQueries.listAll.mockReturnValue([
        createMockUser({ telegram_id: 200, referred_by: 500 }),
      ]);

      const stats = service.getReferralStats(100);

      expect(stats.referralCount).toBe(0);
    });

    it('generates correct referral link', () => {
      const stats = service.getReferralStats(42);

      expect(stats.referralLink).toBe('t.me/CapitolBetsBot?start=ref_42');
    });
  });
});

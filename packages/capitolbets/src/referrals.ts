import type { UserQueries } from './db-queries';

// ---------------------------------------------------------------------------
// ReferralService
// ---------------------------------------------------------------------------

/**
 * Manages referral deep links, referral code parsing, and referral stats.
 *
 * Deep link format: t.me/CapitolBetsBot?start=ref_USERID
 * Copy leader link: t.me/CapitolBetsBot?start=copy_USERID
 */
export class ReferralService {
  private userQueries: UserQueries;

  constructor(userQueries: UserQueries) {
    this.userQueries = userQueries;
  }

  // -----------------------------------------------------------------------
  // Deep link parsing
  // -----------------------------------------------------------------------

  /**
   * Parse a referral code from /start deep link payload.
   * Returns the referrer's telegram_id, or null if invalid.
   *
   * Format: "ref_12345" -> 12345
   */
  parseReferralCode(startPayload: string): number | null {
    if (!startPayload) return null;
    const match = startPayload.match(/^ref_(\d+)$/);
    if (!match) return null;
    const id = parseInt(match[1], 10);
    return isNaN(id) ? null : id;
  }

  /**
   * Parse a copy leader code from /start deep link payload.
   * Returns the leader's telegram_id, or null if invalid.
   *
   * Format: "copy_12345" -> 12345
   */
  parseCopyLeaderCode(startPayload: string): number | null {
    if (!startPayload) return null;
    const match = startPayload.match(/^copy_(\d+)$/);
    if (!match) return null;
    const id = parseInt(match[1], 10);
    return isNaN(id) ? null : id;
  }

  // -----------------------------------------------------------------------
  // Referral setup
  // -----------------------------------------------------------------------

  /**
   * Process a referral from a /start deep link.
   * Sets referred_by on the new user if:
   *   - The referral code is valid
   *   - The referrer is not the same as the user (no self-referral)
   *   - The referrer exists in the database
   *
   * Returns true if referral was recorded.
   */
  processReferral(
    newUserTelegramId: number,
    startPayload: string,
  ): boolean {
    const referrerId = this.parseReferralCode(startPayload);
    if (!referrerId) return false;

    // No self-referral
    if (referrerId === newUserTelegramId) return false;

    // Check referrer exists
    const referrer = this.userQueries.getByTelegramId(referrerId);
    if (!referrer) return false;

    this.userQueries.setReferredBy(newUserTelegramId, referrerId);
    return true;
  }

  // -----------------------------------------------------------------------
  // Referral stats
  // -----------------------------------------------------------------------

  /**
   * Get referral stats for a user, including count, earnings, and share link.
   */
  getReferralStats(telegramId: number): ReferralStats {
    const referralCount = this.userQueries.countReferredBy(telegramId);

    return {
      referralCount,
      totalEarnings: 0, // Will be populated from referral_earnings table when available
      weeklyEarnings: 0,
      referralLink: `t.me/CapitolBetsBot?start=ref_${telegramId}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferralStats {
  referralCount: number;
  totalEarnings: number;
  weeklyEarnings: number;
  referralLink: string;
}

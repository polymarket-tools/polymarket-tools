// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a wallet address: 0x1234...5678
 */
export function formatWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a USD amount with sign and dollar symbol.
 * Positive amounts get a '+' prefix.
 *   formatUsd(12.5)   -> '+$12.50'
 *   formatUsd(-3.2)   -> '-$3.20'
 *   formatUsd(0)      -> '+$0.00'
 */
export function formatUsd(amount: number): string {
  if (amount >= 0) return `+$${amount.toFixed(2)}`;
  return `-$${Math.abs(amount).toFixed(2)}`;
}

/**
 * Format volume with abbreviation: $4.2M, $150K, $832, etc.
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    const m = volume / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    const k = volume / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${Math.round(volume)}`;
}

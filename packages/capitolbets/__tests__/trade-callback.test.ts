import { describe, it, expect } from 'vitest';
import { parseTradeCallback } from '../src/callbacks/trade';

// ---------------------------------------------------------------------------
// parseTradeCallback
// ---------------------------------------------------------------------------

describe('parseTradeCallback', () => {
  it('parses a BUY callback', () => {
    const result = parseTradeCallback('trade:BUY:abc123def456:50');
    expect(result).toEqual({
      side: 'BUY',
      tokenId: 'abc123def456',
      amount: 50,
    });
  });

  it('parses a SELL callback', () => {
    const result = parseTradeCallback('trade:SELL:xyz789:100');
    expect(result).toEqual({
      side: 'SELL',
      tokenId: 'xyz789',
      amount: 100,
    });
  });

  it('parses decimal amounts', () => {
    const result = parseTradeCallback('trade:BUY:token1:25.50');
    expect(result).toEqual({
      side: 'BUY',
      tokenId: 'token1',
      amount: 25.5,
    });
  });

  it('returns null for invalid format', () => {
    expect(parseTradeCallback('not:a:trade:callback')).toBeNull();
    expect(parseTradeCallback('trade:HOLD:token1:50')).toBeNull();
    expect(parseTradeCallback('')).toBeNull();
    expect(parseTradeCallback('deposit:manual')).toBeNull();
  });

  it('returns null for zero or negative amount', () => {
    expect(parseTradeCallback('trade:BUY:token1:0')).toBeNull();
    expect(parseTradeCallback('trade:BUY:token1:-10')).toBeNull();
  });

  it('returns null for non-numeric amount', () => {
    expect(parseTradeCallback('trade:BUY:token1:abc')).toBeNull();
  });
});

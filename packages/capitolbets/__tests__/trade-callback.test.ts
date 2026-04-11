import { describe, it, expect } from 'vitest';
import { parseTradeCallback } from '../src/callbacks/trade';

// ---------------------------------------------------------------------------
// parseTradeCallback
// ---------------------------------------------------------------------------

describe('parseTradeCallback', () => {
  it('parses a BUY callback with conditionId', () => {
    const result = parseTradeCallback('trade:BUY:abc123def456:cond001:50');
    expect(result).toEqual({
      side: 'BUY',
      tokenId: 'abc123def456',
      conditionId: 'cond001',
      amount: 50,
    });
  });

  it('parses a SELL callback with conditionId', () => {
    const result = parseTradeCallback('trade:SELL:xyz789:cond002:100');
    expect(result).toEqual({
      side: 'SELL',
      tokenId: 'xyz789',
      conditionId: 'cond002',
      amount: 100,
    });
  });

  it('parses decimal amounts', () => {
    const result = parseTradeCallback('trade:BUY:token1:cond003:25.50');
    expect(result).toEqual({
      side: 'BUY',
      tokenId: 'token1',
      conditionId: 'cond003',
      amount: 25.5,
    });
  });

  it('returns null for invalid format', () => {
    expect(parseTradeCallback('not:a:trade:callback')).toBeNull();
    expect(parseTradeCallback('trade:HOLD:token1:cond1:50')).toBeNull();
    expect(parseTradeCallback('')).toBeNull();
    expect(parseTradeCallback('deposit:manual')).toBeNull();
  });

  it('returns null for old 4-segment format (no conditionId)', () => {
    expect(parseTradeCallback('trade:BUY:token1:50')).toBeNull();
  });

  it('returns null for zero or negative amount', () => {
    expect(parseTradeCallback('trade:BUY:token1:cond1:0')).toBeNull();
    expect(parseTradeCallback('trade:BUY:token1:cond1:-10')).toBeNull();
  });

  it('returns null for non-numeric amount', () => {
    expect(parseTradeCallback('trade:BUY:token1:cond1:abc')).toBeNull();
  });
});

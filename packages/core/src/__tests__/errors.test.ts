import { describe, it, expect } from 'vitest';
import { sanitizeError } from '../errors';
import { PolymarketError } from '../types';

describe('sanitizeError', () => {
  it('wraps a string error in PolymarketError', () => {
    const result = sanitizeError('something went wrong', 500, '/markets');
    expect(result).toBeInstanceOf(PolymarketError);
    expect(result.message).toBe('something went wrong');
    expect(result.statusCode).toBe(500);
    expect(result.endpoint).toBe('/markets');
  });

  it('wraps an Error in PolymarketError', () => {
    const result = sanitizeError(new Error('bad request'), 400, '/orders');
    expect(result).toBeInstanceOf(PolymarketError);
    expect(result.message).toBe('bad request');
    expect(result.statusCode).toBe(400);
  });

  it('returns an existing PolymarketError unchanged', () => {
    const original = new PolymarketError('already wrapped', 503, '/api');
    const result = sanitizeError(original);
    expect(result).toBe(original);
  });

  it('strips apiKey from error messages', () => {
    const result = sanitizeError('Failed: apiKey=sk_live_abc123def', 500, '/');
    expect(result.message).not.toContain('sk_live_abc123def');
    expect(result.message).toContain('apiKey=[REDACTED]');
  });

  it('strips apiSecret from error messages', () => {
    const result = sanitizeError('Error with apiSecret=mySuper/Secret+Key==', 500, '/');
    expect(result.message).not.toContain('mySuper/Secret+Key==');
    expect(result.message).toContain('apiSecret=[REDACTED]');
  });

  it('strips apiPassphrase from error messages', () => {
    const result = sanitizeError('apiPassphrase=hunter2 failed', 500, '/');
    expect(result.message).not.toContain('hunter2');
    expect(result.message).toContain('apiPassphrase=[REDACTED]');
  });

  it('strips POLY_HMAC_AUTH from error messages', () => {
    const result = sanitizeError('POLY_HMAC_AUTH=abc123/+def== leaked', 500, '/');
    expect(result.message).not.toContain('abc123/+def==');
    expect(result.message).toContain('POLY_HMAC_AUTH=[REDACTED]');
  });

  it('strips Authorization header values', () => {
    const result = sanitizeError('Authorization=Bearer eyJhbGciOi.xyz.abc', 500, '/');
    expect(result.message).not.toContain('eyJhbGciOi');
    expect(result.message).toContain('Authorization=[REDACTED]');
  });

  it('strips multiple sensitive values in one message', () => {
    const msg = 'apiKey=k1 apiSecret=s2 Authorization=Bearer tok3';
    const result = sanitizeError(msg, 500, '/');
    expect(result.message).not.toContain('k1');
    expect(result.message).not.toContain('s2');
    expect(result.message).not.toContain('tok3');
  });

  it('handles non-Error non-string values', () => {
    const result = sanitizeError(42, 500, '/');
    expect(result.message).toBe('42');
  });

  it('defaults statusCode to 0 and endpoint to empty string', () => {
    const result = sanitizeError('test error');
    expect(result.statusCode).toBe(0);
    expect(result.endpoint).toBe('');
  });
});

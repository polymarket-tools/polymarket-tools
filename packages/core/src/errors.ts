import { PolymarketError } from './types';

/**
 * Patterns that match sensitive auth data in error messages.
 * Each pattern replaces the matched value with a redacted placeholder.
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /apiKey[=:]\s*["']?[A-Za-z0-9_\-]+["']?/gi, replacement: 'apiKey=[REDACTED]' },
  { pattern: /apiSecret[=:]\s*["']?[A-Za-z0-9_\-/+=]+["']?/gi, replacement: 'apiSecret=[REDACTED]' },
  { pattern: /apiPassphrase[=:]\s*["']?[A-Za-z0-9_\-]+["']?/gi, replacement: 'apiPassphrase=[REDACTED]' },
  { pattern: /POLY_HMAC_AUTH[=:]\s*["']?[A-Za-z0-9_\-/+=]+["']?/gi, replacement: 'POLY_HMAC_AUTH=[REDACTED]' },
  { pattern: /Authorization[=:]\s*["']?(?:Bearer\s+)?[A-Za-z0-9_\-/+=.]+["']?/gi, replacement: 'Authorization=[REDACTED]' },
];

/**
 * Strip sensitive authentication data from error messages to prevent
 * leaking secrets in logs or n8n error displays.
 */
export function sanitizeError(
  error: unknown,
  statusCode: number = 0,
  endpoint: string = '',
): PolymarketError {
  let message: string;

  if (error instanceof PolymarketError) {
    return error;
  }

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = String(error);
  }

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, replacement);
  }

  return new PolymarketError(message, statusCode, endpoint);
}

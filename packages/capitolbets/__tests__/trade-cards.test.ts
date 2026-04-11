import { describe, it, expect } from 'vitest';
import { TradeCardGenerator, type TradeCardParams } from '../src/trade-cards';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TradeCardGenerator', () => {
  const generator = new TradeCardGenerator();

  // -----------------------------------------------------------------------
  // generateCard
  // -----------------------------------------------------------------------

  describe('generateCard', () => {
    it('generates a card for a profitable YES resolution', () => {
      const result = generator.generateCard({
        question: 'Fed rate cut by July?',
        entryPrice: 0.32,
        resolvedPrice: 1,
        profit: 340,
        returnPercent: 106,
      });

      expect(result).not.toBeNull();
      expect(result!.text).toContain('Called it.');
      expect(result!.text).toContain('Fed rate cut by July?');
      expect(result!.text).toContain('$0.32');
      expect(result!.text).toContain('Resolved YES');
      expect(result!.text).toContain('+$340.00 profit');
      expect(result!.text).toContain('+106% return');
      expect(result!.text).toContain('Powered by @CapitolBetsBot');
      expect(result!.keyboard).toBeDefined();
    });

    it('generates a card for a profitable NO resolution', () => {
      const result = generator.generateCard({
        question: 'Trump pardons before August?',
        entryPrice: 0.75,
        resolvedPrice: 0,
        profit: 50,
        returnPercent: 33,
      });

      expect(result).not.toBeNull();
      expect(result!.text).toContain('Resolved NO');
    });

    it('includes username when provided', () => {
      const result = generator.generateCard({
        question: 'Test market',
        entryPrice: 0.50,
        resolvedPrice: 1,
        profit: 100,
        returnPercent: 100,
        username: 'trader_chad',
      });

      expect(result).not.toBeNull();
      expect(result!.text).toContain('@trader_chad on @CapitolBetsBot');
      expect(result!.text).not.toContain('Powered by');
    });

    it('returns null for non-profitable trades (profit = 0)', () => {
      const result = generator.generateCard({
        question: 'Breakeven trade',
        entryPrice: 0.50,
        resolvedPrice: 1,
        profit: 0,
        returnPercent: 0,
      });

      expect(result).toBeNull();
    });

    it('returns null for losing trades (negative profit)', () => {
      const result = generator.generateCard({
        question: 'Bad trade',
        entryPrice: 0.80,
        resolvedPrice: 0,
        profit: -80,
        returnPercent: -100,
      });

      expect(result).toBeNull();
    });

    it('formats dollar amounts with 2 decimal places', () => {
      const result = generator.generateCard({
        question: 'Precision test',
        entryPrice: 0.3,
        resolvedPrice: 1,
        profit: 100.5,
        returnPercent: 233.33,
      });

      expect(result).not.toBeNull();
      expect(result!.text).toContain('$0.30');
      expect(result!.text).toContain('+$100.50');
    });
  });

  // -----------------------------------------------------------------------
  // formatShareText
  // -----------------------------------------------------------------------

  describe('formatShareText', () => {
    it('generates a single-line share text', () => {
      const text = generator.formatShareText({
        question: 'Fed rate cut by July?',
        entryPrice: 0.32,
        resolvedPrice: 1,
        profit: 340,
        returnPercent: 106,
      });

      expect(text).not.toBeNull();
      expect(text).toContain('Called it.');
      expect(text).toContain('Fed rate cut by July?');
      expect(text).toContain('+$340.00');
      expect(text).toContain('+106%');
      expect(text).toContain('@CapitolBetsBot');
    });

    it('returns null for non-profitable trades', () => {
      const text = generator.formatShareText({
        question: 'Bad trade',
        entryPrice: 0.80,
        resolvedPrice: 0,
        profit: -50,
        returnPercent: -62.5,
      });

      expect(text).toBeNull();
    });
  });
});

import { InlineKeyboard } from 'grammy';
import { GammaClient } from '@polymarket-tools/core';
import type { BotContext } from '../bot';

const gamma = new GammaClient();

/**
 * Format volume with abbreviation: $4.2M, $150K, $832, etc.
 */
function formatVolume(volume: number): string {
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

/**
 * Build inline keyboard with Buy YES / Buy NO buttons at $25, $50, $100.
 */
function buildTradeButtons(yesTokenId: string, noTokenId: string): InlineKeyboard {
  const amounts = [25, 50, 100];
  const keyboard = new InlineKeyboard();

  // Row 1: Buy YES at each amount
  for (const amount of amounts) {
    keyboard.text(`Buy YES $${amount}`, `trade:BUY:${yesTokenId}:${amount}`);
  }
  keyboard.row();

  // Row 2: Buy NO at each amount
  for (const amount of amounts) {
    keyboard.text(`Buy NO $${amount}`, `trade:BUY:${noTokenId}:${amount}`);
  }

  return keyboard;
}

export async function searchCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text ?? '';
  const query = text.replace(/^\/search\s*/, '').trim();

  if (!query) {
    await ctx.reply('Usage: /search <query>');
    return;
  }

  const markets = await gamma.searchMarkets({ query, active: true, limit: 3 });

  if (markets.length === 0) {
    await ctx.reply(`No markets found for '${query}'`);
    return;
  }

  // Send a header message
  await ctx.reply(`Results for "${query}":`);

  // Send each market as a separate message with its own inline keyboard
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];

    const yesToken = market.tokens.find((t) => t.outcome === 'Yes');
    const noToken = market.tokens.find((t) => t.outcome === 'No');

    if (!yesToken || !noToken) {
      // Skip markets without standard Yes/No tokens
      continue;
    }

    const vol = formatVolume(market.volume);
    const line = `${i + 1}. "${market.question}"\n   YES $${yesToken.price.toFixed(2)} | ${vol} vol`;

    const keyboard = buildTradeButtons(yesToken.tokenId, noToken.tokenId);
    await ctx.reply(line, { reply_markup: keyboard });
  }
}

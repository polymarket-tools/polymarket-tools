import { GammaClient } from '@polymarket-tools/core';
import type { BotContext } from '../bot';
import { formatVolume } from '../format';
import { buildTradeKeyboard } from '../keyboards';

const gamma = new GammaClient();

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

    const keyboard = buildTradeKeyboard(yesToken.tokenId, noToken.tokenId, market.conditionId);
    await ctx.reply(line, { reply_markup: keyboard });
  }
}

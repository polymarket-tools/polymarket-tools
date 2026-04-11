import { DataApiClient } from '@polymarket-tools/core';
import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import { formatUsd } from '../format';

const dataApi = new DataApiClient();

export async function portfolioCommand(ctx: BotContext): Promise<void> {
  if (!(await requireUser(ctx))) return;

  try {
    const positions = await dataApi.getWalletPositions(ctx.user.safe_address);

    if (positions.length === 0) {
      await ctx.reply('No open positions.');
      return;
    }

    let totalPnl = 0;
    const lines: string[] = [];

    for (const pos of positions) {
      const pctSign = pos.percentPnl >= 0 ? '+' : '';
      totalPnl += pos.cashPnl;

      lines.push(
        `${pos.outcome} | ${pos.market.slice(0, 8)}...\n` +
          `  Size: ${pos.size.toFixed(2)} | Avg: $${pos.avgPrice.toFixed(2)} | Value: $${pos.currentValue.toFixed(2)}\n` +
          `  P&L: ${formatUsd(pos.cashPnl)} (${pctSign}${pos.percentPnl.toFixed(1)}%)`
      );
    }

    const header = `Portfolio (${positions.length} position${positions.length === 1 ? '' : 's'})`;
    const footer = `\nTotal P&L: ${formatUsd(totalPnl)}`;

    await ctx.reply(`${header}\n\n${lines.join('\n\n')}${footer}`);
  } catch (error) {
    console.error(`Portfolio fetch failed for telegram_id=${ctx.user.telegram_id}:`, error);
    await ctx.reply('Could not fetch your portfolio. Please try again.');
  }
}

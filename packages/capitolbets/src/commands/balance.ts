import { formatUnits } from 'viem';
import type { BotContext } from '../bot';

export async function balanceCommand(ctx: BotContext): Promise<void> {
  if (!ctx.user) {
    await ctx.reply('You need to set up your wallet first. Type /start');
    return;
  }

  const depositMonitor = ctx.depositMonitor;
  if (!depositMonitor) {
    await ctx.reply('Balance service is temporarily unavailable. Please try again later.');
    return;
  }

  try {
    const balanceRaw = await depositMonitor.getUsdcBalance(ctx.user.safe_address as `0x${string}`);
    const balance = formatUnits(balanceRaw, 6);
    const formatted = parseFloat(balance).toFixed(2);
    await ctx.reply(`Balance: $${formatted} USDC`);
  } catch (error) {
    console.error(`Balance check failed for telegram_id=${ctx.user.telegram_id}:`, error);
    await ctx.reply('Could not fetch your balance. Please try again.');
  }
}

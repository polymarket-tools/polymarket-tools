import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../bot';
import { generateTransakUrl } from '../transak';

export async function depositCommand(ctx: BotContext): Promise<void> {
  if (!ctx.user) {
    await ctx.reply('You need to set up your wallet first. Type /start');
    return;
  }

  const safeAddress = ctx.user.safe_address;
  const transakApiKey = ctx.config.transakApiKey;

  // If Transak is configured, show both options
  if (transakApiKey) {
    const transakUrl = generateTransakUrl({
      apiKey: transakApiKey,
      walletAddress: safeAddress,
    });

    const keyboard = new InlineKeyboard()
      .url('Deposit with card', transakUrl)
      .row()
      .text('Send USDC manually', 'deposit:manual');

    await ctx.reply('How would you like to deposit?', {
      reply_markup: keyboard,
    });
  } else {
    // No Transak configured -- show manual deposit only
    await ctx.reply(
      `Send USDC (Polygon) to your deposit address:\n\n\`${safeAddress}\`\n\nOnly send USDC on the Polygon network.`,
      { parse_mode: 'Markdown' }
    );
  }
}

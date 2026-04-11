import type { BotContext } from '../bot';
import type { WalletManager } from '../wallet';
import type { UserQueries } from '../db-queries';
import { ReferralService } from '../referrals';

export async function startCommand(ctx: BotContext): Promise<void> {
  // Returning user
  if (ctx.user) {
    await ctx.reply(
      `Welcome back! Your deposit address:\n\n\`${ctx.user.safe_address}\`\n\nType /help for commands.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('Could not identify your Telegram account. Please try again.');
    return;
  }

  await ctx.reply(
    'Welcome to CapitolBets.\n\n' +
      'See what politicians do. Trade before the market catches up.\n\n' +
      'Setting up your wallet...'
  );

  const walletManager = ctx.walletManager;
  const userQueries = ctx.userQueries;

  if (!walletManager || !userQueries) {
    await ctx.reply(
      'Wallet service is temporarily unavailable. Please try again in a few minutes.'
    );
    return;
  }

  try {
    const result = await walletManager.createWallet(
      telegramId,
      ctx.from?.username,
      ctx.from?.first_name
    );

    userQueries.create({
      telegram_id: telegramId,
      privy_user_id: result.privyUserId,
      privy_wallet_id: result.privyWalletId,
      signer_address: result.signerAddress,
      safe_address: result.safeAddress,
      deposit_address: result.safeAddress,
    });

    // Process referral deep link (e.g., /start ref_12345)
    const startPayload = (ctx.match as string) ?? '';
    if (startPayload) {
      try {
        const referralService = new ReferralService(userQueries);
        const referred = referralService.processReferral(telegramId, startPayload);
        if (referred) {
          // Silently recorded -- no need to clutter the welcome message
        }
      } catch (err) {
        // Non-fatal: referral tracking failure should not block onboarding
        console.error(`Referral processing failed for telegram_id=${telegramId}:`, err);
      }
    }

    await ctx.reply(
      'Your wallet is ready!\n\n' +
        `Deposit address (Polygon):\n\`${result.safeAddress}\`\n\n` +
        'Send USDC to this address to start trading.\n\n' +
        'Type /help to see available commands.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error(`Wallet creation failed for telegram_id=${telegramId}:`, error);

    const message =
      error instanceof Error ? error.message : 'Unknown error';

    // Surface specific failure modes to the user
    if (message.includes('rate limit') || message.includes('RateLimit')) {
      await ctx.reply(
        'Too many requests. Please wait a minute and try /start again.'
      );
    } else {
      await ctx.reply(
        'Wallet setup failed. Please try /start again in a moment.\n' +
          'If this keeps happening, contact support.'
      );
    }
  }
}

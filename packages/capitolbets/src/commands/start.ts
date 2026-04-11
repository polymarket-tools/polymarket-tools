import type { BotContext } from '../bot';

export async function startCommand(ctx: BotContext): Promise<void> {
  if (ctx.user) {
    await ctx.reply('Welcome back! Type /help for commands.');
    return;
  }

  await ctx.reply(
    'Welcome to CapitolBets.\n\n' +
      'See what politicians do. Trade before the market catches up.\n\n' +
      'Setting up your wallet...'
  );

  // TODO: create user in DB after wallet creation (Task 1.4)
  // For now we just send the welcome message.
  // Once Privy wallet creation is wired up, this will:
  // 1. Create a Privy embedded wallet
  // 2. Deploy a Safe smart account
  // 3. Insert user record into DB
  // 4. Reply with deposit address and next steps
}

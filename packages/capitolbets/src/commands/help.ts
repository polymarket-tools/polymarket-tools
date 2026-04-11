import type { BotContext } from '../bot';

const HELP_TEXT = `CapitolBets Commands

Trading
/buy <market> <amount> [price] -- Buy shares
/sell <market> <amount> [price] -- Sell shares
/positions -- View your open positions
/portfolio -- Portfolio summary with P&L

Alerts
/alerts -- View your alert preferences
/alerts on <category> -- Enable alert category
/alerts off <category> -- Disable alert category
Categories: whales, politics, movers, new_markets, risk_reward, smart_money

Copy Trading
/copy <wallet> [amount] -- Copy a trader's moves
/copy stop <wallet> -- Stop copying a trader
/copy list -- View active copy configs

Account
/deposit -- Get your deposit address
/balance -- Check your USDC balance
/referral -- Get your referral link
/settings -- Account settings

Info
/market <query> -- Search markets
/trending -- Trending political markets
/leaderboard -- Top traders this week
/digest -- Get your daily digest now

/help -- Show this message`;

export async function helpCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(HELP_TEXT);
}

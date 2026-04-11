import { formatUnits, parseUnits, encodeFunctionData, parseAbi } from 'viem';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import type { Hex } from 'viem';
import type { BotContext } from '../bot';

/** Native USDC on Polygon (6 decimals) */
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const;
const USDC_DECIMALS = 6;

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function withdrawCommand(ctx: BotContext): Promise<void> {
  if (!ctx.user) {
    await ctx.reply('You need to set up your wallet first. Type /start');
    return;
  }

  const text = ctx.message?.text ?? '';
  const parts = text.replace(/^\/withdraw\s*/, '').trim().split(/\s+/);

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    await ctx.reply('Usage: /withdraw <amount> <address>\nExample: /withdraw 100 0xabc...');
    return;
  }

  const amountStr = parts[0];
  const toAddress = parts[1];

  // Validate amount
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount < 1) {
    await ctx.reply('Minimum withdrawal is $1 USDC.');
    return;
  }

  // Validate address
  if (!ADDRESS_RE.test(toAddress)) {
    await ctx.reply('Invalid address. Must be 0x followed by 40 hex characters.');
    return;
  }

  const walletManager = ctx.walletManager;
  const depositMonitor = ctx.depositMonitor;

  if (!walletManager || !depositMonitor) {
    await ctx.reply('Withdrawal service is temporarily unavailable. Please try again later.');
    return;
  }

  try {
    // Check balance
    const balanceRaw = await depositMonitor.getUsdcBalance(ctx.user.safe_address as Hex);
    const balanceUsdc = parseFloat(formatUnits(balanceRaw, USDC_DECIMALS));

    if (balanceUsdc < amount) {
      await ctx.reply(
        `Insufficient balance. You have $${balanceUsdc.toFixed(2)} USDC but requested $${amount.toFixed(2)}.`
      );
      return;
    }

    await ctx.reply('Processing withdrawal...');

    // Build the USDC transfer data
    const transferAmount = parseUnits(amount.toString(), USDC_DECIMALS);
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddress as Hex, transferAmount],
    });

    // Get the Safe instance
    const safe = await walletManager.getSafe(
      ctx.user.safe_address,
      ctx.user.signer_address as Hex
    );

    // Create Safe transaction
    const safeTx = await safe.createTransaction({
      transactions: [
        {
          to: USDC_ADDRESS,
          data: transferData,
          value: '0',
        },
      ],
    });

    // Sign with Privy wallet
    const signer = walletManager.getSignerForUser(
      ctx.user.privy_wallet_id,
      ctx.user.signer_address as Hex
    );

    const walletClient = createWalletClient({
      account: signer,
      chain: polygon,
      transport: http(ctx.config.polygonRpcUrl),
    });

    // Execute the Safe transaction
    const executeTxResponse = await safe.executeTransaction(safeTx);
    const txHash = executeTxResponse.hash;

    await ctx.reply(
      `Withdrawal sent!\n\n` +
        `Amount: $${amount.toFixed(2)} USDC\n` +
        `To: \`${toAddress}\`\n` +
        `Tx: [View on Polygonscan](https://polygonscan.com/tx/${txHash})`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error(`Withdrawal failed for telegram_id=${ctx.user.telegram_id}:`, error);
    await ctx.reply('Withdrawal failed. Please try again or contact support.');
  }
}

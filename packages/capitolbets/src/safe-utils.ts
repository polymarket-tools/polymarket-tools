import {
  encodeFunctionData,
  parseAbi,
  parseUnits,
  type Hex,
} from 'viem';
import type Safe from '@safe-global/protocol-kit';
import { USDC_ADDRESS, USDC_DECIMALS } from './constants';

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/**
 * Execute a USDC transfer from a Gnosis Safe.
 * Shared by fee collection (trading.ts) and withdrawals (commands/withdraw.ts).
 *
 * @returns The transaction hash.
 */
export async function sendUsdcFromSafe(
  safe: Safe,
  toAddress: string,
  amount: number,
): Promise<string> {
  const transferAmount = parseUnits(amount.toString(), USDC_DECIMALS);
  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [toAddress as Hex, transferAmount],
  });

  const safeTx = await safe.createTransaction({
    transactions: [
      {
        to: USDC_ADDRESS,
        data: transferData,
        value: '0',
      },
    ],
  });

  const result = await safe.executeTransaction(safeTx);
  return result.hash;
}

import { ClobClient, SignatureType } from '@polymarket/clob-client';
import { ClobPublicClient } from '@polymarket-tools/core';
import type { ClobTradingConfig } from '@polymarket-tools/core';
import {
  encodeFunctionData,
  parseAbi,
  parseUnits,
  type Hex,
} from 'viem';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import type Safe from '@safe-global/protocol-kit';
import type { TradeResult, User } from './types';
import type { WalletManager } from './wallet';
import type { TradeQueries } from './db-queries';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Native USDC on Polygon (6 decimals) */
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const;
const USDC_DECIMALS = 6;
const CLOB_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecuteTradeParams {
  user: User;
  tokenId: string;
  conditionId: string;
  side: 'BUY' | 'SELL';
  /** Trade amount in USDC (human-readable, e.g. 50 means $50) */
  amount: number;
  /** Price per share (0-1 range) */
  price: number;
}

/**
 * Cached CLOB API credentials for a user. Derived once from the user's
 * Privy wallet via EIP-712 signature, then reused for subsequent trades.
 */
interface UserClobCreds {
  key: string;
  secret: string;
  passphrase: string;
}

// ---------------------------------------------------------------------------
// TradingEngine
// ---------------------------------------------------------------------------

/**
 * TradingEngine executes trades on Polymarket on behalf of CapitolBets users.
 *
 * Architecture:
 * - Each user's CLOB API credentials are derived from their Privy wallet via
 *   `createOrDeriveApiKey()`. This requires an EIP-712 signature from the
 *   user's signer EOA.
 * - Orders are signed with SignatureType.POLY_GNOSIS_SAFE because funds live
 *   in the user's Gnosis Safe, not the signer EOA.
 * - The builder signing proxy (Cloudflare Worker) provides revenue attribution
 *   headers for every order.
 * - Fee collection is a separate Safe transaction (USDC transfer) executed
 *   before the CLOB order is placed. If the order fails, the fee is already
 *   collected. This is acceptable because:
 *   (a) Limit orders may not fill immediately anyway
 *   (b) The fee is the cost of the service, not the trade execution
 *   (c) In practice, FOK orders either fill or fail atomically on-chain
 */
export class TradingEngine {
  private feeCollectionAddress: string;
  private walletManager: WalletManager;
  private tradeQueries: TradeQueries;
  private builderSignerUrl: string;
  private polygonRpcUrl: string;
  private publicClient: ClobPublicClient;

  /** Cache of per-user CLOB API credentials (keyed by telegram_id) */
  private credentialCache = new Map<number, UserClobCreds>();

  constructor(params: {
    feeCollectionAddress: string;
    walletManager: WalletManager;
    tradeQueries: TradeQueries;
    builderSignerUrl: string;
    polygonRpcUrl: string;
  }) {
    this.feeCollectionAddress = params.feeCollectionAddress;
    this.walletManager = params.walletManager;
    this.tradeQueries = params.tradeQueries;
    this.builderSignerUrl = params.builderSignerUrl;
    this.polygonRpcUrl = params.polygonRpcUrl;
    this.publicClient = new ClobPublicClient({ host: CLOB_HOST });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a trade: collect fee, then place order on Polymarket CLOB.
   *
   * Flow:
   * 1. Calculate fee = amount * user.fee_rate
   * 2. Execute fee transfer from user's Safe to fee collection address
   * 3. Derive/retrieve user's CLOB API credentials
   * 4. Build and submit the order (amount - fee) to the CLOB
   * 5. Record the trade in the database
   */
  async executeTrade(params: ExecuteTradeParams): Promise<TradeResult> {
    const { user, tokenId, conditionId, side, amount, price } = params;

    // 1. Calculate fee
    const feeAmount = this.calculateFee(amount, user.fee_rate);
    const orderAmount = amount - feeAmount;

    if (orderAmount <= 0) {
      return {
        success: false,
        price,
        size: 0,
        feeAmount,
        error: 'Trade amount too small after fee deduction.',
      };
    }

    // 2. Collect fee via Safe transaction
    try {
      await this.collectFee(user, feeAmount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        price,
        size: orderAmount,
        feeAmount: 0,
        error: `Fee collection failed: ${message}`,
      };
    }

    // 3-4. Place order on CLOB
    let orderId: string;
    let txHash: string | undefined;
    try {
      const clobClient = await this.getClobClientForUser(user);

      // Calculate size in shares: amount_usdc / price_per_share
      const size = orderAmount / price;

      const userOrder = {
        tokenID: tokenId,
        side: side as any,
        price,
        size,
      };

      const signedOrder = await clobClient.createOrder(userOrder, undefined);
      const response = await clobClient.postOrder(signedOrder, 'FOK' as any);

      orderId = response.orderID ?? '';
      const status = String(response.status ?? 'unknown');

      if (!orderId) {
        return {
          success: false,
          price,
          size,
          feeAmount,
          error: `Order rejected by CLOB (status: ${status}). Fee was charged.`,
        };
      }

      txHash = response.transactionsHashes?.[0] ?? undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        price,
        size: orderAmount / price,
        feeAmount,
        error: `Order failed: ${message}. Fee was charged.`,
      };
    }

    // 5. Record trade in DB
    const size = orderAmount / price;
    try {
      this.tradeQueries.insert({
        user_telegram_id: user.telegram_id,
        market_condition_id: conditionId,
        token_id: tokenId,
        side,
        price,
        size,
        fee_amount: feeAmount,
        source: 'manual',
        tx_hash: txHash ?? orderId,
      });
    } catch (dbError) {
      // Non-fatal: trade executed but DB record failed. Log and continue.
      console.error(
        `[TradingEngine] Failed to record trade for user ${user.telegram_id}:`,
        dbError,
      );
    }

    return {
      success: true,
      orderId,
      price,
      size,
      feeAmount,
      txHash,
    };
  }

  /**
   * Calculate the fee for a given amount and rate.
   * Fee = amount * feeRate (e.g. 100 * 0.005 = 0.50)
   */
  calculateFee(amount: number, feeRate: number): number {
    return Math.round(amount * feeRate * 100) / 100; // round to cents
  }

  /**
   * Get the current price for a token from the CLOB.
   */
  async getCurrentPrice(tokenId: string): Promise<number> {
    return this.publicClient.getPrice(tokenId, 'buy');
  }

  // -----------------------------------------------------------------------
  // Private: Fee collection
  // -----------------------------------------------------------------------

  /**
   * Transfer fee USDC from user's Safe to the fee collection address.
   * Uses the same pattern as the withdraw command.
   */
  private async collectFee(user: User, feeAmount: number): Promise<string> {
    const transferAmount = parseUnits(feeAmount.toString(), USDC_DECIMALS);
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [this.feeCollectionAddress as Hex, transferAmount],
    });

    const safe = await this.walletManager.getSafe(
      user.safe_address,
      user.signer_address as Hex,
    );

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

  // -----------------------------------------------------------------------
  // Private: CLOB client management
  // -----------------------------------------------------------------------

  /**
   * Get an authenticated ClobClient for a user.
   *
   * Each user needs their own CLOB API credentials (key/secret/passphrase),
   * derived from their Privy wallet's EIP-712 signature. Credentials are
   * cached in memory after first derivation.
   *
   * The builder signing proxy is shared across all users for revenue
   * attribution.
   */
  private async getClobClientForUser(user: User): Promise<ClobClient> {
    // Get the Privy-managed signer for this user
    const signer = this.walletManager.getSignerForUser(
      user.privy_wallet_id,
      user.signer_address as Hex,
    );

    // Create a viem WalletClient (required by ClobClient)
    const walletClient = createWalletClient({
      account: signer,
      chain: polygon,
      transport: http(this.polygonRpcUrl),
    });

    // Check credential cache
    let creds = this.credentialCache.get(user.telegram_id);

    if (!creds) {
      // Derive API credentials for this user.
      // createOrDeriveApiKey() creates new creds or retrieves existing ones.
      const tempClient = new ClobClient(
        CLOB_HOST,
        POLYGON_CHAIN_ID,
        walletClient,
        undefined, // no creds yet
        SignatureType.POLY_GNOSIS_SAFE,
        user.safe_address, // funderAddress = Safe
      );

      const derived = await tempClient.createOrDeriveApiKey();
      creds = {
        key: derived.key,
        secret: derived.secret,
        passphrase: derived.passphrase,
      };
      this.credentialCache.set(user.telegram_id, creds);
    }

    // Build the builder config for revenue attribution
    const { BuilderConfig } = await import('@polymarket/builder-signing-sdk');
    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: { url: this.builderSignerUrl },
    });

    // Create the authenticated client with user creds + builder config
    return new ClobClient(
      CLOB_HOST,
      POLYGON_CHAIN_ID,
      walletClient,
      creds,
      SignatureType.POLY_GNOSIS_SAFE,
      user.safe_address, // funderAddress = Safe holds the funds
      undefined, // geoBlockToken
      undefined, // useServerTime
      builderConfig,
    );
  }

  /**
   * Clear cached credentials for a user (e.g. if they rotate keys).
   * @internal Exposed for testing.
   */
  clearCredentialCache(telegramId?: number): void {
    if (telegramId !== undefined) {
      this.credentialCache.delete(telegramId);
    } else {
      this.credentialCache.clear();
    }
  }
}

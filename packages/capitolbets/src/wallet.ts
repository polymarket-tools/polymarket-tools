import { PrivyClient } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';
import Safe from '@safe-global/protocol-kit';
import type { PredictedSafeProps } from '@safe-global/protocol-kit';
import type { Hex, LocalAccount } from 'viem';
import { polygon } from 'viem/chains';
import { createWalletClient, http } from 'viem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletCreationResult {
  privyUserId: string;
  privyWalletId: string;
  signerAddress: string;
  safeAddress: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SAFE_VERSION = '1.4.1' as const;
const SALT_NONCE = '0'; // deterministic per-user

// ---------------------------------------------------------------------------
// WalletManager
// ---------------------------------------------------------------------------

export class WalletManager {
  private privy: PrivyClient;
  private polygonRpcUrl: string;
  private safeCache = new Map<string, Safe>();

  constructor(params: {
    privyAppId: string;
    privyAppSecret: string;
    polygonRpcUrl: string;
  }) {
    this.privy = new PrivyClient({
      appId: params.privyAppId,
      appSecret: params.privyAppSecret,
    });
    this.polygonRpcUrl = params.polygonRpcUrl;
  }

  /**
   * Full onboarding flow for a new Telegram user:
   * 1. Create (or find existing) Privy user linked to Telegram ID
   * 2. Create a Privy server wallet for that user
   * 3. Predict a Gnosis Safe address owned by that wallet
   *
   * The Safe is NOT deployed here -- it is deployed lazily on first
   * transaction to save gas for users who never fund their account.
   */
  async createWallet(
    telegramId: number,
    telegramUsername?: string,
    telegramFirstName?: string
  ): Promise<WalletCreationResult> {
    // Step 1: Create Privy user linked to this Telegram account
    const privyUser = await this.privy.users().create({
      linked_accounts: [
        {
          type: 'telegram',
          telegram_user_id: String(telegramId),
          username: telegramUsername,
          first_name: telegramFirstName,
        },
      ],
    });

    // Step 2: Create a server-managed Ethereum wallet
    const wallet = await this.privy.wallets().create({
      chain_type: 'ethereum',
    });

    const signerAddress = wallet.address as Hex;
    const walletId = wallet.id;

    // Step 3: Predict the Safe address using Safe.init with predictedSafe
    // This avoids deploying the Safe on-chain until first transaction.
    const predictedSafe = this.buildPredictedSafe(signerAddress);

    const safe = await Safe.init({
      provider: this.polygonRpcUrl,
      signer: signerAddress,
      predictedSafe,
    });

    const safeAddress = await safe.getAddress();

    return {
      privyUserId: privyUser.id,
      privyWalletId: walletId,
      signerAddress,
      safeAddress,
    };
  }

  /**
   * Get a viem LocalAccount that can sign on behalf of the Privy wallet.
   * Used for Safe transaction signing and direct Privy wallet operations.
   */
  getSignerForUser(privyWalletId: string, address: Hex): LocalAccount {
    return createViemAccount(this.privy, {
      walletId: privyWalletId,
      address,
    });
  }

  /**
   * Get a Safe Protocol Kit instance for a deployed Safe.
   * Instances are cached by safeAddress for reuse.
   */
  async getSafe(
    safeAddress: string,
    signerAddress: Hex
  ): Promise<Safe> {
    const cacheKey = `${safeAddress}:${signerAddress}`;
    const cached = this.safeCache.get(cacheKey);
    if (cached) return cached;

    const safe = await Safe.init({
      provider: this.polygonRpcUrl,
      signer: signerAddress,
      safeAddress,
    });

    this.safeCache.set(cacheKey, safe);
    return safe;
  }

  /**
   * Deploy the Safe for a user. Called on first funded transaction.
   * Returns the deployed Safe address (should match the predicted one).
   */
  async deploySafe(
    privyWalletId: string,
    signerAddress: Hex
  ): Promise<string> {
    const predictedSafe = this.buildPredictedSafe(signerAddress);

    const safe = await Safe.init({
      provider: this.polygonRpcUrl,
      signer: signerAddress,
      predictedSafe,
    });

    const deploymentTx = await safe.createSafeDeploymentTransaction();

    // The Privy wallet sends the deployment tx
    const account = this.getSignerForUser(privyWalletId, signerAddress);
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(this.polygonRpcUrl),
    });

    await walletClient.sendTransaction({
      to: deploymentTx.to as Hex,
      data: deploymentTx.data as Hex,
      value: BigInt(deploymentTx.value),
      chain: polygon,
    });

    const address = await safe.getAddress();
    return address;
  }

  /** Expose the Privy client for advanced operations (e.g., user lookup). */
  getPrivyClient(): PrivyClient {
    return this.privy;
  }

  /** Build the PredictedSafeProps for a given signer address. */
  private buildPredictedSafe(signerAddress: string): PredictedSafeProps {
    return {
      safeAccountConfig: {
        owners: [signerAddress],
        threshold: 1,
      },
      safeDeploymentConfig: {
        saltNonce: SALT_NONCE,
        safeVersion: DEFAULT_SAFE_VERSION,
      },
    };
  }
}

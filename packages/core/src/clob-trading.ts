import { ClobClient, Chain } from '@polymarket/clob-client';
import type { ClobTradingConfig, PlaceOrderParams, Order, OrderSide } from './types';
import { sanitizeError } from './errors';

// Dynamic imports for viem to avoid TypeScript crawling into ox/webauthn .ts sources
async function createSigner(privateKey: string) {
  const { createWalletClient, http } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { polygon } = await import('viem/chains');

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: polygon,
    transport: http(),
  });
}

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_CHAIN_ID = Chain.POLYGON;
const CLIENT_INIT_MAX_RETRIES = 3;
const CLIENT_INIT_RETRY_DELAY_MS = 2_000;
const BALANCE_MAX_RETRIES = 3;
const BALANCE_RETRY_DELAY_MS = 500;

// ── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map our TimeInForce / OrderType to the SDK's OrderType string.
 * The SDK uses GTC/GTD for limit orders and FOK/FAK for market orders.
 */
function resolveOrderType(params: PlaceOrderParams): string {
  if (params.timeInForce) {
    return params.timeInForce;
  }
  return params.orderType === 'MARKET' ? 'FOK' : 'GTC';
}

/**
 * Normalize an SDK OpenOrder into our Order type.
 */
export function normalizeOpenOrder(raw: {
  id: string;
  status: string;
  asset_id: string;
  side: string;
  price: string;
  original_size: string;
  created_at: number;
}): Order {
  return {
    id: raw.id,
    status: raw.status,
    tokenId: raw.asset_id,
    side: raw.side.toUpperCase() as OrderSide,
    price: raw.price,
    size: raw.original_size,
    createdAt: new Date(raw.created_at * 1000).toISOString(),
  };
}

/**
 * Dynamically load @polymarket/builder-signing-sdk and create a BuilderConfig.
 * We import dynamically to avoid TypeScript module resolution issues since
 * the package is a transitive dependency of @polymarket/clob-client.
 */
async function createBuilderConfig(
  key: string,
  secret: string,
  passphrase: string,
): Promise<unknown> {
  const mod = await import('@polymarket/builder-signing-sdk');
  const { BuilderConfig } = mod as any;
  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  });
}

// ── ClobTradingClient ───────────────────────────────────────────

export class ClobTradingClient {
  private config: ClobTradingConfig;
  private client: ClobClient | null = null;

  constructor(config: ClobTradingConfig) {
    this.config = config;
    // Lazy: do NOT create ClobClient here
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Place an order on the CLOB. This is the money method:
   * 1. Get authenticated ClobClient
   * 2. Build order via client.createOrder() (does EIP-712 signing internally)
   * 3. If validateOnly, return the built order without submitting
   * 4. Submit via client.postOrder(signedOrder)
   * 5. Return normalized Order
   */
  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    try {
      const clobClient = await this.getClient();

      // The SDK's UserOrder expects Side enum values but they match our string literals
      const userOrder = {
        tokenID: params.tokenId,
        side: params.side as any,
        price: params.price,
        size: params.size,
      };

      const signedOrder = await clobClient.createOrder(userOrder, undefined);

      if (params.validateOnly) {
        return {
          id: '',
          status: 'validated',
          tokenId: params.tokenId,
          side: params.side,
          price: String(params.price),
          size: String(params.size),
          createdAt: new Date().toISOString(),
        };
      }

      // The SDK's postOrder expects OrderType enum but our string values match
      const orderType = resolveOrderType(params);
      const response = await clobClient.postOrder(signedOrder, orderType as any);

      const orderId = response.orderID ?? '';
      const status = String(response.status ?? 'unknown');

      // Reject if no order ID returned -- the CLOB may return numeric HTTP status codes
      // (e.g. 403 for insufficient balance) or simply omit the orderID on failure
      if (!orderId) {
        throw new Error(`Order rejected by CLOB (status: ${status}). Check wallet balance and permissions.`);
      }

      return {
        id: orderId,
        status,
        tokenId: params.tokenId,
        side: params.side,
        price: String(params.price),
        size: String(params.size),
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw sanitizeError(error, 0, 'placeOrder');
    }
  }

  /**
   * Cancel a single order by ID.
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      const clobClient = await this.getClient();
      await clobClient.cancelOrder({ orderID: orderId });
    } catch (error) {
      throw sanitizeError(error, 0, 'cancelOrder');
    }
  }

  /**
   * Cancel all open orders.
   */
  async cancelAllOrders(): Promise<void> {
    try {
      const clobClient = await this.getClient();
      await clobClient.cancelAll();
    } catch (error) {
      throw sanitizeError(error, 0, 'cancelAllOrders');
    }
  }

  /**
   * Get open orders, optionally filtered by market ID.
   */
  async getOpenOrders(marketId?: string): Promise<Order[]> {
    try {
      const clobClient = await this.getClient();
      const params = marketId ? { market: marketId } : undefined;
      const raw = await clobClient.getOpenOrders(params);

      // The SDK may return an array directly, an object with a data property,
      // or an unexpected shape -- handle all cases defensively
      let orders: unknown[];
      if (Array.isArray(raw)) {
        orders = raw;
      } else if (raw && typeof raw === 'object' && Array.isArray((raw as any).data)) {
        orders = (raw as any).data;
      } else {
        orders = [];
      }
      return orders.map((o: any) => normalizeOpenOrder(o));
    } catch (error) {
      throw sanitizeError(error, 0, 'getOpenOrders');
    }
  }

  /**
   * Get balance and allowance for a conditional token.
   * Retries up to 3 times on inconsistent (zero) returns (#300).
   */
  async getBalanceAllowance(
    tokenId: string,
  ): Promise<{ balance: number; allowance: number }> {
    try {
      const clobClient = await this.getClient();

      for (let attempt = 1; attempt <= BALANCE_MAX_RETRIES; attempt++) {
        const raw = await clobClient.getBalanceAllowance({
          asset_type: 'CONDITIONAL' as any,
          token_id: tokenId,
        });

        const balance = Number(raw.balance);
        const allowance = Number(raw.allowance);

        // If both are 0 and we haven't exhausted retries, try again
        // Known issue #300: first call can return inconsistent zeros
        if (balance === 0 && allowance === 0 && attempt < BALANCE_MAX_RETRIES) {
          await sleep(BALANCE_RETRY_DELAY_MS);
          continue;
        }

        return { balance, allowance };
      }

      // Should not reach here, but satisfy TypeScript
      return { balance: 0, allowance: 0 };
    } catch (error) {
      throw sanitizeError(error, 0, 'getBalanceAllowance');
    }
  }

  // ── Private ─────────────────────────────────────────────────

  /**
   * Lazy-initialize the ClobClient. Retries up to 3 times with a 2-second
   * delay to handle the known issue where API keys can be invalid for
   * ~2 minutes after creation (#311).
   */
  private async getClient(): Promise<ClobClient> {
    if (this.client) {
      return this.client;
    }

    const chainId = this.config.chainId
      ? Number(this.config.chainId)
      : DEFAULT_CHAIN_ID;

    const creds = {
      key: this.config.apiKey,
      secret: this.config.apiSecret,
      passphrase: this.config.apiPassphrase,
    };

    // Build builder config if a builder code (builder API key) is provided.
    // The SDK's BuilderConfig takes localBuilderCreds { key, secret, passphrase }.
    let builderConfig: unknown;
    if (this.config.builderCode && this.config.builderSecret && this.config.builderPassphrase) {
      builderConfig = await createBuilderConfig(
        this.config.builderCode,
        this.config.builderSecret,
        this.config.builderPassphrase,
      );
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= CLIENT_INIT_MAX_RETRIES; attempt++) {
      try {
        // Create a viem WalletClient from the private key for EIP-712 signing
        const wallet = await createSigner(this.config.privateKey);

        this.client = new ClobClient(
          this.config.host,
          chainId,
          wallet,
          creds,
          undefined, // signatureType
          undefined, // funderAddress
          undefined, // geoBlockToken
          undefined, // useServerTime
          builderConfig as any,
        );
        return this.client;
      } catch (error) {
        lastError = error;
        if (attempt < CLIENT_INIT_MAX_RETRIES) {
          await sleep(CLIENT_INIT_RETRY_DELAY_MS);
        }
      }
    }

    throw sanitizeError(lastError, 0, 'getClient');
  }
}

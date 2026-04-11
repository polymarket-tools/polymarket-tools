import {
  createPublicClient,
  http,
  parseAbi,
  type PublicClient,
  type Address,
  type Log,
  formatUnits,
} from 'viem';
import { polygon } from 'viem/chains';
import type { Database } from './db';
import { USDC_ADDRESS, USDC_E_ADDRESS, USDC_DECIMALS } from './constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address account) view returns (uint256)',
]);

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const ADDRESS_REFRESH_INTERVAL_MS = 5 * 60_000; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback to send a notification to a Telegram user. Keeps bot dependency decoupled. */
export type NotifyFn = (telegramId: number, message: string) => Promise<void>;

interface SafeAddressEntry {
  telegram_id: number;
  safe_address: string;
}

// ---------------------------------------------------------------------------
// DepositMonitor
// ---------------------------------------------------------------------------

export class DepositMonitor {
  private client: PublicClient;
  private db: Database;
  private notify: NotifyFn;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private addressRefreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Map from lowercase Safe address to telegram_id */
  private safeAddressMap = new Map<string, number>();

  /** Block number we last checked up to (inclusive). null = not yet initialized. */
  private lastCheckedBlock: bigint | null = null;

  constructor(
    notify: NotifyFn,
    db: Database,
    rpcUrl: string,
  ) {
    this.notify = notify;
    this.db = db;
    this.client = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    // Seed the address cache
    this.refreshAddresses();

    // Start from the current block
    try {
      this.lastCheckedBlock = await this.client.getBlockNumber();
    } catch (err) {
      console.error('[DepositMonitor] Failed to get initial block number:', err);
      // Will retry on first poll
    }

    // Kick off polling
    this.pollTimer = setInterval(() => {
      this.checkDeposits().catch((err) => {
        console.error('[DepositMonitor] Poll error:', err);
      });
    }, POLL_INTERVAL_MS);

    // Periodically refresh known addresses
    this.addressRefreshTimer = setInterval(() => {
      this.refreshAddresses();
    }, ADDRESS_REFRESH_INTERVAL_MS);

    console.log('[DepositMonitor] Started. Polling every 30s.');
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.addressRefreshTimer) {
      clearInterval(this.addressRefreshTimer);
      this.addressRefreshTimer = null;
    }
    console.log('[DepositMonitor] Stopped.');
  }

  // -----------------------------------------------------------------------
  // Core polling
  // -----------------------------------------------------------------------

  async checkDeposits(): Promise<void> {
    if (this.safeAddressMap.size === 0) {
      return; // nothing to watch
    }

    let currentBlock: bigint;
    try {
      currentBlock = await this.client.getBlockNumber();
    } catch (err) {
      console.error('[DepositMonitor] Failed to get block number:', err);
      return;
    }

    // First run or recovery
    if (this.lastCheckedBlock === null) {
      this.lastCheckedBlock = currentBlock;
      return;
    }

    // Nothing new
    if (currentBlock <= this.lastCheckedBlock) {
      return;
    }

    const fromBlock = this.lastCheckedBlock + 1n;
    const toBlock = currentBlock;

    // Query Transfer logs for both USDC contracts in parallel
    const allLogs: Log[] = [];
    const toAddresses = [...this.safeAddressMap.keys()] as Address[];
    try {
      const [usdcLogs, usdcELogs] = await Promise.all([
        this.client.getLogs({
          address: USDC_ADDRESS as Address,
          event: TRANSFER_ABI[0] as any,
          args: { to: toAddresses },
          fromBlock,
          toBlock,
        }),
        this.client.getLogs({
          address: USDC_E_ADDRESS as Address,
          event: TRANSFER_ABI[0] as any,
          args: { to: toAddresses },
          fromBlock,
          toBlock,
        }),
      ]);
      allLogs.push(...usdcLogs, ...usdcELogs);
    } catch (err) {
      console.error(
        `[DepositMonitor] Failed to get logs:`,
        err,
      );
      // Don't advance lastCheckedBlock if we failed
      return;
    }

    // Process each matching transfer
    for (const log of allLogs) {
      await this.processTransferLog(log);
    }

    this.lastCheckedBlock = toBlock;
  }

  // -----------------------------------------------------------------------
  // Log processing
  // -----------------------------------------------------------------------

  private async processTransferLog(log: Log): Promise<void> {
    try {
      const args = (log as any).args;
      if (!args) return;

      const to = (args.to as string).toLowerCase();
      const value = args.value as bigint;
      const telegramId = this.safeAddressMap.get(to);
      if (!telegramId) return;

      const amount = formatUnits(value, USDC_DECIMALS);
      const safeAddress = to as Address;

      // Get updated balance
      let balanceStr: string;
      try {
        const balance = await this.getUsdcBalance(safeAddress);
        balanceStr = formatUnits(balance, USDC_DECIMALS);
      } catch {
        balanceStr = '?';
      }

      const tokenLabel =
        log.address?.toLowerCase() === USDC_E_ADDRESS.toLowerCase()
          ? 'USDC.e'
          : 'USDC';

      const message =
        `Received $${amount} ${tokenLabel}. Balance: $${balanceStr}. Ready to trade.`;

      await this.notify(telegramId, message);
    } catch (err) {
      console.error('[DepositMonitor] Error processing transfer log:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Balance query
  // -----------------------------------------------------------------------

  /** Get combined USDC + USDC.e balance for an address. */
  async getUsdcBalance(address: Address): Promise<bigint> {
    const [usdcBalance, usdcEBalance] = await Promise.all([
      this.client.readContract({
        address: USDC_ADDRESS,
        abi: TRANSFER_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      this.client.readContract({
        address: USDC_E_ADDRESS,
        abi: TRANSFER_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
    ]);
    return usdcBalance + usdcEBalance;
  }

  // -----------------------------------------------------------------------
  // Address management
  // -----------------------------------------------------------------------

  private refreshAddresses(): void {
    try {
      const rows = this.db.raw
        .prepare('SELECT telegram_id, safe_address FROM users')
        .all() as SafeAddressEntry[];

      this.safeAddressMap.clear();
      for (const row of rows) {
        this.safeAddressMap.set(row.safe_address.toLowerCase(), row.telegram_id);
      }
    } catch (err) {
      console.error('[DepositMonitor] Failed to refresh addresses:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Test helpers (exposed for tests only)
  // -----------------------------------------------------------------------

  /** @internal */
  get _safeAddressMap(): Map<string, number> {
    return this.safeAddressMap;
  }

  /** @internal */
  get _lastCheckedBlock(): bigint | null {
    return this.lastCheckedBlock;
  }

  /** @internal */
  set _lastCheckedBlock(block: bigint | null) {
    this.lastCheckedBlock = block;
  }
}

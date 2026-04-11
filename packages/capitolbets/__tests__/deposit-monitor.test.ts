import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DepositMonitor, type NotifyFn } from '../src/deposit-monitor';
import { formatUnits, parseUnits } from 'viem';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock viem so we can control the public client
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
  };
});

const mockClient = {
  getBlockNumber: vi.fn<() => Promise<bigint>>(),
  getLogs: vi.fn<(...args: any[]) => Promise<any[]>>(),
  readContract: vi.fn<(...args: any[]) => Promise<bigint>>(),
};

/** Minimal mock DB that exposes raw.prepare().all() for address refresh */
function createMockDb(users: Array<{ telegram_id: number; safe_address: string }>) {
  return {
    raw: {
      prepare: vi.fn(() => ({
        all: vi.fn(() => users),
        get: vi.fn(),
        run: vi.fn(),
      })),
    },
  } as any;
}

const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DepositMonitor', () => {
  let monitor: DepositMonitor;
  let notifyFn: ReturnType<typeof vi.fn>;
  let mockDb: ReturnType<typeof createMockDb>;

  const testUsers = [
    { telegram_id: 111, safe_address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' },
    { telegram_id: 222, safe_address: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    notifyFn = vi.fn<NotifyFn>().mockResolvedValue(undefined);
    mockDb = createMockDb(testUsers);
    monitor = new DepositMonitor(notifyFn, mockDb, 'http://localhost:8545');
  });

  afterEach(() => {
    monitor.stop();
  });

  // -----------------------------------------------------------------------
  // Address management
  // -----------------------------------------------------------------------

  describe('address management', () => {
    it('loads safe addresses from DB on start', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);

      await monitor.start();

      expect(monitor._safeAddressMap.size).toBe(2);
      expect(
        monitor._safeAddressMap.get(testUsers[0].safe_address.toLowerCase()),
      ).toBe(111);
      expect(
        monitor._safeAddressMap.get(testUsers[1].safe_address.toLowerCase()),
      ).toBe(222);
    });

    it('handles empty user list', async () => {
      const emptyDb = createMockDb([]);
      const m = new DepositMonitor(notifyFn, emptyDb, 'http://localhost:8545');
      mockClient.getBlockNumber.mockResolvedValue(100n);

      await m.start();

      expect(m._safeAddressMap.size).toBe(0);
      m.stop();
    });
  });

  // -----------------------------------------------------------------------
  // checkDeposits
  // -----------------------------------------------------------------------

  describe('checkDeposits', () => {
    it('does nothing when no safe addresses are registered', async () => {
      const emptyDb = createMockDb([]);
      const m = new DepositMonitor(notifyFn, emptyDb, 'http://localhost:8545');
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await m.start();

      await m.checkDeposits();

      expect(mockClient.getLogs).not.toHaveBeenCalled();
      m.stop();
    });

    it('initializes lastCheckedBlock on first call', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      expect(monitor._lastCheckedBlock).toBe(100n);
    });

    it('does nothing when no new blocks', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      // Same block number
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.checkDeposits();

      expect(mockClient.getLogs).not.toHaveBeenCalled();
    });

    it('queries Transfer logs for both USDC contracts when new blocks exist', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      mockClient.getBlockNumber.mockResolvedValue(105n);
      mockClient.getLogs.mockResolvedValue([]);

      await monitor.checkDeposits();

      // Should query both USDC and USDC.e
      expect(mockClient.getLogs).toHaveBeenCalledTimes(2);

      const call1 = mockClient.getLogs.mock.calls[0][0];
      expect(call1.address).toBe(USDC_ADDRESS);
      expect(call1.fromBlock).toBe(101n);
      expect(call1.toBlock).toBe(105n);

      const call2 = mockClient.getLogs.mock.calls[1][0];
      expect(call2.address).toBe(USDC_E_ADDRESS);
    });

    it('advances lastCheckedBlock after successful poll', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      mockClient.getBlockNumber.mockResolvedValue(110n);
      mockClient.getLogs.mockResolvedValue([]);

      await monitor.checkDeposits();

      expect(monitor._lastCheckedBlock).toBe(110n);
    });

    it('does not advance lastCheckedBlock on RPC error', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      mockClient.getBlockNumber.mockResolvedValue(110n);
      mockClient.getLogs.mockRejectedValue(new Error('RPC timeout'));

      await monitor.checkDeposits();

      // Should remain at 100n, not 110n
      expect(monitor._lastCheckedBlock).toBe(100n);
    });

    it('notifies user when USDC transfer is detected', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      const depositAmount = parseUnits('50', 6); // 50 USDC
      const balanceAmount = parseUnits('150', 6); // 150 USDC total

      mockClient.getBlockNumber.mockResolvedValue(105n);
      mockClient.getLogs
        .mockResolvedValueOnce([
          {
            address: USDC_ADDRESS,
            args: {
              from: '0x0000000000000000000000000000000000000001',
              to: testUsers[0].safe_address,
              value: depositAmount,
            },
          },
        ])
        .mockResolvedValueOnce([]); // USDC.e returns empty

      // Combined balance query: USDC + USDC.e
      mockClient.readContract
        .mockResolvedValueOnce(balanceAmount)  // USDC balance
        .mockResolvedValueOnce(0n);            // USDC.e balance

      await monitor.checkDeposits();

      expect(notifyFn).toHaveBeenCalledTimes(1);
      expect(notifyFn).toHaveBeenCalledWith(
        111,
        'Received $50 USDC. Balance: $150. Ready to trade.',
      );
    });

    it('notifies user when USDC.e transfer is detected', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      const depositAmount = parseUnits('25', 6);
      const balanceAmount = parseUnits('75', 6);

      mockClient.getBlockNumber.mockResolvedValue(105n);
      mockClient.getLogs
        .mockResolvedValueOnce([]) // USDC returns empty
        .mockResolvedValueOnce([
          {
            address: USDC_E_ADDRESS,
            args: {
              from: '0x0000000000000000000000000000000000000001',
              to: testUsers[1].safe_address,
              value: depositAmount,
            },
          },
        ]);

      mockClient.readContract
        .mockResolvedValueOnce(0n)             // USDC balance
        .mockResolvedValueOnce(balanceAmount); // USDC.e balance

      await monitor.checkDeposits();

      expect(notifyFn).toHaveBeenCalledTimes(1);
      expect(notifyFn).toHaveBeenCalledWith(
        222,
        'Received $25 USDC.e. Balance: $75. Ready to trade.',
      );
    });

    it('handles multiple deposits in one poll', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      mockClient.getBlockNumber.mockResolvedValue(110n);
      mockClient.getLogs
        .mockResolvedValueOnce([
          {
            address: USDC_ADDRESS,
            args: {
              from: '0x0000000000000000000000000000000000000001',
              to: testUsers[0].safe_address,
              value: parseUnits('10', 6),
            },
          },
          {
            address: USDC_ADDRESS,
            args: {
              from: '0x0000000000000000000000000000000000000002',
              to: testUsers[1].safe_address,
              value: parseUnits('20', 6),
            },
          },
        ])
        .mockResolvedValueOnce([]);

      mockClient.readContract.mockResolvedValue(parseUnits('100', 6));

      await monitor.checkDeposits();

      expect(notifyFn).toHaveBeenCalledTimes(2);
    });

    it('handles balance query failure gracefully', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      mockClient.getBlockNumber.mockResolvedValue(105n);
      mockClient.getLogs
        .mockResolvedValueOnce([
          {
            address: USDC_ADDRESS,
            args: {
              from: '0x0000000000000000000000000000000000000001',
              to: testUsers[0].safe_address,
              value: parseUnits('50', 6),
            },
          },
        ])
        .mockResolvedValueOnce([]);

      // Balance query fails
      mockClient.readContract.mockRejectedValue(new Error('RPC error'));

      await monitor.checkDeposits();

      // Should still notify, but with ? for balance
      expect(notifyFn).toHaveBeenCalledWith(
        111,
        'Received $50 USDC. Balance: $?. Ready to trade.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // getUsdcBalance
  // -----------------------------------------------------------------------

  describe('getUsdcBalance', () => {
    it('returns combined USDC + USDC.e balance', async () => {
      mockClient.readContract
        .mockResolvedValueOnce(parseUnits('100', 6)) // USDC
        .mockResolvedValueOnce(parseUnits('50', 6)); // USDC.e

      const balance = await monitor.getUsdcBalance(
        '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
      );

      expect(balance).toBe(parseUnits('150', 6));
      expect(mockClient.readContract).toHaveBeenCalledTimes(2);
    });

    it('returns just USDC balance when USDC.e is zero', async () => {
      mockClient.readContract
        .mockResolvedValueOnce(parseUnits('200', 6))
        .mockResolvedValueOnce(0n);

      const balance = await monitor.getUsdcBalance(
        '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
      );

      expect(balance).toBe(parseUnits('200', 6));
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('start() sets lastCheckedBlock to current block', async () => {
      mockClient.getBlockNumber.mockResolvedValue(500n);

      await monitor.start();

      expect(monitor._lastCheckedBlock).toBe(500n);
    });

    it('stop() clears timers', async () => {
      mockClient.getBlockNumber.mockResolvedValue(100n);
      await monitor.start();

      monitor.stop();

      // Should be safe to call stop() again
      monitor.stop();
    });

    it('handles getBlockNumber failure on start gracefully', async () => {
      mockClient.getBlockNumber.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await monitor.start();

      expect(monitor._lastCheckedBlock).toBeNull();
    });
  });
});

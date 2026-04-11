import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletManager } from '../src/wallet';

// ---------------------------------------------------------------------------
// Mock @privy-io/node
// ---------------------------------------------------------------------------

const mockUsersCreate = vi.fn();
const mockWalletsCreate = vi.fn();

vi.mock('@privy-io/node', () => ({
  PrivyClient: vi.fn().mockImplementation(() => ({
    users: () => ({ create: mockUsersCreate }),
    wallets: () => ({ create: mockWalletsCreate }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock @privy-io/node/viem
// ---------------------------------------------------------------------------

const mockCreateViemAccount = vi.fn();

vi.mock('@privy-io/node/viem', () => ({
  createViemAccount: (...args: unknown[]) => mockCreateViemAccount(...args),
}));

// ---------------------------------------------------------------------------
// Mock @safe-global/protocol-kit
// ---------------------------------------------------------------------------

const mockSafeInit = vi.fn();
const mockGetAddress = vi.fn();
const mockCreateSafeDeploymentTransaction = vi.fn();

vi.mock('@safe-global/protocol-kit', () => {
  const Safe = {
    init: (...args: unknown[]) => mockSafeInit(...args),
  };
  return {
    default: Safe,
  };
});

// ---------------------------------------------------------------------------
// Mock viem
// ---------------------------------------------------------------------------

const mockSendTransaction = vi.fn();

vi.mock('viem', () => ({
  createWalletClient: vi.fn().mockReturnValue({
    sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  }),
  http: vi.fn().mockReturnValue('mock-transport'),
}));

vi.mock('viem/chains', () => ({
  polygon: { id: 137, name: 'Polygon' },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletManager', () => {
  let wm: WalletManager;

  beforeEach(() => {
    vi.clearAllMocks();

    wm = new WalletManager({
      privyAppId: 'test-app-id',
      privyAppSecret: 'test-app-secret',
      polygonRpcUrl: 'https://polygon-rpc.com',
    });
  });

  describe('createWallet', () => {
    it('creates a Privy user, wallet, and predicts Safe address', async () => {
      mockUsersCreate.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [
          { type: 'telegram', telegram_user_id: '99999' },
        ],
      });

      mockWalletsCreate.mockResolvedValue({
        id: 'wallet-abc',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chain_type: 'ethereum',
      });

      const mockSafe = {
        getAddress: vi.fn().mockResolvedValue(
          '0xSAFE000000000000000000000000000000000001'
        ),
      };
      mockSafeInit.mockResolvedValue(mockSafe);

      const result = await wm.createWallet(99999, 'testuser', 'Test');

      // Verify Privy user was created with Telegram linked account
      expect(mockUsersCreate).toHaveBeenCalledWith({
        linked_accounts: [
          {
            type: 'telegram',
            telegram_user_id: '99999',
            username: 'testuser',
            first_name: 'Test',
          },
        ],
      });

      // Verify wallet was created
      expect(mockWalletsCreate).toHaveBeenCalledWith({
        chain_type: 'ethereum',
      });

      // Verify Safe.init was called with predictedSafe config
      expect(mockSafeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'https://polygon-rpc.com',
          signer: '0x1234567890abcdef1234567890abcdef12345678',
          predictedSafe: expect.objectContaining({
            safeAccountConfig: {
              owners: ['0x1234567890abcdef1234567890abcdef12345678'],
              threshold: 1,
            },
          }),
        })
      );

      // Verify result
      expect(result).toEqual({
        privyUserId: 'privy-user-123',
        privyWalletId: 'wallet-abc',
        signerAddress: '0x1234567890abcdef1234567890abcdef12345678',
        safeAddress: '0xSAFE000000000000000000000000000000000001',
      });
    });

    it('propagates Privy user creation errors', async () => {
      mockUsersCreate.mockRejectedValue(new Error('rate limit exceeded'));

      await expect(wm.createWallet(12345)).rejects.toThrow(
        'rate limit exceeded'
      );
    });

    it('propagates wallet creation errors', async () => {
      mockUsersCreate.mockResolvedValue({ id: 'privy-user-123' });
      mockWalletsCreate.mockRejectedValue(
        new Error('wallet creation failed')
      );

      await expect(wm.createWallet(12345)).rejects.toThrow(
        'wallet creation failed'
      );
    });

    it('works without optional Telegram fields', async () => {
      mockUsersCreate.mockResolvedValue({ id: 'privy-user-456' });
      mockWalletsCreate.mockResolvedValue({
        id: 'wallet-def',
        address: '0xabcdef0000000000000000000000000000000001',
      });
      const mockSafe = {
        getAddress: vi.fn().mockResolvedValue('0xSAFE002'),
      };
      mockSafeInit.mockResolvedValue(mockSafe);

      const result = await wm.createWallet(55555);

      expect(mockUsersCreate).toHaveBeenCalledWith({
        linked_accounts: [
          {
            type: 'telegram',
            telegram_user_id: '55555',
            username: undefined,
            first_name: undefined,
          },
        ],
      });

      expect(result.privyUserId).toBe('privy-user-456');
    });
  });

  describe('getSignerForUser', () => {
    it('returns a viem LocalAccount via createViemAccount', () => {
      const mockAccount = {
        address: '0x1234' as `0x${string}`,
        signMessage: vi.fn(),
        signTransaction: vi.fn(),
        signTypedData: vi.fn(),
      };
      mockCreateViemAccount.mockReturnValue(mockAccount);

      const account = wm.getSignerForUser(
        'wallet-abc',
        '0x1234567890abcdef1234567890abcdef12345678'
      );

      expect(mockCreateViemAccount).toHaveBeenCalledWith(
        expect.anything(), // the PrivyClient instance
        {
          walletId: 'wallet-abc',
          address: '0x1234567890abcdef1234567890abcdef12345678',
        }
      );

      expect(account).toBe(mockAccount);
    });
  });

  describe('getSafe', () => {
    it('initializes Safe with the correct config', async () => {
      const mockSafeInstance = {
        getAddress: mockGetAddress,
        createTransaction: vi.fn(),
      };
      mockSafeInit.mockResolvedValue(mockSafeInstance);

      const safe = await wm.getSafe(
        '0xSAFE001',
        '0xSIGNER' as `0x${string}`
      );

      expect(mockSafeInit).toHaveBeenCalledWith({
        provider: 'https://polygon-rpc.com',
        signer: '0xSIGNER',
        safeAddress: '0xSAFE001',
      });

      expect(safe).toBe(mockSafeInstance);
    });
  });

  describe('deploySafe', () => {
    it('creates a deployment transaction and sends it via Privy wallet', async () => {
      const mockSafeInstance = {
        getAddress: mockGetAddress.mockResolvedValue('0xDEPLOYED_SAFE'),
        createSafeDeploymentTransaction:
          mockCreateSafeDeploymentTransaction.mockResolvedValue({
            to: '0xFACTORY',
            data: '0xDEPLOY_DATA',
            value: '0',
          }),
      };
      mockSafeInit.mockResolvedValue(mockSafeInstance);

      mockCreateViemAccount.mockReturnValue({
        address: '0xSIGNER',
        signMessage: vi.fn(),
      });

      mockSendTransaction.mockResolvedValue('0xTX_HASH');

      const address = await wm.deploySafe(
        'wallet-abc',
        '0xSIGNER' as `0x${string}`
      );

      // Verify Safe was initialized with predicted config
      expect(mockSafeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'https://polygon-rpc.com',
          signer: '0xSIGNER',
          predictedSafe: expect.objectContaining({
            safeAccountConfig: {
              owners: ['0xSIGNER'],
              threshold: 1,
            },
          }),
        })
      );

      // Verify deployment tx was sent
      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '0xFACTORY',
          data: '0xDEPLOY_DATA',
          value: 0n,
        })
      );

      expect(address).toBe('0xDEPLOYED_SAFE');
    });
  });

  describe('getPrivyClient', () => {
    it('exposes the underlying Privy client', () => {
      const client = wm.getPrivyClient();
      expect(client).toBeDefined();
      expect(typeof client.users).toBe('function');
      expect(typeof client.wallets).toBe('function');
    });
  });
});

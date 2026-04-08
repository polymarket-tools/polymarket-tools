import { describe, it, expect, vi } from 'vitest';

// ── Mock the core library ─────────────────────────────────────────────
const { mockClobTradingClient } = vi.hoisted(() => ({
  mockClobTradingClient: vi.fn(),
}));

vi.mock('@polymarket-tools/core', () => ({
  ClobTradingClient: mockClobTradingClient,
  DEFAULT_CLOB_HOST: 'https://clob.polymarket.com',
}));

import { createTradingClient } from '../nodes/Polymarket/utils/createTradingClient';

describe('createTradingClient', () => {
  it('maps credential fields to ClobTradingClient config', async () => {
    const mockContext = {
      getCredentials: async () => ({
        apiKey: 'my-key',
        apiSecret: 'my-secret',
        apiPassphrase: 'my-pass',
        privateKey: '0xdeadbeef',
        builderCode: 'builder123',
      }),
    } as any;

    await createTradingClient(mockContext);

    expect(mockClobTradingClient).toHaveBeenCalledWith({
      host: 'https://clob.polymarket.com',
      apiKey: 'my-key',
      apiSecret: 'my-secret',
      apiPassphrase: 'my-pass',
      privateKey: '0xdeadbeef',
      builderCode: 'builder123',
    });
  });

  it('passes undefined for empty builderCode', async () => {
    const mockContext = {
      getCredentials: async () => ({
        apiKey: 'k',
        apiSecret: 's',
        apiPassphrase: 'p',
        privateKey: '0x1',
        builderCode: '',
      }),
    } as any;

    await createTradingClient(mockContext);

    expect(mockClobTradingClient).toHaveBeenCalledWith(
      expect.objectContaining({ builderCode: undefined }),
    );
  });
});

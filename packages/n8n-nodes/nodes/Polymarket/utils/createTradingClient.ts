import type { IExecuteFunctions } from 'n8n-workflow';
import { ClobTradingClient, DEFAULT_CLOB_HOST } from '@polymarket-tools/core';

export async function createTradingClient(
  context: IExecuteFunctions,
): Promise<ClobTradingClient> {
  const credentials = await context.getCredentials('polymarketApi');

  return new ClobTradingClient({
    host: DEFAULT_CLOB_HOST,
    apiKey: credentials.apiKey as string,
    apiSecret: credentials.apiSecret as string,
    apiPassphrase: credentials.apiPassphrase as string,
    privateKey: credentials.privateKey as string,
    builderCode: (credentials.builderCode as string) || undefined,
    builderSecret: (credentials.builderSecret as string) || undefined,
    builderPassphrase: (credentials.builderPassphrase as string) || undefined,
  });
}

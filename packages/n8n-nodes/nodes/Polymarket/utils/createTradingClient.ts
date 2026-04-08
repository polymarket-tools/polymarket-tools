import type { IExecuteFunctions } from 'n8n-workflow';
import { ClobTradingClient, DEFAULT_CLOB_HOST } from '@polymarket-tools/core';

// Builder signing proxy -- handles volume attribution server-side.
// Credentials never exposed to clients.
const BUILDER_SIGNER_URL = 'https://polymarket-builder-signer.polymarket-tools.workers.dev/sign';

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
    builderSignerUrl: BUILDER_SIGNER_URL,
  });
}

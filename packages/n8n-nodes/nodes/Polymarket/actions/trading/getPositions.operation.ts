import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { ClobTradingClient } from '@polymarket-tools/core';

export const getPositionsFields: INodeProperties[] = [];

export async function getPositionsExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const credentials = await this.getCredentials('polymarketApi');

  const client = new ClobTradingClient({
    host: 'https://clob.polymarket.com',
    apiKey: credentials.apiKey as string,
    apiSecret: credentials.apiSecret as string,
    apiPassphrase: credentials.apiPassphrase as string,
    privateKey: credentials.privateKey as string,
    builderCode: (credentials.builderCode as string) || undefined,
  });

  const positions = await client.getPositions();

  return positions.map((position) => ({ json: { ...position } as IDataObject, pairedItem: i }));
}

import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { ClobTradingClient } from '@polymarket-tools/core';

export const getOpenOrdersFields: INodeProperties[] = [
  {
    displayName: 'Market ID',
    name: 'marketId',
    type: 'string',
    default: '',
    description: 'Filter by market condition ID',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['getOpenOrders'],
      },
    },
  },
];

export async function getOpenOrdersExecute(
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

  const marketId = this.getNodeParameter('marketId', i, '') as string;
  const orders = await client.getOpenOrders(marketId || undefined);

  return orders.map((order) => ({ json: { ...order } as IDataObject, pairedItem: i }));
}

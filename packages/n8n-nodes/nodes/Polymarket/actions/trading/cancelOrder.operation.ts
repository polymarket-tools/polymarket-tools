import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { ClobTradingClient } from '@polymarket-tools/core';

export const cancelOrderFields: INodeProperties[] = [
  {
    displayName: 'Order ID',
    name: 'orderId',
    type: 'string',
    required: true,
    default: '',
    description: 'The ID of the order to cancel',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['cancelOrder'],
      },
    },
  },
];

export async function cancelOrderExecute(
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

  const orderId = this.getNodeParameter('orderId', i) as string;
  await client.cancelOrder(orderId);

  return [{ json: { success: true, orderId } as IDataObject, pairedItem: i }];
}

import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { DataApiClient } from '@polymarket-tools/core';

export const getWalletTradesFields: INodeProperties[] = [
  {
    displayName: 'Wallet Address',
    name: 'walletAddress',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'e.g. 0x1234...abcd',
    description:
      'Get recent trades for a Polymarket wallet. Returns market, side, price, size, timestamp, and transaction hash.',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getWalletTrades'],
      },
    },
  },
  {
    displayName: 'Market',
    name: 'market',
    type: 'string',
    default: '',
    description: 'Optional condition ID to filter trades to a specific market',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getWalletTrades'],
      },
    },
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    typeOptions: {
      minValue: 1,
      maxValue: 500,
    },
    default: 50,
    description: 'Max number of trades to return',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getWalletTrades'],
      },
    },
  },
];

export async function getWalletTradesExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const walletAddress = this.getNodeParameter('walletAddress', i) as string;
  const market = this.getNodeParameter('market', i, '') as string;
  const limit = this.getNodeParameter('limit', i) as number;

  const client = new DataApiClient();
  const trades = await client.getWalletTrades(walletAddress, {
    market: market || undefined,
    limit,
  });

  return trades.map((trade) => ({ json: { ...trade }, pairedItem: i }));
}

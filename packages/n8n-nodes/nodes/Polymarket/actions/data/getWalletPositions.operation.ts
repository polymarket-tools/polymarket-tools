import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { DataApiClient } from '@polymarket-tools/core';

export const getWalletPositionsFields: INodeProperties[] = [
  {
    displayName: 'Wallet Address',
    name: 'walletAddress',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'e.g. 0x1234...abcd',
    description:
      'Get all open positions for a Polymarket wallet. Returns market, outcome, size, average price, current value, and P&L.',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getWalletPositions'],
      },
    },
  },
  {
    displayName: 'Market',
    name: 'market',
    type: 'string',
    default: '',
    description: 'Optional condition ID to filter positions to a specific market',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getWalletPositions'],
      },
    },
  },
];

export async function getWalletPositionsExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const walletAddress = this.getNodeParameter('walletAddress', i) as string;
  const market = this.getNodeParameter('market', i, '') as string;

  const client = new DataApiClient();
  const positions = await client.getWalletPositions(walletAddress, {
    market: market || undefined,
  });

  return positions.map((pos) => ({ json: { ...pos }, pairedItem: i }));
}

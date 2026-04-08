import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { DataApiClient } from '@polymarket-tools/core';

export const getMarketHoldersFields: INodeProperties[] = [
  {
    displayName: 'Condition ID',
    name: 'conditionId',
    type: 'string',
    required: true,
    default: '',
    typeOptions: {
      loadOptionsMethod: 'searchMarkets',
    },
    description:
      'Get top holders of a Polymarket prediction market. Returns wallet addresses, position sizes, and average entry prices.',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getMarketHolders'],
      },
    },
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    typeOptions: {
      minValue: 1,
      maxValue: 100,
    },
    default: 25,
    description: 'Max number of holders to return',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getMarketHolders'],
      },
    },
  },
];

export async function getMarketHoldersExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const conditionId = this.getNodeParameter('conditionId', i) as string;
  const limit = this.getNodeParameter('limit', i) as number;

  const client = new DataApiClient();
  const holders = await client.getMarketHolders(conditionId, { limit });

  return holders.map((holder) => ({ json: { ...holder }, pairedItem: i }));
}

import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { ClobPublicClient } from '@polymarket-tools/core';

export const getPriceHistoryFields: INodeProperties[] = [
  {
    displayName: 'Token ID',
    name: 'tokenId',
    type: 'string',
    required: true,
    default: '',
    description: 'Token ID to get price history for',
    displayOptions: {
      show: {
        resource: ['price'],
        operation: ['getHistory'],
      },
    },
  },
  {
    displayName: 'Interval',
    name: 'interval',
    type: 'options',
    default: '1d',
    description: 'Time interval for price history',
    options: [
      { name: '1 Hour', value: '1h' },
      { name: '6 Hours', value: '6h' },
      { name: '1 Day', value: '1d' },
      { name: '1 Week', value: '1w' },
      { name: '1 Month', value: '1m' },
      { name: 'All Time', value: 'max' },
    ],
    displayOptions: {
      show: {
        resource: ['price'],
        operation: ['getHistory'],
      },
    },
  },
];

export async function getPriceHistoryExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const tokenId = this.getNodeParameter('tokenId', i) as string;
  const interval = this.getNodeParameter('interval', i, '1d') as string;

  const clob = new ClobPublicClient();
  const history = await clob.getPriceHistory(
    tokenId,
    interval as '1h' | '6h' | '1d' | '1w' | '1m' | 'max',
  );

  return history.map((point) => ({
    json: { ...point } as IDataObject,
    pairedItem: i,
  }));
}

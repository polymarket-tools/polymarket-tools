import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { DataApiClient } from '@polymarket-tools/core';

export const getLeaderboardFields: INodeProperties[] = [
  {
    displayName: 'Time Period',
    name: 'timePeriod',
    type: 'options',
    default: '7d',
    description:
      'Get top Polymarket traders ranked by profit. Returns wallet address, username, volume, and P&L.',
    options: [
      { name: '1 Day', value: '1d' },
      { name: '7 Days', value: '7d' },
      { name: '30 Days', value: '30d' },
      { name: 'All Time', value: 'all' },
    ],
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getLeaderboard'],
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
    description: 'Max number of results to return',
    displayOptions: {
      show: {
        resource: ['data'],
        operation: ['getLeaderboard'],
      },
    },
  },
];

export async function getLeaderboardExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const timePeriod = this.getNodeParameter('timePeriod', i) as string;
  const limit = this.getNodeParameter('limit', i) as number;

  const client = new DataApiClient();
  const entries = await client.getLeaderboard({ timePeriod, limit });

  return entries.map((entry) => ({ json: { ...entry }, pairedItem: i }));
}

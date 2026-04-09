import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { GammaClient } from '@polymarket-tools/core';

export const searchMarketFields: INodeProperties[] = [
  {
    displayName: 'Query',
    name: 'query',
    type: 'string',
    default: '',
    placeholder: 'e.g. bitcoin, presidential election, NBA',
    description:
      'Search Polymarket prediction markets by keyword. Returns market question, current prices, volume, and outcome tokens. Use this to find markets about a topic.',
    displayOptions: {
      show: {
        resource: ['market'],
        operation: ['search'],
      },
    },
  },
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    default: {},
    displayOptions: {
      show: {
        resource: ['market'],
        operation: ['search'],
      },
    },
    options: [
      {
        displayName: 'Active Only',
        name: 'active',
        type: 'boolean',
        default: true,
        description: 'Whether to only return active (unresolved) markets',
      },
      {
        displayName: 'Tag',
        name: 'tag',
        type: 'string',
        default: '',
        description: 'Filter markets by tag (e.g. "crypto", "politics")',
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
      },
      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        default: 0,
        description: 'Number of results to skip (for pagination)',
      },
    ],
  },
];

export async function searchMarketExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const query = this.getNodeParameter('query', i) as string;
  const filters = this.getNodeParameter('filters', i, {}) as {
    active?: boolean;
    tag?: string;
    limit?: number;
    offset?: number;
  };

  const gamma = new GammaClient();
  const markets = await gamma.searchMarkets({
    query,
    active: filters.active,
    tag: filters.tag || undefined,
    limit: filters.limit,
    offset: filters.offset,
  });

  return markets.map((market) => ({ json: { ...market }, pairedItem: i }));
}

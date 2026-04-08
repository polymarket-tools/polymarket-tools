import type { INodeProperties } from 'n8n-workflow';
import { searchMarketFields } from './search.operation';
import { getMarketFields } from './get.operation';

export const marketOperations: INodeProperties = {
  displayName: 'Operation',
  name: 'operation',
  type: 'options',
  noDataExpression: true,
  displayOptions: { show: { resource: ['market'] } },
  options: [
    {
      name: 'Search',
      value: 'search',
      action: 'Search markets by keyword',
      description:
        'Search Polymarket prediction markets by keyword. Returns market question, current prices, volume, and outcome tokens.',
    },
    {
      name: 'Get',
      value: 'get',
      action: 'Get a market',
      description:
        'Get details of a specific Polymarket prediction market including outcome prices, volume, and resolution details.',
    },
  ],
  default: 'search',
};

export const marketFields: INodeProperties[] = [...searchMarketFields, ...getMarketFields];
export { searchMarketExecute } from './search.operation';
export { getMarketExecute } from './get.operation';

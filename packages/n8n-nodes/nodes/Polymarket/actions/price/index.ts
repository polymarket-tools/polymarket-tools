import type { INodeProperties } from 'n8n-workflow';
import { getPriceFields } from './get.operation';
import { getPriceHistoryFields } from './getHistory.operation';

export const priceOperations: INodeProperties = {
  displayName: 'Operation',
  name: 'operation',
  type: 'options',
  noDataExpression: true,
  displayOptions: { show: { resource: ['price'] } },
  options: [
    {
      name: 'Get',
      value: 'get',
      action: 'Get price for a token',
      description:
        'Get the current price of a Polymarket outcome token with optional midpoint, spread, and order book.',
    },
    {
      name: 'Get History',
      value: 'getHistory',
      action: 'Get price history for a token',
      description:
        'Get historical price data for a token. Returns timestamped price points for charting and analysis.',
    },
  ],
  default: 'get',
};

export const priceFields: INodeProperties[] = [...getPriceFields, ...getPriceHistoryFields];
export { getPriceExecute } from './get.operation';
export { getPriceHistoryExecute } from './getHistory.operation';

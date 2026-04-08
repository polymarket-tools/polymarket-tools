import type { INodeProperties } from 'n8n-workflow';
import { getPriceFields } from './get.operation';

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
  ],
  default: 'get',
};

export const priceFields: INodeProperties[] = [...getPriceFields];
export { getPriceExecute } from './get.operation';

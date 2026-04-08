import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { ClobPublicClient } from '@polymarket-tools/core';

export const getPriceFields: INodeProperties[] = [
  {
    displayName: 'Token ID',
    name: 'tokenId',
    type: 'string',
    required: true,
    default: '',
    description:
      'Get the current price of a Polymarket outcome token. Returns buy price, and optionally midpoint, bid/ask spread, and full order book depth. Use tokenId from a market\'s outcome tokens.',
    displayOptions: {
      show: {
        resource: ['price'],
        operation: ['get'],
      },
    },
  },
  {
    displayName: 'Include Data',
    name: 'includeData',
    type: 'multiOptions',
    default: ['midpoint'],
    options: [
      {
        name: 'Midpoint',
        value: 'midpoint',
      },
      {
        name: 'Spread (Bid/Ask)',
        value: 'spread',
      },
      {
        name: 'Order Book',
        value: 'orderBook',
      },
    ],
    displayOptions: {
      show: {
        resource: ['price'],
        operation: ['get'],
      },
    },
  },
];

export async function getPriceExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const tokenId = this.getNodeParameter('tokenId', i) as string;
  const includeData = this.getNodeParameter('includeData', i, []) as string[];

  const clob = new ClobPublicClient();
  const price = await clob.getPrice(tokenId);
  const data: IDataObject = { tokenId, price };

  if (includeData.includes('midpoint')) {
    data.midpoint = await clob.getMidpoint(tokenId);
  }
  if (includeData.includes('spread')) {
    const spread = await clob.getSpread(tokenId);
    data.bid = spread.bid;
    data.ask = spread.ask;
    data.spread = spread.spread;
  }
  if (includeData.includes('orderBook')) {
    data.orderBook = await clob.getOrderBook(tokenId);
  }

  return [{ json: data, pairedItem: i }];
}

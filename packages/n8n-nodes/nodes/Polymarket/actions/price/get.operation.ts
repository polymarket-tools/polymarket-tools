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
        name: 'Spread',
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
  const data: IDataObject = { tokenId };

  // Fetch all requested data in parallel
  const promises: Promise<void>[] = [
    clob.getPrice(tokenId).then((p) => { data.price = p; }),
  ];

  if (includeData.includes('midpoint')) {
    promises.push(clob.getMidpoint(tokenId).then((m) => { data.midpoint = m; }));
  }
  if (includeData.includes('spread')) {
    promises.push(clob.getSpread(tokenId).then((s) => {
      data.spread = s;
    }));
  }
  if (includeData.includes('orderBook')) {
    promises.push(clob.getOrderBook(tokenId).then((b) => { data.orderBook = b; }));
  }

  await Promise.all(promises);

  return [{ json: data, pairedItem: i }];
}

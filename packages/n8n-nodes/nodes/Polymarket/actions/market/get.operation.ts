import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { GammaClient } from '@polymarket-tools/core';

export const getMarketFields: INodeProperties[] = [
  {
    displayName: 'Lookup By',
    name: 'lookupBy',
    type: 'options',
    default: 'conditionId',
    description:
      'Get details of a specific Polymarket prediction market. Returns full market info including current outcome prices, volume, liquidity, and resolution details.',
    options: [
      {
        name: 'Condition ID',
        value: 'conditionId',
      },
      {
        name: 'Slug',
        value: 'slug',
      },
    ],
    displayOptions: {
      show: {
        resource: ['market'],
        operation: ['get'],
      },
    },
  },
  {
    displayName: 'Condition ID',
    name: 'conditionId',
    type: 'string',
    required: true,
    default: '',
    typeOptions: {
      loadOptionsMethod: 'searchMarkets',
    },
    description: 'The condition ID of the market to retrieve',
    displayOptions: {
      show: {
        resource: ['market'],
        operation: ['get'],
        lookupBy: ['conditionId'],
      },
    },
  },
  {
    displayName: 'Slug',
    name: 'slug',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'e.g. will-btc-hit-100k',
    description: 'The URL slug of the market to retrieve',
    displayOptions: {
      show: {
        resource: ['market'],
        operation: ['get'],
        lookupBy: ['slug'],
      },
    },
  },
];

export async function getMarketExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const lookupBy = this.getNodeParameter('lookupBy', i) as string;

  const gamma = new GammaClient();
  let market;

  if (lookupBy === 'slug') {
    const slug = this.getNodeParameter('slug', i) as string;
    market = await gamma.getMarketBySlug(slug);
  } else {
    const conditionId = this.getNodeParameter('conditionId', i) as string;
    market = await gamma.getMarket(conditionId);
  }

  return [{ json: { ...market }, pairedItem: i }];
}

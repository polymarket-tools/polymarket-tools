import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { createTradingClient } from '../../utils/createTradingClient';

export const placeOrderFields: INodeProperties[] = [
  {
    displayName: 'Token ID',
    name: 'tokenId',
    type: 'string',
    required: true,
    default: '',
    description:
      'Token ID of the outcome to trade',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['placeOrder'],
      },
    },
  },
  {
    displayName: 'Side',
    name: 'side',
    type: 'options',
    default: 'BUY',
    options: [
      { name: 'Buy', value: 'BUY' },
      { name: 'Sell', value: 'SELL' },
    ],
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['placeOrder'],
      },
    },
  },
  {
    displayName: 'Price',
    name: 'price',
    type: 'number',
    typeOptions: {
      minValue: 0.01,
      maxValue: 0.99,
      numberStepSize: 0.01,
    },
    default: 0.50,
    description: 'Limit price per share (0.01-0.99)',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['placeOrder'],
      },
    },
  },
  {
    displayName: 'Size',
    name: 'size',
    type: 'number',
    typeOptions: {
      minValue: 1,
    },
    default: 10,
    description: 'Number of shares',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['placeOrder'],
      },
    },
  },
  {
    displayName: 'Time In Force',
    name: 'timeInForce',
    type: 'options',
    default: 'GTC',
    options: [
      { name: 'GTC (Good Til Cancelled)', value: 'GTC' },
      { name: 'GTD (Good Til Date)', value: 'GTD' },
      { name: 'FOK (Fill or Kill)', value: 'FOK' },
      { name: 'FAK (Fill and Kill)', value: 'FAK' },
    ],
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['placeOrder'],
      },
    },
  },
  {
    displayName: 'Validate Only',
    name: 'validateOnly',
    type: 'boolean',
    default: false,
    description: 'Whether to validate the order without placing it. Use for dry runs.',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['placeOrder'],
      },
    },
  },
];

export async function placeOrderExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const client = await createTradingClient(this);

  const order = await client.placeOrder({
    tokenId: this.getNodeParameter('tokenId', i) as string,
    side: this.getNodeParameter('side', i) as 'BUY' | 'SELL',
    orderType: 'LIMIT',
    price: this.getNodeParameter('price', i) as number,
    size: this.getNodeParameter('size', i) as number,
    timeInForce: this.getNodeParameter('timeInForce', i, 'GTC') as 'GTC' | 'GTD' | 'FOK' | 'FAK',
    validateOnly: this.getNodeParameter('validateOnly', i, false) as boolean,
  });

  return [{ json: { ...order } as IDataObject, pairedItem: i }];
}

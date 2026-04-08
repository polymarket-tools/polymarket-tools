import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { createTradingClient } from '../../utils/createTradingClient';

export const getOpenOrdersFields: INodeProperties[] = [
  {
    displayName: 'Market ID',
    name: 'marketId',
    type: 'string',
    default: '',
    description: 'Filter by market condition ID',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['getOpenOrders'],
      },
    },
  },
];

export async function getOpenOrdersExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const client = await createTradingClient(this);

  const marketId = this.getNodeParameter('marketId', i, '') as string;
  const orders = await client.getOpenOrders(marketId || undefined);

  return orders.map((order) => ({ json: { ...order } as IDataObject, pairedItem: i }));
}

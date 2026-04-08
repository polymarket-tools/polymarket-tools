import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { createTradingClient } from '../../utils/createTradingClient';

export const cancelOrderFields: INodeProperties[] = [
  {
    displayName: 'Order ID',
    name: 'orderId',
    type: 'string',
    required: true,
    default: '',
    description: 'The ID of the order to cancel',
    displayOptions: {
      show: {
        resource: ['trading'],
        operation: ['cancelOrder'],
      },
    },
  },
];

export async function cancelOrderExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const client = await createTradingClient(this);

  const orderId = this.getNodeParameter('orderId', i) as string;
  await client.cancelOrder(orderId);

  return [{ json: { success: true, orderId } as IDataObject, pairedItem: i }];
}

import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { createTradingClient } from '../../utils/createTradingClient';

export const getPositionsFields: INodeProperties[] = [];

export async function getPositionsExecute(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const client = await createTradingClient(this);

  const positions = await client.getPositions();

  return positions.map((position) => ({ json: { ...position } as IDataObject, pairedItem: i }));
}

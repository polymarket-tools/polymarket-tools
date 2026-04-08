import type { INodeProperties } from 'n8n-workflow';
import { placeOrderFields } from './placeOrder.operation';
import { cancelOrderFields } from './cancelOrder.operation';
import { getOpenOrdersFields } from './getOpenOrders.operation';
import { getPositionsFields } from './getPositions.operation';

export const tradingOperations: INodeProperties = {
  displayName: 'Operation',
  name: 'operation',
  type: 'options',
  noDataExpression: true,
  displayOptions: { show: { resource: ['trading'] } },
  options: [
    {
      name: 'Place Order',
      value: 'placeOrder',
      action: 'Place a limit order',
      description:
        'Place a limit order on Polymarket. Signs the order with EIP-712 and submits to the CLOB. Requires API credentials. Returns order ID and status.',
    },
    {
      name: 'Cancel Order',
      value: 'cancelOrder',
      action: 'Cancel an order',
      description:
        'Cancel an open order on Polymarket by order ID. Requires API credentials.',
    },
    {
      name: 'Get Open Orders',
      value: 'getOpenOrders',
      action: 'Get open orders',
      description:
        'List all open orders on Polymarket, optionally filtered by market. Requires API credentials.',
    },
    {
      name: 'Get Positions',
      value: 'getPositions',
      action: 'Get positions',
      description:
        'List current positions on Polymarket. Shows market, outcome, size, and entry price. Requires API credentials.',
    },
  ],
  default: 'placeOrder',
};

export const tradingFields: INodeProperties[] = [
  ...placeOrderFields,
  ...cancelOrderFields,
  ...getOpenOrdersFields,
  ...getPositionsFields,
];

export { placeOrderExecute } from './placeOrder.operation';
export { cancelOrderExecute } from './cancelOrder.operation';
export { getOpenOrdersExecute } from './getOpenOrders.operation';
export { getPositionsExecute } from './getPositions.operation';

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// Market operations
import {
  marketOperations,
  marketFields,
  searchMarketExecute,
  getMarketExecute,
} from './actions/market';
// Price operations
import { priceOperations, priceFields, getPriceExecute } from './actions/price';
// Trading operations
import {
  tradingOperations,
  tradingFields,
  placeOrderExecute,
  cancelOrderExecute,
  getOpenOrdersExecute,
} from './actions/trading';
// Data operations
import {
  dataOperations,
  dataFields,
  getLeaderboardExecute,
  getWalletPositionsExecute,
  getWalletTradesExecute,
  getMarketHoldersExecute,
} from './actions/data';
// Dynamic loading
import { searchMarkets, getMarketTokens } from './methods/loadOptions';

export class Polymarket implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Polymarket',
    name: 'polymarket',
    icon: 'file:polymarket.svg',
    group: ['input'],
    version: 1,
    subtitle: '={{$parameter["operation"] + " " + $parameter["resource"]}}',
    description:
      'Search markets, get prices, and trade on Polymarket prediction markets',
    defaults: { name: 'Polymarket' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'polymarketApi',
        required: false, // Only required for trading operations
      },
    ],
    properties: [
      // Resource selector
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Data', value: 'data' },
          { name: 'Market', value: 'market' },
          { name: 'Price', value: 'price' },
          { name: 'Trading', value: 'trading' },
        ],
        default: 'market',
      },
      // Operation selectors (one per resource, shown conditionally)
      dataOperations,
      marketOperations,
      priceOperations,
      tradingOperations,
      // All field definitions
      ...dataFields,
      ...marketFields,
      ...priceFields,
      ...tradingFields,
    ],
  };

  methods = {
    loadOptions: {
      searchMarkets,
      getMarketTokens,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let results: INodeExecutionData[];

        if (resource === 'data' && operation === 'getLeaderboard') {
          results = await getLeaderboardExecute.call(this, i);
        } else if (resource === 'data' && operation === 'getWalletPositions') {
          results = await getWalletPositionsExecute.call(this, i);
        } else if (resource === 'data' && operation === 'getWalletTrades') {
          results = await getWalletTradesExecute.call(this, i);
        } else if (resource === 'data' && operation === 'getMarketHolders') {
          results = await getMarketHoldersExecute.call(this, i);
        } else if (resource === 'market' && operation === 'search') {
          results = await searchMarketExecute.call(this, i);
        } else if (resource === 'market' && operation === 'get') {
          results = await getMarketExecute.call(this, i);
        } else if (resource === 'price' && operation === 'get') {
          results = await getPriceExecute.call(this, i);
        } else if (resource === 'trading' && operation === 'placeOrder') {
          results = await placeOrderExecute.call(this, i);
        } else if (resource === 'trading' && operation === 'cancelOrder') {
          results = await cancelOrderExecute.call(this, i);
        } else if (resource === 'trading' && operation === 'getOpenOrders') {
          results = await getOpenOrdersExecute.call(this, i);
        } else {
          throw new NodeOperationError(
            this.getNode(),
            `Unknown resource/operation: ${resource}/${operation}`,
            { itemIndex: i },
          );
        }

        returnData.push(...results);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: i,
          });
        } else {
          if (error instanceof NodeOperationError) throw error;
          throw new NodeOperationError(this.getNode(), error as Error, {
            itemIndex: i,
          });
        }
      }
    }

    return [returnData];
  }
}

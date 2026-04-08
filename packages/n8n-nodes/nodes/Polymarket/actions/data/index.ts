import type { INodeProperties } from 'n8n-workflow';
import { getLeaderboardFields } from './getLeaderboard.operation';
import { getWalletPositionsFields } from './getWalletPositions.operation';
import { getWalletTradesFields } from './getWalletTrades.operation';
import { getMarketHoldersFields } from './getMarketHolders.operation';

export const dataOperations: INodeProperties = {
  displayName: 'Operation',
  name: 'operation',
  type: 'options',
  noDataExpression: true,
  displayOptions: { show: { resource: ['data'] } },
  options: [
    {
      name: 'Get Leaderboard',
      value: 'getLeaderboard',
      action: 'Get top traders',
      description:
        'Get top Polymarket traders ranked by profit. Returns wallet address, username, volume, and P&L.',
    },
    {
      name: 'Get Wallet Positions',
      value: 'getWalletPositions',
      action: 'Get wallet positions',
      description:
        'Get all open positions for a Polymarket wallet. Returns market, outcome, size, average price, current value, and P&L.',
    },
    {
      name: 'Get Wallet Trades',
      value: 'getWalletTrades',
      action: 'Get wallet trades',
      description:
        'Get recent trades for a Polymarket wallet. Returns market, side, price, size, timestamp, and transaction hash.',
    },
    {
      name: 'Get Market Holders',
      value: 'getMarketHolders',
      action: 'Get market holders',
      description:
        'Get top holders of a Polymarket prediction market. Returns wallet addresses, position sizes, and average entry prices.',
    },
  ],
  default: 'getLeaderboard',
};

export const dataFields: INodeProperties[] = [
  ...getLeaderboardFields,
  ...getWalletPositionsFields,
  ...getWalletTradesFields,
  ...getMarketHoldersFields,
];

export { getLeaderboardExecute } from './getLeaderboard.operation';
export { getWalletPositionsExecute } from './getWalletPositions.operation';
export { getWalletTradesExecute } from './getWalletTrades.operation';
export { getMarketHoldersExecute } from './getMarketHolders.operation';

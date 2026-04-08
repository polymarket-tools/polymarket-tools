import type {
  IPollFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { ClobPublicClient, GammaClient } from '@polymarket-tools/core';

export class PolymarketTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Polymarket Trigger',
    name: 'polymarketTrigger',
    icon: 'file:../Polymarket/polymarket.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["triggerWhen"]}}',
    description:
      'Triggers when Polymarket conditions change - price movements, threshold crossings, or new markets',
    defaults: { name: 'Polymarket Trigger' },
    polling: true,
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'polymarketApi', required: false }],
    properties: [
      {
        displayName: 'Trigger When',
        name: 'triggerWhen',
        type: 'options',
        default: 'priceChange',
        options: [
          {
            name: 'Price Changes by Amount',
            value: 'priceChange',
            description: 'Trigger when price moves by at least X',
          },
          {
            name: 'Price Crosses Threshold',
            value: 'crossesThreshold',
            description: 'Trigger when price crosses above or below a value',
          },
          {
            name: 'New Market',
            value: 'newMarket',
            description: 'Trigger when a new market appears matching filters',
          },
        ],
      },
      {
        displayName: 'Token ID',
        name: 'tokenId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            triggerWhen: ['priceChange', 'crossesThreshold'],
          },
        },
      },
      {
        displayName: 'Change Amount',
        name: 'changeAmount',
        type: 'number',
        typeOptions: { minValue: 0.01, maxValue: 1, numberPrecision: 2 },
        default: 0.05,
        displayOptions: {
          show: {
            triggerWhen: ['priceChange'],
          },
        },
        description: 'Minimum price change to trigger (e.g. 0.05 = 5 cents)',
      },
      {
        displayName: 'Threshold Price',
        name: 'thresholdPrice',
        type: 'number',
        typeOptions: { minValue: 0.01, maxValue: 0.99, numberPrecision: 2 },
        default: 0.5,
        displayOptions: {
          show: {
            triggerWhen: ['crossesThreshold'],
          },
        },
      },
      {
        displayName: 'Tag',
        name: 'tag',
        type: 'string',
        default: '',
        placeholder: 'e.g. Politics, Sports, Crypto',
        displayOptions: {
          show: {
            triggerWhen: ['newMarket'],
          },
        },
        description: 'Filter new markets by category tag',
      },
    ],
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const staticData = this.getWorkflowStaticData('node');
    const triggerWhen = this.getNodeParameter('triggerWhen') as string;

    // ── Manual mode: return sample data for testing ────────────────
    if (this.getMode() === 'manual') {
      const now = new Date().toISOString();

      if (triggerWhen === 'newMarket') {
        return [
          [
            {
              json: {
                conditionId:
                  '0x0000000000000000000000000000000000000000000000000000000000000000',
                question: 'Will BTC exceed $100k by end of 2026?',
                slug: 'will-btc-exceed-100k-by-end-of-2026',
                volume: 50000,
                tokens: [
                  { tokenId: 'sample-yes-token', outcome: 'Yes', price: 0.65 },
                  { tokenId: 'sample-no-token', outcome: 'No', price: 0.35 },
                ],
                timestamp: now,
              },
            },
          ],
        ];
      }

      // Price-related triggers share the same sample shape
      const tokenId = this.getNodeParameter('tokenId') as string;
      return [
        [
          {
            json: {
              tokenId,
              price: 0.65,
              previousPrice: 0.6,
              change: 0.05,
              absChange: 0.05,
              direction: 'up',
              percentChange: '8.33',
              timestamp: now,
            },
          },
        ],
      ];
    }

    // ── Price Change Amount ────────────────────────────────────────
    if (triggerWhen === 'priceChange') {
      const tokenId = this.getNodeParameter('tokenId') as string;
      const changeAmount = this.getNodeParameter('changeAmount') as number;

      const clob = new ClobPublicClient();
      const currentPrice = await clob.getMidpoint(tokenId);

      const lastPrice = staticData.lastPrice as number | undefined;

      // First poll: store baseline, don't trigger
      if (lastPrice === undefined) {
        staticData.lastPrice = currentPrice;
        return null;
      }

      const change = currentPrice - lastPrice;
      const absChange = Math.abs(change);

      // Always update stored price
      staticData.lastPrice = currentPrice;

      if (absChange >= changeAmount) {
        const direction = change > 0 ? 'up' : 'down';
        const percentChange =
          lastPrice !== 0 ? ((absChange / lastPrice) * 100).toFixed(2) : '0.00';

        return [
          [
            {
              json: {
                tokenId,
                price: currentPrice,
                previousPrice: lastPrice,
                change: parseFloat(change.toFixed(4)),
                absChange: parseFloat(absChange.toFixed(4)),
                direction,
                percentChange,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        ];
      }

      return null;
    }

    // ── Price Crosses Threshold ────────────────────────────────────
    if (triggerWhen === 'crossesThreshold') {
      const tokenId = this.getNodeParameter('tokenId') as string;
      const thresholdPrice = this.getNodeParameter('thresholdPrice') as number;

      const clob = new ClobPublicClient();
      const currentPrice = await clob.getMidpoint(tokenId);

      const lastPrice = staticData.lastPrice as number | undefined;

      // First poll: store baseline, don't trigger
      if (lastPrice === undefined) {
        staticData.lastPrice = currentPrice;
        return null;
      }

      const crossedUp = lastPrice < thresholdPrice && currentPrice >= thresholdPrice;
      const crossedDown = lastPrice > thresholdPrice && currentPrice <= thresholdPrice;

      // Always update stored price
      staticData.lastPrice = currentPrice;

      if (crossedUp || crossedDown) {
        const direction = crossedUp ? 'up' : 'down';
        const change = currentPrice - lastPrice;
        const absChange = Math.abs(change);
        const percentChange =
          lastPrice !== 0 ? ((absChange / lastPrice) * 100).toFixed(2) : '0.00';

        return [
          [
            {
              json: {
                tokenId,
                price: currentPrice,
                previousPrice: lastPrice,
                change: parseFloat(change.toFixed(4)),
                absChange: parseFloat(absChange.toFixed(4)),
                direction,
                thresholdPrice,
                percentChange,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        ];
      }

      return null;
    }

    // ── New Market ────────────────────────────────────────────────
    if (triggerWhen === 'newMarket') {
      const tag = this.getNodeParameter('tag') as string;

      const gamma = new GammaClient();
      const params: { active: boolean; tag?: string; limit: number } = {
        active: true,
        limit: 50,
      };
      if (tag) {
        params.tag = tag;
      }

      const markets = await gamma.getMarkets(params);
      const currentIds = new Set(markets.map((m) => m.conditionId));

      const knownIds = staticData.knownMarketIds as string[] | undefined;

      // First poll: store all current IDs, don't trigger
      if (knownIds === undefined) {
        staticData.knownMarketIds = Array.from(currentIds);
        return null;
      }

      const knownSet = new Set(knownIds);
      const newMarkets = markets.filter((m) => !knownSet.has(m.conditionId));

      // Update stored IDs to include all current markets
      staticData.knownMarketIds = Array.from(currentIds);

      if (newMarkets.length === 0) {
        return null;
      }

      const now = new Date().toISOString();
      const items: INodeExecutionData[] = newMarkets.map((market) => ({
        json: {
          conditionId: market.conditionId,
          question: market.question,
          slug: market.slug,
          volume: market.volume,
          tokens: market.tokens,
          timestamp: now,
        },
      }));

      return [items];
    }

    return null;
  }
}

import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { GammaClient } from '@polymarket-tools/core';

export async function searchMarkets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const gamma = new GammaClient();
    const markets = await gamma.searchMarkets({ query: '', active: true, limit: 50 });
    return markets.map((m) => ({
      name: `${m.question}${m.tokens.length ? ` (${m.tokens.map(t => `${t.outcome}: $${t.price.toFixed(2)}`).join(', ')})` : ''}`,
      value: m.conditionId,
    }));
  } catch {
    return [{ name: 'Error loading markets — check your network connection', value: '' }];
  }
}

export async function getMarketTokens(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const conditionId = this.getNodeParameter('conditionId', '') as string;
  if (!conditionId) return [];

  try {
    const gamma = new GammaClient();
    const market = await gamma.getMarket(conditionId);
    return market.tokens.map((t) => ({
      name: `${t.outcome} ($${t.price.toFixed(2)})`,
      value: t.tokenId,
    }));
  } catch {
    return [{ name: 'Error loading tokens — check the market ID', value: '' }];
  }
}

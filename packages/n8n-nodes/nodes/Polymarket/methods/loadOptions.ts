import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { GammaClient } from '@polymarket-tools/core';

export async function searchMarkets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const gamma = new GammaClient();
  const markets = await gamma.searchMarkets({ query: '', active: true, limit: 50 });
  return markets.map((m) => ({
    name: `${m.question} (${m.tokens.map(t => `${t.outcome}: $${t.price.toFixed(2)}`).join(', ')})`,
    value: m.conditionId,
  }));
}

export async function getMarketTokens(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const conditionId = this.getNodeParameter('conditionId', '') as string;
  if (!conditionId) return [];

  const gamma = new GammaClient();
  const market = await gamma.getMarket(conditionId);
  return market.tokens.map((t) => ({
    name: `${t.outcome} ($${t.price.toFixed(2)})`,
    value: t.tokenId,
  }));
}

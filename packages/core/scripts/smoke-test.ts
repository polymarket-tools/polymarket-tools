import { GammaClient, ClobPublicClient } from '../src/index';

async function main() {
  const gamma = new GammaClient();
  const clob = new ClobPublicClient();

  console.log('--- Searching markets for "bitcoin" ---');
  const markets = await gamma.searchMarkets({ query: 'bitcoin', limit: 3, active: true });
  for (const m of markets) {
    console.log(`  ${m.question} [${m.conditionId}]`);
    for (const t of m.tokens) {
      console.log(`    ${t.outcome}: $${t.price} (token: ${t.tokenId})`);
    }
  }

  if (markets.length > 0 && markets[0].tokens.length > 0) {
    const tokenId = markets[0].tokens[0].tokenId;
    console.log(`\n--- Getting price for token ${tokenId} ---`);
    const price = await clob.getPrice(tokenId);
    console.log(`  Price: $${price}`);
    const mid = await clob.getMidpoint(tokenId);
    console.log(`  Midpoint: $${mid}`);
    const spread = await clob.getSpread(tokenId);
    console.log(`  Bid: $${spread.bid}, Ask: $${spread.ask}, Spread: $${spread.spread}`);
  }

  console.log('\n--- Getting tags ---');
  const tags = await gamma.getTags();
  console.log(`  ${tags.length} tags: ${tags.slice(0, 10).join(', ')}...`);

  console.log('\nSmoke test passed!');
}

main().catch((err) => {
  console.error('Smoke test FAILED:', err);
  process.exit(1);
});

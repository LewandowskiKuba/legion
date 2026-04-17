export { fetchRelevantMarkets, getCachedMarkets, getCacheAge } from "./client.js";
export { buildPolymarketBlock } from "./formatter.js";
export type { RelevantMarket, PolymarketMarket } from "./types.js";

import { fetchRelevantMarkets } from "./client.js";
import { buildPolymarketBlock } from "./formatter.js";

export async function getPolymarketContext(): Promise<string> {
  const markets = await fetchRelevantMarkets();
  return buildPolymarketBlock(markets);
}

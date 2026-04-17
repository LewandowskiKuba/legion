import type { RelevantMarket } from "./types.js";

export function formatMarketLine(m: RelevantMarket): string {
  return `- ${m.question}: ${m.leadingOutcome} (${m.probability}%)`;
}

export function buildPolymarketBlock(markets: RelevantMarket[]): string {
  if (markets.length === 0) return "";
  return (
    `\nPROGNOZY RYNKOWE (dane z rynku predykcyjnego Polymarket — zbiorowe przekonania rynku):\n` +
    markets.map(formatMarketLine).join("\n") +
    `\nTraktuj te prognozy jako fakty o zbiorowych oczekiwaniach — nie musisz się z nimi zgadzać, ale znasz te informacje jako część swojej bańki informacyjnej.`
  );
}

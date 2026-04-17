export interface PolymarketMarket {
  id: string;
  question: string;
  outcomes: string[] | string;
  outcomePrices: string[] | string;
  volume: number | string;
  active: boolean;
  closed: boolean;
  endDate?: string;
}

export interface RelevantMarket {
  question: string;
  leadingOutcome: string;
  probability: number;
}

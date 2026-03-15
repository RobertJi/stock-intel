export type Stock = {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changeAmt: number;
};

export enum StockEventType {
  INSIDER_BUY = "INSIDER_BUY",
  BUYBACK = "BUYBACK",
  EARNINGS_BEAT = "EARNINGS_BEAT",
  CEO_CHANGE = "CEO_CHANGE",
  ANALYST_UPGRADE = "ANALYST_UPGRADE",
  ANALYST_DOWNGRADE = "ANALYST_DOWNGRADE",
}

export type EventImpact = "BULLISH" | "BEARISH" | "NEUTRAL";

export type StockEvent = {
  id: string;
  ticker: string;
  type: StockEventType;
  date: string;
  title: string;
  description: string;
  impact: EventImpact;
  historicalWinRate: number;
  avgReturn: number;
  aiInsight: string;
};

export const watchlist: Stock[] = [
  { ticker: "META", name: "Meta Platforms", price: 512.84, change: 1.46, changeAmt: 7.39 },
  { ticker: "NFLX", name: "Netflix", price: 628.17, change: -0.82, changeAmt: -5.18 },
  { ticker: "NVDA", name: "NVIDIA", price: 911.42, change: 2.94, changeAmt: 26.07 },
  { ticker: "OXY", name: "Occidental Petroleum", price: 61.28, change: 0.57, changeAmt: 0.35 },
];

export const stockEvents: StockEvent[] = [
  {
    id: "meta-1",
    ticker: "META",
    type: StockEventType.BUYBACK,
    date: "2026-03-14",
    title: "Board expands repurchase authorization",
    description: "Meta added to its repurchase program after strong ad cash flow and continued margin expansion.",
    impact: "BULLISH",
    historicalWinRate: 68,
    avgReturn: 5.4,
    aiInsight: "Buyback expansions tend to reinforce support after high-margin quarters.",
  },
  {
    id: "meta-2",
    ticker: "META",
    type: StockEventType.ANALYST_UPGRADE,
    date: "2026-03-10",
    title: "Broker upgrade cites monetization upside",
    description: "An analyst upgrade pointed to stronger short-form video monetization and AI tooling leverage.",
    impact: "BULLISH",
    historicalWinRate: 64,
    avgReturn: 4.1,
    aiInsight: "Upgrades tied to estimate revisions generally have better follow-through than target-only changes.",
  },
  {
    id: "nflx-1",
    ticker: "NFLX",
    type: StockEventType.EARNINGS_BEAT,
    date: "2026-03-13",
    title: "Subscriber growth beats consensus",
    description: "Netflix posted better-than-expected net adds with improving ad-tier engagement in North America.",
    impact: "BULLISH",
    historicalWinRate: 71,
    avgReturn: 6.2,
    aiInsight: "Beats tied to both subscribers and margin usually lead to the strongest multi-week drift.",
  },
  {
    id: "nflx-2",
    ticker: "NFLX",
    type: StockEventType.ANALYST_DOWNGRADE,
    date: "2026-03-08",
    title: "Valuation downgrade after rerating",
    description: "One sell-side desk downgraded shares on valuation after a strong multi-month run.",
    impact: "BEARISH",
    historicalWinRate: 43,
    avgReturn: -2.8,
    aiInsight: "Pure valuation downgrades often fade unless accompanied by estimate cuts.",
  },
  {
    id: "nvda-1",
    ticker: "NVDA",
    type: StockEventType.INSIDER_BUY,
    date: "2026-03-12",
    title: "Director purchase draws attention",
    description: "A board member disclosed an open-market purchase after recent volatility around AI infrastructure names.",
    impact: "BULLISH",
    historicalWinRate: 62,
    avgReturn: 3.7,
    aiInsight: "Clustered insider buying tends to matter more than isolated transactions.",
  },
  {
    id: "nvda-2",
    ticker: "NVDA",
    type: StockEventType.CEO_CHANGE,
    date: "2026-03-05",
    title: "Data center unit gets new leadership",
    description: "NVIDIA announced an executive change inside its data center leadership stack with no full-company CEO transition.",
    impact: "NEUTRAL",
    historicalWinRate: 50,
    avgReturn: 0.9,
    aiInsight: "Segment leadership changes are usually neutral unless they coincide with guidance revisions.",
  },
  {
    id: "oxy-1",
    ticker: "OXY",
    type: StockEventType.BUYBACK,
    date: "2026-03-11",
    title: "Occidental accelerates capital return",
    description: "Management increased the buyback pace after commodity strength supported free cash flow.",
    impact: "BULLISH",
    historicalWinRate: 66,
    avgReturn: 4.6,
    aiInsight: "Energy buybacks tend to outperform when balance sheet leverage is already improving.",
  },
  {
    id: "oxy-2",
    ticker: "OXY",
    type: StockEventType.ANALYST_DOWNGRADE,
    date: "2026-03-07",
    title: "Analyst cuts rating on oil sensitivity",
    description: "A downgrade highlighted downside if crude prices soften into the next quarter.",
    impact: "BEARISH",
    historicalWinRate: 46,
    avgReturn: -3.1,
    aiInsight: "Commodity-linked downgrades are stickier when macro positioning is already crowded.",
  },
  {
    id: "nvda-3",
    ticker: "NVDA",
    type: StockEventType.EARNINGS_BEAT,
    date: "2026-03-02",
    title: "AI accelerator demand drives beat",
    description: "Revenue and guidance topped expectations as hyperscaler demand remained elevated.",
    impact: "BULLISH",
    historicalWinRate: 74,
    avgReturn: 7.3,
    aiInsight: "Guidance-backed beats have historically produced stronger continuation than one-off margin surprises.",
  },
];

export const eventsFeed = [...stockEvents].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
);

export function getStockByTicker(ticker: string) {
  return watchlist.find((stock) => stock.ticker === ticker.toUpperCase());
}

export function getEventsByTicker(ticker: string) {
  return eventsFeed.filter((event) => event.ticker === ticker.toUpperCase());
}

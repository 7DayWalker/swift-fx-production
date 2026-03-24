// Categorized trading pairs with priority ordering
export interface TradingPair {
  symbol: string;
  label?: string;
  priority?: boolean;
}

export interface PairCategory {
  name: string;
  icon: string;
  pairs: TradingPair[];
}

export const PAIR_CATEGORIES: PairCategory[] = [
  {
    name: 'Metals',
    icon: 'ellipse',
    pairs: [
      { symbol: 'XAU/USD', label: 'Gold', priority: true },
      { symbol: 'XAG/USD', label: 'Silver', priority: true },
      { symbol: 'XPT/USD', label: 'Platinum' },
      { symbol: 'XPD/USD', label: 'Palladium' },
    ],
  },
  {
    name: 'Forex',
    icon: 'swap-horizontal',
    pairs: [
      { symbol: 'EUR/USD', priority: true },
      { symbol: 'GBP/USD', priority: true },
      { symbol: 'GBP/JPY', priority: true },
      { symbol: 'USD/JPY' },
      { symbol: 'USD/CHF' },
      { symbol: 'AUD/USD' },
      { symbol: 'USD/CAD' },
      { symbol: 'NZD/USD' },
    ],
  },
  {
    name: 'Indices',
    icon: 'bar-chart',
    pairs: [
      { symbol: 'US30', label: 'Dow Jones', priority: true },
      { symbol: 'US100', label: 'NASDAQ', priority: true },
      { symbol: 'SPX500', label: 'S&P 500' },
      { symbol: 'GER40', label: 'DAX' },
      { symbol: 'UK100', label: 'FTSE 100' },
      { symbol: 'JP225', label: 'Nikkei' },
      { symbol: 'HK50', label: 'Hang Seng' },
    ],
  },
  {
    name: 'Crypto',
    icon: 'logo-bitcoin',
    pairs: [
      { symbol: 'BTC/USD', label: 'Bitcoin', priority: true },
      { symbol: 'ETH/USD', label: 'Ethereum', priority: true },
      { symbol: 'SOL/USD', label: 'Solana' },
      { symbol: 'BNB/USD', label: 'Binance' },
      { symbol: 'XRP/USD', label: 'Ripple' },
      { symbol: 'ADA/USD', label: 'Cardano' },
      { symbol: 'DOGE/USD', label: 'Doge' },
    ],
  },
];

// Flat list of all pair symbols
export const ALL_PAIRS = PAIR_CATEGORIES.flatMap(c => c.pairs.map(p => p.symbol));

// Priority pairs for quick access
export const PRIORITY_PAIRS = PAIR_CATEGORIES.flatMap(c => c.pairs.filter(p => p.priority).map(p => p.symbol));

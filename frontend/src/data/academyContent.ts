// ==============================================================================
// SWIFT FX ACADEMY - COMPLETE LESSON CONTENT DATA v3.0
// ==============================================================================
// 
// STRUCTURE:
// - BEGINNER courses: FREE access (full content)
// - INTERMEDIATE courses: PREMIUM access (full content, locked for free users)
// - ADVANCED courses: VIP access (full content, locked for free/premium users)
// 
// VIDEO RULES:
// - All videos are SHORT (5-8 minutes) and topic-relevant
// - youtubeId is the video ID for embedding (not full URL)
// ==============================================================================

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonContent {
  id: number;
  title: string;
  duration: string;
  type: 'video' | 'text' | 'quiz';
  overview: string;
  keyTakeaways: string[];
  youtubeId?: string;
  youtubeTitle?: string;
  quizQuestions?: QuizQuestion[];
}

export interface CourseContent {
  id: string;
  title: string;
  description: string;
  lessons: LessonContent[];
  category: 'beginner' | 'intermediate' | 'advanced';
}

// ==============================================================================
// BEGINNER COURSES - FREE ACCESS (FULL CONTENT)
// ==============================================================================

export const BEGINNER_COURSES: CourseContent[] = [
  {
    id: 'intro-trading',
    title: 'Introduction to Trading',
    description: 'Learn the basics of financial markets',
    category: 'beginner',
    lessons: [
      {
        id: 1,
        title: 'What is Trading?',
        duration: '5 min',
        type: 'video',
        overview: `Trading is the act of buying and selling financial assets with the goal of making a profit. When you trade, you're essentially trying to predict whether the price of an asset will go up or down.

Think of it like buying and selling items at a market. If you buy something at a low price and sell it at a higher price, you make a profit. The same principle applies to financial trading.

The beauty of modern trading is that anyone with an internet connection can participate in global markets. You don't need to be a Wall Street professional to start learning.`,
        keyTakeaways: [
          'Trading involves buying assets at one price and selling at another',
          'The goal is to profit from price movements in financial markets',
          'Modern technology allows anyone to access global markets',
          'Success requires education, practice, and proper risk management'
        ],
        youtubeId: 'Xn7KWR9EOGQ',
        youtubeTitle: 'What is Trading? Beginner Introduction'
      },
      {
        id: 2,
        title: 'Types of Financial Markets',
        duration: '6 min',
        type: 'video',
        overview: `There are several major financial markets where trading takes place, each with unique characteristics.

The Forex market is the largest and most liquid, trading currencies 24 hours a day. The Stock Market lets you buy shares of companies. Commodities markets trade physical goods like gold and oil. Cryptocurrency markets offer 24/7 trading of digital assets.

For beginners, understanding these markets helps you choose where to focus your learning and trading efforts.`,
        keyTakeaways: [
          'Forex is the largest market with $6+ trillion daily volume',
          'Stock markets let you own pieces of companies',
          'Commodities include gold, oil, and agricultural products',
          'Crypto markets operate 24/7 unlike traditional markets'
        ],
        youtubeId: 'PHe0bXAIuk0',
        youtubeTitle: 'Financial Markets Explained'
      },
      {
        id: 3,
        title: 'Understanding Market Participants',
        duration: '7 min',
        type: 'text',
        overview: `Financial markets are made up of various participants, each playing a different role.

Retail Traders are individuals like you trading with their own money. While retail traders make up a small percentage of total volume, there are millions worldwide.

Institutional Traders include banks, hedge funds, and investment firms. They move large amounts of money and can influence market direction.

Market Makers provide liquidity by always being ready to buy or sell. Central Banks control monetary policy and can dramatically impact currency values.

Understanding who else is in the market helps you make better trading decisions.`,
        keyTakeaways: [
          'Retail traders are individuals trading their own money',
          'Institutional traders move large volumes and can impact prices',
          'Market makers provide liquidity and profit from spreads',
          'Central banks influence markets through monetary policy'
        ]
      },
      {
        id: 4,
        title: 'How Prices Move',
        duration: '5 min',
        type: 'video',
        overview: `Price movement in financial markets is driven by supply and demand.

When more people want to buy than sell (high demand), prices go up. When more people want to sell than buy (high supply), prices go down.

What drives supply and demand is more complex: economic data, news events, and market sentiment all play a role. As a trader, your job is to analyze these factors and predict price direction.`,
        keyTakeaways: [
          'Prices move based on supply and demand',
          'More buyers than sellers = price goes up',
          'More sellers than buyers = price goes down',
          'News and economic data drive supply/demand changes'
        ],
        youtubeId: 'p7HKvqRI_Bo',
        youtubeTitle: 'Supply and Demand Basics'
      },
      {
        id: 5,
        title: 'Course Quiz: Trading Basics',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your understanding of trading fundamentals.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What is the primary goal of trading?', options: ['To hold assets forever', 'To profit from price movements', 'To collect dividends only', 'To avoid all risk'], correctIndex: 1, explanation: 'Trading aims to profit by buying assets at one price and selling at another.' },
          { question: 'Which is the largest financial market in the world?', options: ['Stock Market', 'Forex Market', 'Cryptocurrency Market', 'Commodities Market'], correctIndex: 1, explanation: 'The Forex market trades over $6 trillion daily.' },
          { question: 'What happens to price when there are more buyers than sellers?', options: ['Price goes down', 'Price stays the same', 'Price goes up', 'Market closes'], correctIndex: 2, explanation: 'When demand exceeds supply, prices rise.' },
          { question: 'Who are retail traders?', options: ['Banks and hedge funds', 'Individual traders using their own money', 'Central banks', 'Market makers only'], correctIndex: 1, explanation: 'Retail traders are individuals who trade with their own personal capital.' },
          { question: 'What role do market makers play?', options: ['They set interest rates', 'They provide liquidity by always being ready to buy/sell', 'They only trade stocks', 'They control currency values'], correctIndex: 1, explanation: 'Market makers ensure there\'s always someone to trade with.' }
        ]
      }
    ]
  },
  {
    id: 'chart-basics',
    title: 'Chart Reading Basics',
    description: 'Understanding candlesticks and patterns',
    category: 'beginner',
    lessons: [
      { id: 1, title: 'Introduction to Charts', duration: '6 min', type: 'video', overview: 'Charts are visual representations of price movement over time. There are three main types: Line, Bar, and Candlestick charts. Learning to read charts is essential for technical analysis.', keyTakeaways: ['Charts visualize price movement over time', 'Candlestick charts are most popular', 'Chart reading is essential for technical analysis'], youtubeId: 'hU9BkqD3F6U', youtubeTitle: 'Introduction to Trading Charts' },
      { id: 2, title: 'Candlestick Anatomy', duration: '7 min', type: 'video', overview: 'A candlestick shows Open, High, Low, and Close. Green means bullish, red means bearish. Wicks show the extreme prices reached.', keyTakeaways: ['Each candle shows OHLC data', 'Green = bullish, Red = bearish', 'Wicks show extreme prices'], youtubeId: 'C3KRwfj9F8Q', youtubeTitle: 'Candlestick Charts Explained' },
      { id: 3, title: 'Common Candlestick Patterns', duration: '8 min', type: 'video', overview: 'Key patterns include Doji (indecision), Hammer (reversal), and Engulfing (momentum shift). Always confirm patterns with other analysis.', keyTakeaways: ['Doji shows indecision', 'Hammer signals reversals', 'Engulfing shows momentum shifts'], youtubeId: 'q8MNYg-Y1G8', youtubeTitle: 'Top Candlestick Patterns' },
      { id: 4, title: 'Timeframes Explained', duration: '8 min', type: 'text', overview: 'Scalpers use 1-5 minute charts. Day traders use 15min-1hour. Swing traders use 4hour-daily. Multi-timeframe analysis combines different views.', keyTakeaways: ['Scalpers: 1-5min charts', 'Day traders: 15min-1hour', 'Swing traders: 4hour-daily'] },
      { id: 5, title: 'Reading Price Action', duration: '6 min', type: 'video', overview: 'Price action is pure price movement without indicators. Uptrend = higher highs and lows. Downtrend = lower highs and lows.', keyTakeaways: ['Uptrend = higher highs and lows', 'Downtrend = lower highs and lows', 'Key levels act as support/resistance'], youtubeId: 'gvAJ92Zt9fY', youtubeTitle: 'Price Action Basics' },
      { id: 6, title: 'Chart Patterns Quiz', duration: '5 min', type: 'quiz', overview: 'Test your chart reading knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What does a green candlestick indicate?', options: ['Price went down', 'Price went up (bullish)', 'No price change', 'Market is closed'], correctIndex: 1, explanation: 'Green means the close was higher than open.' },
        { question: 'What does OHLC stand for?', options: ['Only High Low Close', 'Open High Low Close', 'Open Hour Low Count', 'Option Hedge Long Call'], correctIndex: 1, explanation: 'OHLC = Open, High, Low, Close.' },
        { question: 'What does a Doji indicate?', options: ['Strong buying', 'Strong selling', 'Market indecision', 'Market closure'], correctIndex: 2, explanation: 'Doji shows indecision between buyers and sellers.' },
        { question: 'What timeframe would a swing trader use?', options: ['1-minute', '4-hour to daily', '1-second', 'Yearly'], correctIndex: 1, explanation: 'Swing traders use 4-hour to daily charts.' },
        { question: 'An uptrend is characterized by:', options: ['Lower highs and lows', 'Higher highs and lows', 'Flat movement', 'Random spikes'], correctIndex: 1, explanation: 'Uptrend = consistently higher highs and lows.' }
      ]}
    ]
  },
  {
    id: 'risk-management',
    title: 'Risk Management 101',
    description: 'Protect your capital effectively',
    category: 'beginner',
    lessons: [
      { id: 1, title: 'Why Risk Management Matters', duration: '5 min', type: 'video', overview: 'Risk management is the most important skill. Even pros lose many trades - what matters is managing those losses. Never risk more than 1-2% per trade.', keyTakeaways: ['Risk management > strategy', 'Pros lose many trades too', 'Never risk more than 1-2%'], youtubeId: 'wxZ26IOv1-8', youtubeTitle: 'Risk Management Basics' },
      { id: 2, title: 'Position Sizing', duration: '6 min', type: 'video', overview: 'Position sizing determines how much you invest per trade. Calculate based on your risk amount and stop loss distance.', keyTakeaways: ['Position size controls dollar risk', 'Calculate based on stop loss', 'Keep risk consistent'], youtubeId: 'dLvAq5YlPCo', youtubeTitle: 'Position Sizing Explained' },
      { id: 3, title: 'Stop Losses and Take Profits', duration: '7 min', type: 'video', overview: 'Stop loss limits your loss. Take profit locks gains. Aim for 1:2 risk-reward ratio minimum.', keyTakeaways: ['Always use stop loss', 'Take profits lock gains', 'Aim for 1:2 risk-reward'], youtubeId: 'FqF9Q9p1Yvg', youtubeTitle: 'Stop Loss and Take Profit' },
      { id: 4, title: 'The 1% Rule', duration: '7 min', type: 'text', overview: 'Never risk more than 1% per trade. With $10,000 and 1% risk, max loss per trade = $100. This protects you through losing streaks.', keyTakeaways: ['1% max risk per trade', '10 losses at 1% = ~10% drawdown', 'Capital preservation is key'] },
      { id: 5, title: 'Risk Management Quiz', duration: '5 min', type: 'quiz', overview: 'Test your risk management knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What is the recommended max risk per trade?', options: ['5-10%', '1-2%', '25%', '50%'], correctIndex: 1, explanation: 'Professionals recommend 1-2% max risk.' },
        { question: 'What is a stop loss?', options: ['A profit target', 'An order that closes at predetermined loss', 'An indicator', 'A chart type'], correctIndex: 1, explanation: 'Stop loss closes your position to limit loss.' },
        { question: 'With 1:2 risk-reward, what win rate breaks even?', options: ['50%', '75%', '33%', '90%'], correctIndex: 2, explanation: '1 win (+$2) vs 2 losses (-$2) = break even at 33%.' },
        { question: 'If account is $5,000 with 1% rule, max risk per trade?', options: ['$500', '$50', '$100', '$250'], correctIndex: 1, explanation: '1% of $5,000 = $50.' },
        { question: 'Why is position sizing important?', options: ['Makes you rich fast', 'Keeps dollar risk consistent', 'Eliminates losses', 'Guarantees profits'], correctIndex: 1, explanation: 'Position sizing ensures consistent risk per trade.' }
      ]}
    ]
  },
  {
    id: 'trading-psychology',
    title: 'Trading Psychology',
    description: 'Master your emotions',
    category: 'beginner',
    lessons: [
      { id: 1, title: 'The Trader\'s Mindset', duration: '6 min', type: 'video', overview: 'Trading is 80% psychology, 20% strategy. Think in probabilities, accept that losses are normal.', keyTakeaways: ['80% psychology, 20% strategy', 'Think in probabilities', 'Losses are normal'], youtubeId: '8yVuew50N8g', youtubeTitle: 'Trading Mindset Basics' },
      { id: 2, title: 'Fear and Greed', duration: '5 min', type: 'video', overview: 'Fear causes early exits. Greed causes overtrading. Focus on process, not money.', keyTakeaways: ['Fear = early exits', 'Greed = overtrading', 'Focus on process'], youtubeId: 'Eb1_BIZXmkA', youtubeTitle: 'Fear and Greed in Trading' },
      { id: 3, title: 'Dealing with Losses', duration: '8 min', type: 'text', overview: 'Losses are normal - pros lose 40-50% of trades. Never revenge trade. Take breaks and keep a journal.', keyTakeaways: ['Pros lose 40-50%', 'Never revenge trade', 'Keep a trading journal'] },
      { id: 4, title: 'Building Discipline', duration: '6 min', type: 'video', overview: 'Create a detailed trading plan. Follow it without exceptions. Start with small positions.', keyTakeaways: ['Create detailed plan', 'Follow without exceptions', 'Start small'], youtubeId: 'YWgOJLCGEL4', youtubeTitle: 'Building Trading Discipline' },
      { id: 5, title: 'Psychology Quiz', duration: '5 min', type: 'quiz', overview: 'Test your psychology knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What % of trading is psychology?', options: ['20%', '50%', '80%', '10%'], correctIndex: 2, explanation: 'Trading is 80% psychology.' },
        { question: 'What does fear cause traders to do?', options: ['Hold longer', 'Exit early', 'Take more risks', 'Trade more'], correctIndex: 1, explanation: 'Fear causes premature exits.' },
        { question: 'What is revenge trading?', options: ['Trading against someone', 'Taking trades after loss to recover', 'A strategy', 'Trading during specific hours'], correctIndex: 1, explanation: 'Revenge trading is emotionally trying to recover losses.' },
        { question: 'How should you respond to a loss?', options: ['Trade immediately', 'Double position', 'Take a break and review', 'Quit forever'], correctIndex: 2, explanation: 'Take breaks for emotional reset.' },
        { question: 'Why is a trading plan important?', options: ['Guarantees profits', 'Provides rules when emotions run high', 'Eliminates losses', 'Required by law'], correctIndex: 1, explanation: 'Plans provide structure during emotional moments.' }
      ]}
    ]
  },
  {
    id: 'forex-basics',
    title: 'Forex Fundamentals',
    description: 'Currency pairs and market structure',
    category: 'beginner',
    lessons: [
      { id: 1, title: 'What is Forex?', duration: '5 min', type: 'video', overview: 'Forex is the largest market with $6+ trillion daily volume. It operates 24/5 and currencies trade in pairs.', keyTakeaways: ['$6+ trillion daily', '24 hours, 5 days', 'Currencies trade in pairs'], youtubeId: 'aJ8FVhNkqws', youtubeTitle: 'What is Forex Trading?' },
      { id: 2, title: 'Currency Pairs Explained', duration: '6 min', type: 'video', overview: 'Majors include USD (tightest spreads). Minors don\'t include USD. Exotics have wider spreads.', keyTakeaways: ['Majors = most liquid', 'EUR/USD most traded', 'Beginners: stick to majors'], youtubeId: '4g7c4E8vU2c', youtubeTitle: 'Currency Pairs Explained' },
      { id: 3, title: 'Pips, Lots, and Leverage', duration: '7 min', type: 'video', overview: 'Pip = smallest price move. Standard lot = 100,000 units. Leverage amplifies gains AND losses.', keyTakeaways: ['Pip = smallest move', 'Standard lot = 100k units', 'Leverage = double-edged sword'], youtubeId: 'TF9zMvJ6x3E', youtubeTitle: 'Pips, Lots and Leverage' },
      { id: 4, title: 'What Moves Currency Prices', duration: '10 min', type: 'text', overview: 'Interest rates are primary driver. Economic data, political events, and market sentiment also matter.', keyTakeaways: ['Interest rates = main driver', 'Economic data creates volatility', 'Political events matter'] },
      { id: 5, title: 'Forex Trading Sessions', duration: '5 min', type: 'video', overview: 'Sydney is quietest. London has highest volume. London/New York overlap is best for trading.', keyTakeaways: ['London = highest volume', 'Sydney = quietest', 'London/NY overlap = best'], youtubeId: 'W_r8pS2uQ48', youtubeTitle: 'Forex Trading Sessions' },
      { id: 6, title: 'Forex Fundamentals Quiz', duration: '5 min', type: 'quiz', overview: 'Test your Forex knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'Daily Forex trading volume?', options: ['$1 million', '$1 billion', 'Over $6 trillion', '$100 billion'], correctIndex: 2, explanation: 'Over $6 trillion daily.' },
        { question: 'What is a pip in EUR/USD?', options: ['0.01', '0.001', '0.0001', '1.0'], correctIndex: 2, explanation: 'One pip = 0.0001 for most pairs.' },
        { question: 'What does 100:1 leverage mean?', options: ['Need $100', '$1 controls $100', '100x profits only', 'Can only lose $1'], correctIndex: 1, explanation: '$1 controls $100 of currency.' },
        { question: 'Which session has highest volume?', options: ['Sydney', 'Tokyo', 'London', 'Weekend'], correctIndex: 2, explanation: 'London has highest volume.' },
        { question: 'What happens when country raises rates?', options: ['Currency weakens', 'Currency strengthens', 'No effect', 'Trading stops'], correctIndex: 1, explanation: 'Higher rates attract investment, strengthening currency.' }
      ]}
    ]
  },
  {
    id: 'crypto-basics',
    title: 'Cryptocurrency Fundamentals',
    description: 'Understanding digital assets and blockchain',
    category: 'beginner',
    lessons: [
      {
        id: 1,
        title: 'What is Cryptocurrency?',
        duration: '7 min',
        type: 'video',
        overview: `Cryptocurrency is digital money that uses cryptography for security. Unlike traditional currencies controlled by governments, crypto operates on decentralized networks.

Bitcoin, created in 2009, was the first cryptocurrency. It introduced blockchain technology - a public ledger recording all transactions. Since then, thousands of cryptocurrencies have emerged.

Key characteristics: decentralized (no central authority), transparent (public blockchain), secure (cryptographic protection), and borderless (works anywhere with internet).`,
        keyTakeaways: [
          'Cryptocurrency is decentralized digital money',
          'Bitcoin was the first, created in 2009',
          'Blockchain records all transactions publicly',
          'Crypto is borderless and operates 24/7'
        ],
        youtubeId: 'rYQgy8QDEBI',
        youtubeTitle: 'What is Cryptocurrency?'
      },
      {
        id: 2,
        title: 'How Blockchain Works',
        duration: '8 min',
        type: 'video',
        overview: `Blockchain is a distributed ledger technology that records transactions across many computers. Each "block" contains transaction data, a timestamp, and a link to the previous block.

Once recorded, transactions cannot be altered - this immutability creates trust without needing intermediaries. Miners or validators confirm transactions through consensus mechanisms.

Understanding blockchain helps you evaluate crypto projects. Strong blockchain = secure network. Weak blockchain = potential vulnerabilities.`,
        keyTakeaways: [
          'Blockchain = distributed ledger across computers',
          'Blocks contain transactions linked together',
          'Transactions are immutable once confirmed',
          'Consensus mechanisms validate transactions'
        ],
        youtubeId: 'SSo_EIwHSd4',
        youtubeTitle: 'How Blockchain Works'
      },
      {
        id: 3,
        title: 'Bitcoin vs Altcoins',
        duration: '6 min',
        type: 'video',
        overview: `Bitcoin (BTC) is the original cryptocurrency - the "digital gold" with the largest market cap. It's primarily used as a store of value and payment system.

Altcoins are all other cryptocurrencies. Ethereum enables smart contracts. Solana offers high speed. Each altcoin has different use cases and technology.

For beginners: start with Bitcoin and Ethereum. They have the most liquidity, information, and track record. Altcoins are higher risk but potentially higher reward.`,
        keyTakeaways: [
          'Bitcoin is the original and largest cryptocurrency',
          'Altcoins = all other cryptocurrencies',
          'Ethereum enables smart contracts and DeFi',
          'Start with BTC/ETH before exploring altcoins'
        ],
        youtubeId: 'MhldkvdS_rM',
        youtubeTitle: 'Bitcoin vs Altcoins Explained'
      },
      {
        id: 4,
        title: 'Crypto Wallets and Security',
        duration: '8 min',
        type: 'text',
        overview: `Crypto wallets store your private keys - the passwords to access your crypto. Without proper security, you can lose everything.

Hot wallets (software) are connected to internet - convenient but less secure. Cold wallets (hardware) are offline - more secure for long-term storage.

Golden rules: Never share your seed phrase. Use hardware wallets for large holdings. Enable 2FA everywhere. Only use reputable exchanges. Not your keys, not your crypto.`,
        keyTakeaways: [
          'Wallets store private keys, not actual crypto',
          'Hot wallets = convenient, less secure',
          'Cold wallets = secure for long-term storage',
          'Never share your seed phrase with anyone'
        ]
      },
      {
        id: 5,
        title: 'Crypto Trading Basics',
        duration: '7 min',
        type: 'video',
        overview: `Crypto markets trade 24/7/365 - never closes. This creates unique opportunities and risks compared to forex. Volatility is typically much higher.

You can trade crypto on centralized exchanges (Binance, Coinbase) or decentralized exchanges (Uniswap). Each has pros and cons.

Common pairs: BTC/USD, ETH/USD, BTC/USDT. Stablecoins (USDT, USDC) maintain $1 value and are used as trading pairs.`,
        keyTakeaways: [
          'Crypto markets trade 24/7/365',
          'Volatility is typically higher than forex',
          'CEX (centralized) vs DEX (decentralized) exchanges',
          'Stablecoins maintain $1 value for trading'
        ],
        youtubeId: 'GHH7dkdGYVY',
        youtubeTitle: 'Crypto Trading Basics'
      },
      {
        id: 6,
        title: 'Crypto Fundamentals Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your cryptocurrency knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What was the first cryptocurrency?', options: ['Ethereum', 'Bitcoin', 'Dogecoin', 'Litecoin'], correctIndex: 1, explanation: 'Bitcoin was created in 2009 as the first cryptocurrency.' },
          { question: 'What is blockchain?', options: ['A type of wallet', 'A distributed ledger recording transactions', 'A crypto exchange', 'A trading strategy'], correctIndex: 1, explanation: 'Blockchain is a distributed ledger technology.' },
          { question: 'Which wallet type is most secure for long-term?', options: ['Hot wallet', 'Exchange wallet', 'Cold/hardware wallet', 'Paper wallet'], correctIndex: 2, explanation: 'Cold wallets are offline and most secure.' },
          { question: 'When do crypto markets close?', options: ['Weekends', 'At night', 'Never - 24/7/365', 'Holidays'], correctIndex: 2, explanation: 'Crypto markets never close.' },
          { question: 'What are stablecoins?', options: ['Volatile coins', 'Coins pegged to $1 value', 'Mining rewards', 'NFTs'], correctIndex: 1, explanation: 'Stablecoins maintain stable value, typically $1.' }
        ]
      }
    ]
  }
];

// ==============================================================================
// INTERMEDIATE COURSES - PREMIUM ACCESS (FULL CONTENT)
// ==============================================================================

export const INTERMEDIATE_COURSES: CourseContent[] = [
  {
    id: 'technical-analysis',
    title: 'Technical Analysis',
    description: 'Master advanced chart patterns and indicators',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Technical Analysis Foundations',
        duration: '8 min',
        type: 'video',
        overview: `Technical analysis is the study of price action and market behavior to forecast future price movements. Unlike fundamental analysis, which looks at economic data, technical analysis focuses purely on charts and patterns.

The core principle is that price discounts everything - all known information is already reflected in the current price. Technical analysts believe that history tends to repeat itself, and patterns that worked before will work again.

Key tools include trend analysis, support/resistance levels, chart patterns, and technical indicators. Mastering these tools gives you an edge in timing your entries and exits.`,
        keyTakeaways: [
          'Technical analysis studies price action to forecast movements',
          'Price discounts all known information',
          'History tends to repeat - patterns recur',
          'Key tools: trends, levels, patterns, indicators'
        ],
        youtubeId: '08R_TJhAOGo',
        youtubeTitle: 'Technical Analysis Explained'
      },
      {
        id: 2,
        title: 'Market Structure Analysis',
        duration: '10 min',
        type: 'video',
        overview: `Market structure refers to the pattern of higher highs/lows (uptrend) or lower highs/lows (downtrend). Understanding structure helps you trade with the trend.

A Break of Structure (BOS) occurs when price breaks the most recent swing point, confirming trend continuation. A Change of Character (ChoCH) signals potential trend reversal when price fails to make new extremes.

Trading with structure means buying in uptrends when price pulls back to support, and selling in downtrends when price rallies to resistance.`,
        keyTakeaways: [
          'Uptrend = higher highs and higher lows',
          'Downtrend = lower highs and lower lows',
          'BOS confirms trend continuation',
          'ChoCH signals potential reversal'
        ],
        youtubeId: 'xE1F0R6SBco',
        youtubeTitle: 'Market Structure Basics'
      },
      {
        id: 3,
        title: 'Trend Lines and Channels',
        duration: '8 min',
        type: 'video',
        overview: `Trend lines connect swing lows in uptrends or swing highs in downtrends, providing dynamic support and resistance.

Channels are formed by drawing parallel lines above and below price action. Price often bounces between channel boundaries, creating trading opportunities.

Valid trend lines need at least 3 touches. The more touches, the more significant the level. Breaks of established trend lines often signal trend changes.`,
        keyTakeaways: [
          'Trend lines provide dynamic support/resistance',
          'Channels show price boundaries',
          'Valid trend lines need 3+ touches',
          'Trend line breaks signal potential reversals'
        ],
        youtubeId: 'nq-UjJNPLYY',
        youtubeTitle: 'Trend Lines and Channels'
      },
      {
        id: 4,
        title: 'Chart Patterns Deep Dive',
        duration: '12 min',
        type: 'video',
        overview: `Chart patterns are formations that signal potential price movements. Continuation patterns (flags, pennants, wedges) suggest the trend will continue. Reversal patterns (head & shoulders, double tops/bottoms) signal trend changes.

The Head and Shoulders is one of the most reliable reversal patterns. It consists of three peaks with the middle peak (head) being the highest.

Double tops and bottoms form when price fails to break a level twice, suggesting a reversal is likely.`,
        keyTakeaways: [
          'Continuation: flags, pennants, wedges',
          'Reversal: head & shoulders, double tops/bottoms',
          'Head & Shoulders = reliable reversal pattern',
          'Double tops/bottoms show failed breakouts'
        ],
        youtubeId: 'UMdj1N0r8dM',
        youtubeTitle: 'Chart Patterns Explained'
      },
      {
        id: 5,
        title: 'Volume Analysis',
        duration: '7 min',
        type: 'text',
        overview: `Volume confirms price movements. High volume during breakouts suggests genuine moves, while low volume suggests potential false breaks.

Volume should increase in the direction of the trend. In uptrends, volume should be higher on up days. In downtrends, volume should be higher on down days.

Volume divergence (price making new highs while volume decreases) often precedes reversals. Always use volume to validate your technical analysis.`,
        keyTakeaways: [
          'Volume confirms price movements',
          'High volume breakouts = genuine moves',
          'Volume should increase with trend',
          'Volume divergence precedes reversals'
        ]
      },
      {
        id: 6,
        title: 'Technical Analysis Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your technical analysis knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What does technical analysis focus on?', options: ['Economic data', 'Company earnings', 'Price action and charts', 'News events'], correctIndex: 2, explanation: 'Technical analysis studies price action and chart patterns.' },
          { question: 'What does a Break of Structure (BOS) indicate?', options: ['Trend reversal', 'Trend continuation', 'Market close', 'No trading'], correctIndex: 1, explanation: 'BOS confirms the current trend is continuing.' },
          { question: 'How many touches make a valid trend line?', options: ['1', '2', '3 or more', '10+'], correctIndex: 2, explanation: 'Valid trend lines need at least 3 touches.' },
          { question: 'What does the Head and Shoulders pattern signal?', options: ['Trend continuation', 'Potential reversal', 'Market opening', 'No change'], correctIndex: 1, explanation: 'Head & Shoulders is a reversal pattern.' },
          { question: 'What does high volume during breakouts suggest?', options: ['False breakout', 'Genuine move', 'Market manipulation', 'No significance'], correctIndex: 1, explanation: 'High volume confirms breakout validity.' }
        ]
      }
    ]
  },
  {
    id: 'support-resistance',
    title: 'Support & Resistance',
    description: 'Identify key price levels',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Understanding S/R Levels',
        duration: '7 min',
        type: 'video',
        overview: `Support is a price level where buying pressure exceeds selling pressure, causing price to bounce. Resistance is where selling pressure exceeds buying, causing price to reverse down.

These levels form because traders have memory - they remember where price previously reversed. Multiple bounces from a level make it more significant.

Support becomes resistance when broken, and vice versa. This "role reversal" is one of the most reliable concepts in trading.`,
        keyTakeaways: [
          'Support = buying pressure > selling pressure',
          'Resistance = selling pressure > buying pressure',
          'More bounces = stronger level',
          'Broken support becomes resistance (and vice versa)'
        ],
        youtubeId: 'Bj4GXfrxces',
        youtubeTitle: 'Support and Resistance Basics'
      },
      {
        id: 2,
        title: 'Identifying Key Levels',
        duration: '8 min',
        type: 'video',
        overview: `Key levels are identified by looking for areas where price has repeatedly reversed or paused. Focus on recent and significant swing points.

Psychological levels (round numbers like 1.2000, 1.2500) often act as support/resistance because traders place orders at these levels.

Historical levels from higher timeframes are more significant than lower timeframe levels. Always analyze multiple timeframes for confluence.`,
        keyTakeaways: [
          'Look for repeated reversals and pauses',
          'Round numbers are psychological levels',
          'Higher timeframe levels are more significant',
          'Multi-timeframe analysis improves accuracy'
        ],
        youtubeId: 'TWFcK9KQE-o',
        youtubeTitle: 'Finding Key Levels'
      },
      {
        id: 3,
        title: 'Trading S/R Bounces',
        duration: '9 min',
        type: 'video',
        overview: `Trading bounces involves entering when price approaches a key level and shows rejection. Wait for confirmation - don't just buy because price reaches support.

Confirmation signals include: rejection candles (pin bars, engulfing), divergence on indicators, or break of minor resistance on lower timeframes.

Always set your stop loss beyond the S/R level with some buffer. Take profit at the next significant level or use risk-reward targets.`,
        keyTakeaways: [
          'Wait for rejection confirmation at levels',
          'Use candlestick patterns for entry signals',
          'Stop loss beyond the level with buffer',
          'Target the next significant level'
        ],
        youtubeId: 'i6PQoH_M2nE',
        youtubeTitle: 'Trading S/R Bounces'
      },
      {
        id: 4,
        title: 'Breakout Trading from S/R',
        duration: '8 min',
        type: 'text',
        overview: `Breakouts occur when price decisively moves through a support or resistance level. True breakouts are often accompanied by increased volume and momentum.

False breakouts are common - price briefly breaks a level then reverses back. To avoid false breaks, wait for a close beyond the level, preferably on a higher timeframe.

After a breakout, price often retests the broken level before continuing. This retest offers a lower-risk entry opportunity.`,
        keyTakeaways: [
          'True breakouts have volume and momentum',
          'Wait for close beyond level to confirm',
          'False breakouts are common - be patient',
          'Retest entries offer lower risk'
        ]
      },
      {
        id: 5,
        title: 'S/R Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your support and resistance knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What is support?', options: ['Where selling exceeds buying', 'Where buying exceeds selling', 'Market close', 'Trading session'], correctIndex: 1, explanation: 'Support is where buying pressure causes bounces.' },
          { question: 'What happens when support is broken?', options: ['It disappears', 'It becomes resistance', 'Nothing changes', 'Market closes'], correctIndex: 1, explanation: 'Broken support becomes resistance (role reversal).' },
          { question: 'Why are round numbers significant?', options: ['Computer preference', 'Psychological levels where orders cluster', 'Random coincidence', 'No significance'], correctIndex: 1, explanation: 'Traders place orders at round numbers.' },
          { question: 'What confirms a breakout?', options: ['Low volume', 'Increased volume and momentum', 'Market news', 'Time of day'], correctIndex: 1, explanation: 'True breakouts have volume and momentum.' },
          { question: 'What is a retest?', options: ['A failed trade', 'Price returning to broken level', 'Market closure', 'Trading strategy'], correctIndex: 1, explanation: 'Retests offer low-risk entry after breakouts.' }
        ]
      }
    ]
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci Trading',
    description: 'Use mathematical ratios for trading',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Fibonacci Basics',
        duration: '7 min',
        type: 'video',
        overview: `Fibonacci ratios are derived from the Fibonacci sequence (1, 1, 2, 3, 5, 8, 13...). Key ratios used in trading are 23.6%, 38.2%, 50%, 61.8%, and 78.6%.

These ratios appear throughout nature and financial markets. Traders use them to identify potential reversal points during retracements.

The 61.8% level (golden ratio) is considered the most significant. Price often reverses at these mathematical levels with uncanny accuracy.`,
        keyTakeaways: [
          'Key ratios: 23.6%, 38.2%, 50%, 61.8%, 78.6%',
          'Derived from Fibonacci sequence',
          '61.8% (golden ratio) is most significant',
          'Ratios identify potential reversal points'
        ],
        youtubeId: 'VhNnkSccCMM',
        youtubeTitle: 'Fibonacci Basics'
      },
      {
        id: 2,
        title: 'Fibonacci Retracements',
        duration: '9 min',
        type: 'video',
        overview: `Fibonacci retracements measure how far price has pulled back from a swing. In uptrends, draw from swing low to swing high. In downtrends, draw from swing high to swing low.

The tool shows potential support levels where price might bounce and continue the trend. Most significant bounces occur at 38.2%, 50%, and 61.8%.

Use multiple swing points to find confluent levels - when multiple Fibonacci levels align, the zone becomes more significant.`,
        keyTakeaways: [
          'Measure pullback depth with retracements',
          'Uptrend: draw low to high',
          '38.2%, 50%, 61.8% are key levels',
          'Confluence increases significance'
        ],
        youtubeId: 'aSB7-FBU7_8',
        youtubeTitle: 'Fibonacci Retracements'
      },
      {
        id: 3,
        title: 'Fibonacci Extensions',
        duration: '8 min',
        type: 'video',
        overview: `Fibonacci extensions project where price might reach after a retracement. Key extension levels are 127.2%, 161.8%, and 261.8%.

Extensions help set profit targets. If price bounces from a 61.8% retracement, it often extends to 127.2% or 161.8% of the original move.

Draw extensions using three points: the swing start, swing end, and retracement low/high. This projects future targets.`,
        keyTakeaways: [
          'Extensions project price targets',
          'Key levels: 127.2%, 161.8%, 261.8%',
          'Use for take profit placement',
          'Requires three-point drawing method'
        ],
        youtubeId: 'uGZ_-E8Ykik',
        youtubeTitle: 'Fibonacci Extensions'
      },
      {
        id: 4,
        title: 'Fibonacci Confluence',
        duration: '8 min',
        type: 'text',
        overview: `Fibonacci confluence occurs when multiple Fibonacci levels from different swings align at similar prices. These zones are highly significant.

Combine Fibonacci with other technical tools: S/R levels, trend lines, and moving averages. When multiple tools align, the probability of reversal increases.

Look for "kill zones" where Fibonacci levels cluster. These areas often produce the best trading setups with higher win rates.`,
        keyTakeaways: [
          'Confluence = multiple levels aligning',
          'Combine with S/R and trend lines',
          'Kill zones are high-probability areas',
          'More confluence = higher probability'
        ]
      },
      {
        id: 5,
        title: 'Fibonacci Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your Fibonacci knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What is the "golden ratio"?', options: ['23.6%', '38.2%', '61.8%', '78.6%'], correctIndex: 2, explanation: '61.8% is the golden ratio.' },
          { question: 'How do you draw uptrend retracements?', options: ['High to low', 'Low to high', 'Random points', 'Horizontal only'], correctIndex: 1, explanation: 'Uptrend retracements go from swing low to swing high.' },
          { question: 'What do Fibonacci extensions show?', options: ['Entry points', 'Stop losses', 'Price targets', 'Volume'], correctIndex: 2, explanation: 'Extensions project where price might reach.' },
          { question: 'What is Fibonacci confluence?', options: ['Single level', 'Multiple levels aligning', 'Market close', 'Trading session'], correctIndex: 1, explanation: 'Confluence is when multiple levels align.' },
          { question: 'Which levels are most significant for retracements?', options: ['10%, 20%, 30%', '38.2%, 50%, 61.8%', '90%, 95%, 100%', 'Random levels'], correctIndex: 1, explanation: '38.2%, 50%, and 61.8% are key retracement levels.' }
        ]
      }
    ]
  },
  {
    id: 'moving-averages',
    title: 'Moving Averages Mastery',
    description: 'Dynamic support, resistance, and signals',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Types of Moving Averages',
        duration: '7 min',
        type: 'video',
        overview: `Moving averages smooth price data to identify trend direction. Simple Moving Average (SMA) gives equal weight to all periods. Exponential Moving Average (EMA) weights recent prices more heavily.

Common periods: 20 for short-term, 50 for medium-term, 200 for long-term trend. The 200 MA is considered the most important for overall trend direction.

EMA reacts faster to price changes, while SMA is smoother. Most traders prefer EMA for shorter timeframes and SMA for longer ones.`,
        keyTakeaways: [
          'SMA = equal weight, EMA = recent weight',
          'Common periods: 20, 50, 200',
          '200 MA = most important for trend',
          'EMA faster, SMA smoother'
        ],
        youtubeId: 'gf9t3a3Q0xM',
        youtubeTitle: 'Moving Averages Explained'
      },
      {
        id: 2,
        title: 'MA as Dynamic S/R',
        duration: '8 min',
        type: 'video',
        overview: `Moving averages act as dynamic support and resistance. In uptrends, price often bounces off the MA from above. In downtrends, price rejects from the MA from below.

The 20 EMA is popular for aggressive entries in strong trends. The 50 EMA works well for swing trading. The 200 MA defines the overall trend.

When price is above the 200 MA, look for long trades. When below, focus on shorts. This simple rule keeps you trading with the trend.`,
        keyTakeaways: [
          'MAs provide dynamic support/resistance',
          '20 EMA = aggressive trend entries',
          '200 MA defines overall trend',
          'Above 200 MA = look long, below = look short'
        ],
        youtubeId: 'D8QKPwnvmL4',
        youtubeTitle: 'MA Dynamic Support/Resistance'
      },
      {
        id: 3,
        title: 'MA Crossover Strategies',
        duration: '9 min',
        type: 'video',
        overview: `MA crossovers generate signals when a faster MA crosses a slower MA. Golden Cross: 50 MA crosses above 200 MA (bullish). Death Cross: 50 MA crosses below 200 MA (bearish).

Shorter-period crossovers (9/21 EMA) generate more signals but more false ones. Longer-period crossovers are more reliable but lag more.

Crossovers work best in trending markets. In ranging markets, they produce many false signals. Always confirm with other tools.`,
        keyTakeaways: [
          'Golden Cross = bullish (50 above 200)',
          'Death Cross = bearish (50 below 200)',
          'Shorter periods = more signals, more false',
          'Best in trending markets'
        ],
        youtubeId: 'PgQM-CUJzWg',
        youtubeTitle: 'MA Crossover Strategies'
      },
      {
        id: 4,
        title: 'Multiple MA Systems',
        duration: '8 min',
        type: 'text',
        overview: `Many traders use multiple MAs together. A common setup is 9, 21, and 50 EMAs. When stacked in order (9 > 21 > 50), the trend is strong bullish. Reversed order (9 < 21 < 50) = strong bearish.

MA ribbon systems use many MAs (8, 13, 21, 34, 55). When ribbons expand, trend is accelerating. When they contract, momentum is slowing.

Use MA slope to gauge trend strength. Steep slopes indicate strong momentum; flat MAs suggest consolidation.`,
        keyTakeaways: [
          'Multiple MAs show trend strength',
          'Stacked MAs confirm trend direction',
          'Expanding ribbon = accelerating trend',
          'MA slope indicates momentum'
        ]
      },
      {
        id: 5,
        title: 'Moving Averages Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your moving average knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What is the difference between SMA and EMA?', options: ['No difference', 'EMA weights recent prices more', 'SMA is faster', 'EMA uses volume'], correctIndex: 1, explanation: 'EMA gives more weight to recent prices.' },
          { question: 'What is a Golden Cross?', options: ['50 MA below 200 MA', '50 MA above 200 MA', 'Price above MA', 'Price below MA'], correctIndex: 1, explanation: 'Golden Cross = 50 MA crosses above 200 MA.' },
          { question: 'Which MA is most important for trend?', options: ['9 MA', '20 MA', '50 MA', '200 MA'], correctIndex: 3, explanation: '200 MA defines overall trend.' },
          { question: 'How do MAs act as support?', options: ['Fixed levels', 'Dynamic levels that move with price', 'News events', 'Volume spikes'], correctIndex: 1, explanation: 'MAs provide dynamic, moving support/resistance.' },
          { question: 'When do MA crossovers work best?', options: ['Ranging markets', 'Trending markets', 'News events', 'All times equally'], correctIndex: 1, explanation: 'Crossovers perform best in trending conditions.' }
        ]
      }
    ]
  },
  {
    id: 'rsi-macd',
    title: 'RSI & MACD Strategies',
    description: 'Master momentum indicators',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'RSI Fundamentals',
        duration: '8 min',
        type: 'video',
        overview: `RSI (Relative Strength Index) measures momentum on a 0-100 scale. Above 70 = overbought, below 30 = oversold. Standard setting is 14 periods.

Overbought doesn't mean "sell now" - in strong trends, RSI can stay overbought for extended periods. Use overbought/oversold as alerts, not automatic signals.

RSI divergence is powerful: when price makes new highs but RSI makes lower highs, momentum is weakening. This often precedes reversals.`,
        keyTakeaways: [
          'RSI range: 0-100, standard 14 periods',
          'Above 70 = overbought, below 30 = oversold',
          'Overbought can persist in strong trends',
          'RSI divergence precedes reversals'
        ],
        youtubeId: 'fSorNdF6MYg',
        youtubeTitle: 'RSI Indicator Explained'
      },
      {
        id: 2,
        title: 'RSI Trading Strategies',
        duration: '9 min',
        type: 'video',
        overview: `The 50 level is key for RSI. In uptrends, RSI tends to stay above 50. In downtrends, it stays below. Use 50 as a trend filter.

RSI range trading: buy when RSI drops to 30 in uptrends, sell when it rises to 70 in downtrends. This catches pullbacks within trends.

RSI breakouts: draw trend lines on RSI itself. RSI breaking its trend line often precedes price breaking its trend line.`,
        keyTakeaways: [
          '50 level = trend filter',
          'Buy at 30 in uptrends, sell at 70 in downtrends',
          'RSI trend lines predict price trend lines',
          'Combine with price action for confirmation'
        ],
        youtubeId: 'wQ-i84kLHBM',
        youtubeTitle: 'RSI Trading Strategies'
      },
      {
        id: 3,
        title: 'MACD Fundamentals',
        duration: '8 min',
        type: 'video',
        overview: `MACD (Moving Average Convergence Divergence) shows momentum and trend direction. It consists of MACD line, Signal line, and Histogram.

Standard settings: 12, 26, 9. MACD line = 12 EMA - 26 EMA. Signal line = 9 EMA of MACD. Histogram = MACD - Signal.

MACD crossing above signal line = bullish. Crossing below = bearish. Zero line crossings indicate trend direction changes.`,
        keyTakeaways: [
          'MACD = momentum + trend indicator',
          'Standard: 12, 26, 9',
          'MACD above signal = bullish',
          'Zero line shows trend direction'
        ],
        youtubeId: 'vuMjcJQ6xxM',
        youtubeTitle: 'MACD Indicator Explained'
      },
      {
        id: 4,
        title: 'MACD Divergence Trading',
        duration: '8 min',
        type: 'text',
        overview: `MACD divergence is one of the most reliable reversal signals. Regular divergence: price makes new extreme, MACD doesn't = potential reversal.

Hidden divergence suggests trend continuation. In uptrends, price makes higher low but MACD makes lower low = continuation bullish.

The histogram shows momentum. Growing histogram = increasing momentum. Shrinking histogram = momentum fading. Watch for histogram divergence too.`,
        keyTakeaways: [
          'Regular divergence = reversal signal',
          'Hidden divergence = continuation signal',
          'Histogram shows momentum strength',
          'Shrinking histogram = fading momentum'
        ]
      },
      {
        id: 5,
        title: 'RSI & MACD Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your RSI and MACD knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What RSI level indicates overbought?', options: ['30', '50', '70', '100'], correctIndex: 2, explanation: 'Above 70 = overbought.' },
          { question: 'What is RSI divergence?', options: ['RSI matches price', 'RSI contradicts price', 'RSI at zero', 'RSI at 100'], correctIndex: 1, explanation: 'Divergence = price and RSI moving opposite.' },
          { question: 'What are standard MACD settings?', options: ['9, 21, 50', '12, 26, 9', '20, 50, 200', '5, 10, 15'], correctIndex: 1, explanation: 'Standard MACD: 12, 26, 9.' },
          { question: 'What does MACD histogram show?', options: ['Volume', 'Momentum strength', 'Price level', 'Time'], correctIndex: 1, explanation: 'Histogram shows momentum intensity.' },
          { question: 'MACD crossing above signal line is:', options: ['Bearish', 'Neutral', 'Bullish', 'Invalid'], correctIndex: 2, explanation: 'MACD above signal = bullish.' }
        ]
      }
    ]
  },
  {
    id: 'breakout-trading',
    title: 'Breakout Trading',
    description: 'Catch explosive moves',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Breakout Trading Basics',
        duration: '7 min',
        type: 'video',
        overview: `Breakouts occur when price moves beyond established support or resistance with momentum. These moments often lead to explosive moves as orders trigger.

True breakouts need volume confirmation. Without volume, the move lacks conviction and may fail. Look for volume 1.5-2x average.

Breakouts can occur from consolidation ranges, chart patterns (triangles, rectangles), or key S/R levels. Each type has different characteristics.`,
        keyTakeaways: [
          'Breakouts = price beyond S/R with momentum',
          'Volume confirms breakout validity',
          'Look for 1.5-2x average volume',
          'Multiple breakout types exist'
        ],
        youtubeId: 'Pr90rZL7VF8',
        youtubeTitle: 'Breakout Trading Basics'
      },
      {
        id: 2,
        title: 'Identifying Breakout Setups',
        duration: '9 min',
        type: 'video',
        overview: `Best breakouts come from tight consolidations. When price compresses into narrow ranges, energy builds. The subsequent breakout is often powerful.

Look for declining volume during consolidation, then expanding volume on breakout. This pattern shows accumulation before the move.

Higher timeframe breakouts are more reliable. A daily breakout carries more weight than a 5-minute breakout. Always check the bigger picture.`,
        keyTakeaways: [
          'Tight consolidations = powerful breakouts',
          'Declining volume before, expanding on break',
          'Higher timeframe breakouts more reliable',
          'Check the bigger picture'
        ],
        youtubeId: 'Iz8IJL7rfBM',
        youtubeTitle: 'Finding Breakout Setups'
      },
      {
        id: 3,
        title: 'False Breakout Recognition',
        duration: '8 min',
        type: 'video',
        overview: `False breakouts are common - up to 70% of breakouts fail. Price briefly breaks a level then reverses back inside the range.

Signs of false breaks: low volume, quick reversal, wicks beyond level but close inside, occurring against the larger trend.

Trade false breakouts by fading them: when a breakout fails, enter in the opposite direction with stop beyond the false break high/low.`,
        keyTakeaways: [
          'Up to 70% of breakouts fail',
          'Low volume = likely false break',
          'Wicks beyond, close inside = false',
          'False breakouts can be traded'
        ],
        youtubeId: 'nWPjNWAc5RM',
        youtubeTitle: 'False Breakout Trading'
      },
      {
        id: 4,
        title: 'Breakout Entry Techniques',
        duration: '8 min',
        type: 'text',
        overview: `Three entry methods: 1) Aggressive - enter as price breaks level. 2) Moderate - wait for candle close beyond level. 3) Conservative - wait for retest of broken level.

Retest entries offer better risk-reward but you may miss some breakouts that don't retest. Aggressive entries catch more moves but have more false signals.

Stop loss placement: beyond the breakout candle or below the last swing low for longs. Target based on measured move (range height) or next S/R level.`,
        keyTakeaways: [
          'Three entries: aggressive, moderate, conservative',
          'Retest offers better R:R but misses some',
          'Stop beyond breakout candle',
          'Target = measured move or next S/R'
        ]
      },
      {
        id: 5,
        title: 'Breakout Trading Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your breakout trading knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What confirms a true breakout?', options: ['Low volume', 'High volume', 'News', 'Time of day'], correctIndex: 1, explanation: 'High volume confirms breakout validity.' },
          { question: 'What percentage of breakouts fail?', options: ['10%', '30%', 'Up to 70%', '90%'], correctIndex: 2, explanation: 'Up to 70% of breakouts fail.' },
          { question: 'What indicates a false breakout?', options: ['High volume', 'Close beyond level', 'Wick beyond, close inside', 'Strong momentum'], correctIndex: 2, explanation: 'Wicks beyond but closing inside = false break.' },
          { question: 'What is a retest entry?', options: ['Entering on first break', 'Waiting for return to broken level', 'Trading against breakout', 'Random entry'], correctIndex: 1, explanation: 'Retest = entering when price returns to broken level.' },
          { question: 'Best breakouts come from:', options: ['Wide ranges', 'Tight consolidations', 'Trending markets', 'News events'], correctIndex: 1, explanation: 'Tight consolidations produce powerful breakouts.' }
        ]
      }
    ]
  },
  {
    id: 'trend-trading',
    title: 'Trend Trading Strategies',
    description: 'Ride the trend to profits',
    category: 'intermediate',
    lessons: [
      { id: 1, title: 'Identifying Trends', duration: '8 min', type: 'video', overview: 'Trends are the foundation of profitable trading. An uptrend consists of higher highs and higher lows. A downtrend has lower highs and lower lows. Sideways markets show no clear direction.\n\nThe trend is your friend - trading with the trend dramatically improves your win rate. Against-trend trades have lower probability and should be avoided by most traders.\n\nUse multiple timeframes to confirm trend direction. The higher timeframe trend is more significant.', keyTakeaways: ['Uptrend = higher highs and lows', 'Downtrend = lower highs and lows', 'Trade with the trend for better odds', 'Higher timeframe trend is dominant'], youtubeId: 'PRoqfWxLV0A', youtubeTitle: 'Trend Identification' },
      { id: 2, title: 'Trend Following Entries', duration: '10 min', type: 'video', overview: 'The best trend entries come on pullbacks, not at new highs/lows. Wait for price to retrace to support in uptrends or resistance in downtrends.\n\nUse moving averages as dynamic support/resistance. The 20 EMA is popular for aggressive entries, 50 EMA for conservative entries.\n\nConfirm entries with candlestick patterns like engulfing, pin bars, or inside bars at key levels.', keyTakeaways: ['Enter on pullbacks, not at extremes', 'MAs provide dynamic S/R', '20 EMA for aggressive, 50 EMA for conservative', 'Confirm with candlestick patterns'], youtubeId: 'XKLqYLp1rP0', youtubeTitle: 'Trend Entry Strategies' },
      { id: 3, title: 'Trailing Stops in Trends', duration: '9 min', type: 'video', overview: 'Trailing stops let profits run while protecting gains. As price moves in your favor, move your stop loss to lock in profits.\n\nMethods include: below swing lows (uptrend), below moving averages, using ATR-based stops, or fixed pip increments.\n\nAvoid trailing too tight - give the trend room to breathe. Too-tight stops get hit by normal pullbacks.', keyTakeaways: ['Trailing stops lock in profits', 'Trail below swing lows or MAs', 'ATR-based stops adjust to volatility', 'Give trends room to breathe'], youtubeId: 'cMi4nRqSrCU', youtubeTitle: 'Trailing Stop Strategies' },
      { id: 4, title: 'Trend Exhaustion Signs', duration: '8 min', type: 'text', overview: 'Recognizing when a trend is ending helps you exit positions and potentially reverse. Key exhaustion signs include:\n\nDivergence: Price makes new highs but indicators (RSI, MACD) make lower highs. This shows weakening momentum.\n\nClimax moves: Extremely large candles at the end of trends often signal exhaustion.\n\nVolume patterns: Decreasing volume on new highs/lows suggests lack of conviction.', keyTakeaways: ['Divergence signals weakening momentum', 'Climax moves often end trends', 'Decreasing volume = lack of conviction', 'Multiple signs increase probability'] },
      { id: 5, title: 'Trend Trading Quiz', duration: '5 min', type: 'quiz', overview: 'Test your trend trading knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What defines an uptrend?', options: ['Lower highs and lows', 'Higher highs and higher lows', 'Sideways movement', 'Random price action'], correctIndex: 1, explanation: 'Uptrend = consistently higher highs and higher lows.' },
        { question: 'When is the best time to enter a trend trade?', options: ['At new highs', 'On pullbacks to support', 'At random times', 'When news releases'], correctIndex: 1, explanation: 'Pullbacks offer better risk/reward entries.' },
        { question: 'What is a trailing stop?', options: ['Fixed stop loss', 'Stop that moves to lock profits', 'Take profit order', 'Pending order'], correctIndex: 1, explanation: 'Trailing stops move with price to protect gains.' },
        { question: 'What does divergence indicate?', options: ['Trend strength', 'Trend acceleration', 'Weakening momentum', 'No significance'], correctIndex: 2, explanation: 'Divergence shows momentum weakening despite price extremes.' },
        { question: 'Which MA is most aggressive for entries?', options: ['200 EMA', '50 EMA', '20 EMA', '5 EMA'], correctIndex: 2, explanation: '20 EMA provides faster, more aggressive entries.' }
      ]}
    ]
  },
  {
    id: 'swing-trading',
    title: 'Swing Trading',
    description: 'Multi-day position strategies',
    category: 'intermediate',
    lessons: [
      { id: 1, title: 'Swing Trading Fundamentals', duration: '9 min', type: 'video', overview: 'Swing trading captures moves that last days to weeks. Unlike day trading, you hold overnight and through multiple sessions.\n\nAdvantages: Less screen time, larger profit targets, lower transaction costs. You can have a full-time job and still swing trade.\n\nTypical holding period is 2-10 days. You\'re trying to catch one "swing" or leg of a larger trend.', keyTakeaways: ['Holds last 2-10 days typically', 'Less screen time than day trading', 'Can trade with a full-time job', 'Captures one leg of larger moves'], youtubeId: 'rZVl7RZ_-c0', youtubeTitle: 'Swing Trading Basics' },
      { id: 2, title: 'Swing Trade Setups', duration: '10 min', type: 'video', overview: 'Best swing setups form at key levels after pullbacks. Look for:\n\nPullback to support in uptrend with bullish reversal candle. Break and retest of resistance-turned-support. Bounce from moving average (50 or 200 MA).\n\nHigher timeframes (4H, Daily) provide cleaner setups. Weekly charts help identify the overall trend direction.', keyTakeaways: ['Trade pullbacks to key levels', 'Break and retest patterns work well', 'MA bounces offer entries', 'Use 4H/Daily charts for setups'], youtubeId: 'F-0L0mL9zXk', youtubeTitle: 'Swing Trading Setups' },
      { id: 3, title: 'Position Sizing for Swings', duration: '8 min', type: 'video', overview: 'Swing trades have wider stops than day trades, so position size must adjust. Calculate your risk in dollars, then size position based on stop distance.\n\nExample: $500 risk, 100 pip stop = 0.5 lots. Same risk, 50 pip stop = 1 lot.\n\nNever risk more than 1-2% per swing trade. The wider stop means smaller position but same dollar risk.', keyTakeaways: ['Wider stops = smaller positions', 'Calculate size from stop distance', 'Keep risk at 1-2% per trade', 'Dollar risk stays constant'], youtubeId: '9bwcMQ47-6E', youtubeTitle: 'Swing Trade Position Sizing' },
      { id: 4, title: 'Managing Overnight Risk', duration: '8 min', type: 'text', overview: 'Holding overnight exposes you to gap risk - price can open significantly different from the previous close.\n\nMitigate by: Avoiding holding through major news events, using slightly wider stops for gap buffer, reducing position size if uncertain.\n\nWeekend gaps are especially risky. Some traders close positions Friday to avoid Monday gap risk.', keyTakeaways: ['Gaps can move price significantly', 'Avoid holding through major news', 'Use wider stops for gap buffer', 'Consider closing before weekends'] },
      { id: 5, title: 'Swing Trading Quiz', duration: '5 min', type: 'quiz', overview: 'Test your swing trading knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'Typical swing trade duration?', options: ['Minutes', 'Hours', '2-10 days', 'Months'], correctIndex: 2, explanation: 'Swing trades typically last 2-10 days.' },
        { question: 'What timeframe is best for swing setups?', options: ['1 minute', '15 minute', '4 hour / Daily', 'Monthly'], correctIndex: 2, explanation: '4H and Daily charts provide cleaner swing setups.' },
        { question: 'How should position size change with wider stops?', options: ['Increase', 'Decrease', 'Stay same', 'Double'], correctIndex: 1, explanation: 'Wider stops require smaller positions to maintain same risk.' },
        { question: 'What is gap risk?', options: ['Chart gaps', 'Price opening different from close', 'Indicator error', 'No risk'], correctIndex: 1, explanation: 'Gaps can cause price to open significantly different.' },
        { question: 'When are gaps most risky?', options: ['Intraday', 'After weekends', 'During London', 'Never'], correctIndex: 1, explanation: 'Weekend gaps can be substantial due to closed markets.' }
      ]}
    ]
  },
  {
    id: 'backtesting',
    title: 'Backtesting Strategies',
    description: 'Test before you trade',
    category: 'intermediate',
    lessons: [
      { id: 1, title: 'Why Backtesting Matters', duration: '7 min', type: 'video', overview: 'Backtesting means testing your strategy on historical data before risking real money. It reveals if your edge actually exists.\n\nWithout backtesting, you\'re gambling. With it, you know your expected win rate, average win/loss, and drawdown before trading live.\n\nBacktesting builds confidence - when you hit a losing streak, you know it\'s within expected parameters.', keyTakeaways: ['Test on historical data first', 'Reveals true edge and statistics', 'Know expected win rate before live', 'Builds confidence during drawdowns'], youtubeId: 'YjGlOOlJ8nA', youtubeTitle: 'Backtesting Importance' },
      { id: 2, title: 'Manual Backtesting Process', duration: '10 min', type: 'video', overview: 'Manual backtesting: scroll back in charts and simulate trades. Mark entries, stops, and targets as if trading live.\n\nRecord every trade: date, pair, entry, exit, result. Calculate win rate, average R:R, and total R gained.\n\nTest at least 100 trades for statistical significance. Less than 100 trades doesn\'t provide reliable data.', keyTakeaways: ['Scroll back and simulate trades', 'Record all trade data', 'Calculate key statistics', 'Need 100+ trades minimum'], youtubeId: 'Qcvg6-TQ4hE', youtubeTitle: 'Manual Backtesting Guide' },
      { id: 3, title: 'Analyzing Backtest Results', duration: '9 min', type: 'video', overview: 'Key metrics from backtesting:\n\nWin Rate: Percentage of winning trades. 50%+ is good for R:R strategies.\nExpectancy: (Win% × Avg Win) - (Loss% × Avg Loss). Must be positive.\nMax Drawdown: Largest peak-to-trough decline. Can you emotionally handle it?\n\nA strategy with 40% win rate can be profitable with 1:2+ R:R.', keyTakeaways: ['Win rate, expectancy, drawdown are key', 'Expectancy must be positive', 'Can you handle the max drawdown?', '40% win rate works with good R:R'], youtubeId: 'pBu8bKBu0rc', youtubeTitle: 'Analyzing Backtest Results' },
      { id: 4, title: 'Avoiding Curve Fitting', duration: '8 min', type: 'text', overview: 'Curve fitting means over-optimizing your strategy to fit past data perfectly. The strategy looks amazing historically but fails live.\n\nSigns of curve fitting: Too many rules/filters, perfect results on one pair but fails others, performance drops dramatically on unseen data.\n\nSolution: Keep rules simple, test on multiple pairs and timeframes, use out-of-sample testing (save some data for final validation).', keyTakeaways: ['Curve fitting = over-optimization', 'Too many rules = likely curve fit', 'Test on multiple pairs/timeframes', 'Use out-of-sample data for validation'] },
      { id: 5, title: 'Backtesting Quiz', duration: '5 min', type: 'quiz', overview: 'Test your backtesting knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'Why is backtesting important?', options: ['Guarantees profits', 'Reveals if your edge exists', 'Eliminates losses', 'Required by law'], correctIndex: 1, explanation: 'Backtesting shows if your strategy actually works.' },
        { question: 'How many trades for reliable backtest?', options: ['10', '25', '100+', '5'], correctIndex: 2, explanation: '100+ trades provides statistical significance.' },
        { question: 'What must expectancy be?', options: ['Negative', 'Zero', 'Positive', 'High as possible'], correctIndex: 2, explanation: 'Positive expectancy = profitable over time.' },
        { question: 'What is curve fitting?', options: ['Drawing curves on charts', 'Over-optimizing to past data', 'Fibonacci technique', 'Trend lines'], correctIndex: 1, explanation: 'Curve fitting = over-optimization that fails live.' },
        { question: 'How to avoid curve fitting?', options: ['More rules', 'Keep rules simple, test multiple markets', 'Perfect past results', 'One timeframe only'], correctIndex: 1, explanation: 'Simple rules + multiple markets = robust strategy.' }
      ]}
    ]
  },
  {
    id: 'trade-management',
    title: 'Trade Management',
    description: 'Entries, exits, and scaling',
    category: 'intermediate',
    lessons: [
      { id: 1, title: 'Entry Techniques', duration: '8 min', type: 'video', overview: 'Entry timing affects your risk/reward significantly. Three main approaches:\n\nMarket Entry: Enter immediately at current price. Fast but may not get best price.\nLimit Entry: Set price you want. Better price but may miss the trade.\nStop Entry: Enter when price breaks a level. Confirms momentum but wider stop.\n\nEach has tradeoffs - choose based on strategy needs.', keyTakeaways: ['Market = immediate, not best price', 'Limit = better price, may miss trade', 'Stop = confirms momentum, wider stop', 'Choose based on strategy'], youtubeId: 'T7bQQfz4TyU', youtubeTitle: 'Entry Techniques' },
      { id: 2, title: 'Exit Strategies', duration: '9 min', type: 'video', overview: 'Exits determine your profit more than entries. Options:\n\nFixed Target: Set take profit at specific level. Simple but may exit too early.\nTrailing Stop: Move stop as price moves. Captures more of trends.\nPartial Profits: Take some profit at first target, let rest run. Balances security and potential.\n\nPlan exits before entering - never exit based on emotions.', keyTakeaways: ['Fixed targets are simple but limited', 'Trailing stops capture more trend', 'Partials balance security and potential', 'Plan exits before entering'], youtubeId: 'EkNjf9nH3wM', youtubeTitle: 'Exit Strategy Guide' },
      { id: 3, title: 'Scaling In and Out', duration: '9 min', type: 'video', overview: 'Scaling means entering or exiting in portions rather than all at once.\n\nScaling In: Add to winners. If first entry proves correct, add more at next pullback. Never add to losers.\nScaling Out: Take partial profits. Common: 50% at first target, trail rest. Locks in profit while allowing for runners.\n\nScaling requires more management but improves average entries/exits.', keyTakeaways: ['Scaling = entering/exiting in portions', 'Add to winners, never to losers', '50% out at first target is common', 'Improves average entry/exit prices'], youtubeId: 'x2uTCNvV-LI', youtubeTitle: 'Scaling Strategies' },
      { id: 4, title: 'When to Move to Breakeven', duration: '7 min', type: 'text', overview: 'Moving stop to breakeven eliminates risk but may get stopped out of winning trades.\n\nToo early: Price often retests entry before moving in your direction. Moving to BE too fast = frequent stop outs.\n\nGood practice: Wait until price hits first target or shows strong momentum. Move to BE once 1R profit is reached.\n\nSome strategies work better never moving to BE - test what works for your approach.', keyTakeaways: ['BE stops eliminate risk', 'Too early = premature stop outs', 'Wait for 1R profit or first target', 'Test what works for your strategy'] },
      { id: 5, title: 'Trade Management Quiz', duration: '5 min', type: 'quiz', overview: 'Test your trade management knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What is a limit entry?', options: ['Enter immediately', 'Set desired entry price', 'Enter on breakout', 'Random entry'], correctIndex: 1, explanation: 'Limit orders enter at your specified price.' },
        { question: 'What is scaling out?', options: ['Adding to losers', 'Taking partial profits', 'Full exit', 'No exit'], correctIndex: 1, explanation: 'Scaling out = taking profits in portions.' },
        { question: 'Should you add to losing trades?', options: ['Yes, always', 'Never', 'Sometimes', 'Only in uptrends'], correctIndex: 1, explanation: 'Never add to losers - it increases risk.' },
        { question: 'When to move stop to breakeven?', options: ['Immediately', 'After 1R profit or first target', 'Never', 'After 3 candles'], correctIndex: 1, explanation: 'Wait for sufficient profit before moving to BE.' },
        { question: 'Why plan exits before entering?', options: ['Not important', 'Avoid emotional decisions', 'Market requirement', 'For journaling'], correctIndex: 1, explanation: 'Pre-planned exits prevent emotional mistakes.' }
      ]}
    ]
  },
  {
    id: 'news-trading',
    title: 'News Trading',
    description: 'Trading economic events',
    category: 'intermediate',
    lessons: [
      { id: 1, title: 'Economic Calendar Basics', duration: '7 min', type: 'video', overview: 'The economic calendar shows scheduled news releases and their expected impact. High-impact events cause the most volatility.\n\nKey events: NFP (Non-Farm Payrolls), Interest Rate Decisions, CPI (Inflation), GDP, Employment data.\n\nAlways check the calendar before trading. Even if you don\'t trade news, you need to know when volatility may spike.', keyTakeaways: ['Economic calendar shows scheduled events', 'High impact events = most volatility', 'Key: NFP, rates, CPI, GDP, employment', 'Always check before trading'], youtubeId: 'rRmLxAiA0ds', youtubeTitle: 'Economic Calendar Guide' },
      { id: 2, title: 'Trading the News', duration: '9 min', type: 'video', overview: 'Two main approaches to news trading:\n\nStraddle: Place pending orders above and below price before news. Whichever way it breaks, one order triggers.\nFade: Wait for initial spike, then trade the reversal. News often creates overreactions that correct.\n\nBoth are risky - spreads widen, slippage increases. Use small position sizes for news trading.', keyTakeaways: ['Straddle catches breakout either way', 'Fade trades the reversal after spike', 'Spreads widen during news', 'Use small positions for news trades'], youtubeId: '9sRzPHxJcAY', youtubeTitle: 'News Trading Strategies' },
      { id: 3, title: 'Understanding Market Expectations', duration: '8 min', type: 'video', overview: 'Markets move based on SURPRISE, not the news itself. If unemployment comes in at 5% and everyone expected 5%, little movement.\n\nBut if expected 5% and actual is 4.5%, the positive surprise causes strong reaction.\n\nForecasts and previous numbers are shown on economic calendars. The actual vs expected difference drives volatility.', keyTakeaways: ['Markets react to surprise, not news', 'Actual vs Expected drives moves', 'Same-as-expected = minimal reaction', 'Big surprises cause big moves'], youtubeId: '7gxNp-K2_Mc', youtubeTitle: 'Market Expectations' },
      { id: 4, title: 'News Trading Risks', duration: '7 min', type: 'text', overview: 'News trading is risky. Be aware:\n\nSlippage: Your order may fill at worse price than requested. In fast markets, slippage can be significant.\nSpread Widening: Brokers widen spreads during high volatility. Your stop may trigger at worse levels.\nWhipsaws: Price often spikes both directions before choosing one. Both straddle orders can trigger and lose.\n\nMany experienced traders simply avoid trading during high-impact news.', keyTakeaways: ['Slippage can be significant', 'Spreads widen during news', 'Whipsaws can hit both directions', 'Many traders avoid news entirely'] },
      { id: 5, title: 'News Trading Quiz', duration: '5 min', type: 'quiz', overview: 'Test your news trading knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What is NFP?', options: ['Chart pattern', 'Non-Farm Payrolls - jobs report', 'Indicator', 'Broker type'], correctIndex: 1, explanation: 'NFP is the US jobs report - high impact.' },
        { question: 'What drives market reaction to news?', options: ['The news itself', 'Surprise vs expectations', 'Time of day', 'Currency pair'], correctIndex: 1, explanation: 'Actual vs Expected difference causes movement.' },
        { question: 'What is a straddle strategy?', options: ['Hold position through news', 'Pending orders both directions', 'Exit before news', 'Fade the move'], correctIndex: 1, explanation: 'Straddle catches breakout either direction.' },
        { question: 'What is slippage?', options: ['Chart gap', 'Order fills at different price', 'Indicator lag', 'Spread cost'], correctIndex: 1, explanation: 'Slippage = fill at worse price than requested.' },
        { question: 'Why do spreads widen during news?', options: ['Broker error', 'Increased volatility and risk', 'Market closure', 'Technical issue'], correctIndex: 1, explanation: 'Brokers widen spreads to manage volatility risk.' }
      ]}
    ]
  },
  {
    id: 'correlation',
    title: 'Market Correlation',
    description: 'Understanding market relationships',
    category: 'intermediate',
    lessons: [
      { id: 1, title: 'Correlation Basics', duration: '7 min', type: 'video', overview: 'Correlation measures how two markets move relative to each other. Positive correlation: both move same direction. Negative correlation: they move opposite.\n\nCorrelation ranges from -1 (perfect inverse) to +1 (perfect positive). Zero means no relationship.\n\nUnderstanding correlations helps with risk management and finding confirmation for trades.', keyTakeaways: ['Positive correlation = same direction', 'Negative correlation = opposite', 'Scale: -1 to +1', 'Helps risk management and confirmation'], youtubeId: 'wPCGWqPn6Qw', youtubeTitle: 'Correlation Basics' },
      { id: 2, title: 'Currency Correlations', duration: '8 min', type: 'video', overview: 'Major currency correlations:\n\nEUR/USD and GBP/USD: Highly correlated (positive). Both move against USD.\nEUR/USD and USD/CHF: Negatively correlated. One rises, other falls.\nAUD/USD and Gold: Positively correlated due to Australia\'s gold exports.\n\nAvoid taking same-direction trades on highly correlated pairs - you\'re doubling risk.', keyTakeaways: ['EUR/USD & GBP/USD = positive correlation', 'EUR/USD & USD/CHF = negative', 'AUD/USD correlates with Gold', 'Avoid doubling correlated positions'], youtubeId: 'qZd3yrKjYbc', youtubeTitle: 'Currency Correlations' },
      { id: 3, title: 'Using Correlation for Confirmation', duration: '8 min', type: 'video', overview: 'Correlated markets can confirm your analysis. If EUR/USD shows a buy signal, check GBP/USD. If it also looks bullish, your signal is stronger.\n\nDivergence between correlated pairs can signal reversals. If EUR/USD makes new highs but GBP/USD doesn\'t, the move may be weak.\n\nWatch DXY (Dollar Index) to understand USD strength across all pairs.', keyTakeaways: ['Use correlated pairs for confirmation', 'Divergence signals weakness', 'DXY shows overall USD strength', 'Multiple confirmations = stronger signal'], youtubeId: 'FlIzJZYvYwI', youtubeTitle: 'Correlation Confirmation' },
      { id: 4, title: 'Portfolio Correlation Risk', duration: '7 min', type: 'text', overview: 'If you trade multiple pairs, correlation affects your total risk.\n\nExample: Long EUR/USD and Long GBP/USD. If USD strengthens, both lose. You effectively have double the risk.\n\nDiversify across non-correlated or negatively correlated assets. This reduces overall portfolio volatility and risk.\n\nAlways consider correlation when sizing positions across multiple trades.', keyTakeaways: ['Correlated positions multiply risk', 'Long EUR/USD + Long GBP/USD = doubled risk', 'Diversify across non-correlated assets', 'Consider correlation when sizing'] },
      { id: 5, title: 'Correlation Quiz', duration: '5 min', type: 'quiz', overview: 'Test your correlation knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What does +1 correlation mean?', options: ['No relationship', 'Perfect inverse movement', 'Perfect same direction', 'Random'], correctIndex: 2, explanation: '+1 = perfect positive correlation, move same way.' },
        { question: 'EUR/USD and USD/CHF are:', options: ['Positively correlated', 'Negatively correlated', 'Not correlated', 'Randomly correlated'], correctIndex: 1, explanation: 'They move opposite due to USD being base/quote.' },
        { question: 'Why avoid same direction on correlated pairs?', options: ['No reason', 'Doubles your risk', 'Broker rules', 'Chart clutter'], correctIndex: 1, explanation: 'Correlated same-direction trades multiply risk.' },
        { question: 'What is DXY?', options: ['Currency pair', 'Dollar Index', 'Indicator name', 'Broker'], correctIndex: 1, explanation: 'DXY measures USD strength vs basket of currencies.' },
        { question: 'How can correlation divergence help?', options: ['More trades', 'Signals weakness in moves', 'Increases profit', 'No use'], correctIndex: 1, explanation: 'When correlated pairs diverge, the move may be weak.' }
      ]}
    ]
  },
  {
    id: 'crypto-technical',
    title: 'Crypto Technical Analysis',
    description: 'Advanced chart analysis for digital assets',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Bitcoin Chart Patterns',
        duration: '9 min',
        type: 'video',
        overview: `Bitcoin has unique chart behaviors compared to forex. The 24/7 market means patterns can complete at any time, and weekend gaps don't exist.

Key BTC-specific patterns: Bull flags after halvings, accumulation ranges after 80% drawdowns, blow-off tops with parabolic rises, and capitulation wicks marking bottoms.

Bitcoin respects technical levels well due to algorithmic trading. Round numbers ($50K, $100K) act as strong psychological barriers.`,
        keyTakeaways: [
          'BTC trades 24/7 - no weekend gaps',
          'Halving events create predictable cycles',
          'Round numbers are strong psychological levels',
          'Capitulation wicks often mark cycle bottoms'
        ],
        youtubeId: 'kdOqxvwv7KQ',
        youtubeTitle: 'Bitcoin Technical Analysis'
      },
      {
        id: 2,
        title: 'Altcoin Analysis',
        duration: '10 min',
        type: 'video',
        overview: `Altcoins are highly correlated with Bitcoin. When BTC dumps, alts dump harder. When BTC rallies, alts often outperform (alt season).

Check BTC dominance chart - when it falls, money flows into alts. Rising dominance means capital consolidating into Bitcoin.

Key altcoin metrics: Trading volume, liquidity, market cap. Low-cap coins are manipulated easily. Stick to top 50 for technical analysis reliability.`,
        keyTakeaways: [
          'Altcoins highly correlated with BTC',
          'BTC dominance shows capital flow',
          'Falling dominance = alt season potential',
          'Stick to high-cap coins for reliable TA'
        ],
        youtubeId: 'BVbSFLqPXqg',
        youtubeTitle: 'Altcoin Analysis Guide'
      },
      {
        id: 3,
        title: 'Crypto Support and Resistance',
        duration: '8 min',
        type: 'video',
        overview: `Crypto S/R works similarly to forex but with key differences. Previous ATH (all-time high) becomes major resistance. Psychological levels ($10K, $50K, $100K) are critical.

On-chain data adds another layer: realized price (average cost basis of all coins), whale accumulation zones, and exchange inflow/outflow levels.

Higher timeframe S/R is most reliable. Daily and weekly levels trump hourly ones, especially during high volatility.`,
        keyTakeaways: [
          'Previous ATH becomes major resistance',
          'Psychological round numbers are critical',
          'On-chain data provides additional S/R',
          'Higher timeframe levels are most reliable'
        ],
        youtubeId: 'E5gX5ReDMDU',
        youtubeTitle: 'Crypto Support Resistance'
      },
      {
        id: 4,
        title: 'Crypto Volume and Liquidity',
        duration: '9 min',
        type: 'text',
        overview: `Volume analysis in crypto is essential but tricky. Exchange volumes can be faked (wash trading). Use aggregated data from multiple sources.

Liquidity varies dramatically. BTC/ETH have deep liquidity. Small altcoins can move 50% on small orders. Always check order book depth before trading.

High volume at key levels confirms breakouts. Low volume pumps often retrace completely. Volume profile shows where traders are positioned.`,
        keyTakeaways: [
          'Exchange volumes can be manipulated',
          'BTC/ETH have best liquidity',
          'Small altcoins move dramatically on low volume',
          'Volume confirms breakout validity'
        ]
      },
      {
        id: 5,
        title: 'Crypto Technical Analysis Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your crypto TA knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'When does the crypto market close?', options: ['Weekends', 'At night', 'Never - 24/7', 'Holidays'], correctIndex: 2, explanation: 'Crypto trades 24/7/365.' },
          { question: 'What does falling BTC dominance indicate?', options: ['BTC strengthening', 'Money flowing to altcoins', 'Market crash', 'Nothing'], correctIndex: 1, explanation: 'Falling dominance = capital moving to alts.' },
          { question: 'Why is previous ATH significant?', options: ['Random level', 'Becomes major resistance', 'No significance', 'Changes daily'], correctIndex: 1, explanation: 'ATH becomes psychological resistance.' },
          { question: 'What is wash trading?', options: ['Cleaning coins', 'Fake volume trading', 'Legitimate trading', 'Stop losses'], correctIndex: 1, explanation: 'Wash trading creates fake volume.' },
          { question: 'Which crypto pairs have best liquidity?', options: ['Small altcoins', 'BTC and ETH pairs', 'New tokens', 'Memecoins'], correctIndex: 1, explanation: 'BTC/ETH have deepest liquidity.' }
        ]
      }
    ]
  },
  {
    id: 'crypto-onchain',
    title: 'On-Chain Analysis',
    description: 'Blockchain data for trading decisions',
    category: 'intermediate',
    lessons: [
      {
        id: 1,
        title: 'Introduction to On-Chain Data',
        duration: '8 min',
        type: 'video',
        overview: `On-chain analysis examines blockchain data to understand market behavior. Unlike traditional markets, crypto transactions are public and verifiable.

Key metrics: Active addresses, transaction volume, exchange flows, wallet balances, and miner behavior. This data reveals what market participants are actually doing.

On-chain complements technical analysis. When both align, you have higher-probability setups. Divergences between price and on-chain can signal reversals.`,
        keyTakeaways: [
          'Blockchain data is public and verifiable',
          'Shows actual behavior, not just price',
          'Complements technical analysis',
          'Divergences signal potential reversals'
        ],
        youtubeId: 'PKCnecSW9s8',
        youtubeTitle: 'On-Chain Analysis Intro'
      },
      {
        id: 2,
        title: 'Exchange Flows',
        duration: '9 min',
        type: 'video',
        overview: `Exchange inflows: Coins moving to exchanges, often to sell. High inflows can precede dumps.

Exchange outflows: Coins leaving exchanges to private wallets. Indicates accumulation and long-term holding.

Net flow (inflow - outflow) is key. Sustained negative net flow = bullish. Sustained positive net flow = potential selling pressure.`,
        keyTakeaways: [
          'Inflows = coins to exchanges, potential selling',
          'Outflows = accumulation, bullish signal',
          'Net flow shows overall direction',
          'Sustained patterns are most significant'
        ],
        youtubeId: 'HJvEMncjxI8',
        youtubeTitle: 'Exchange Flow Analysis'
      },
      {
        id: 3,
        title: 'Whale Watching',
        duration: '8 min',
        type: 'video',
        overview: `Whales are addresses holding large amounts of crypto. Their movements can significantly impact price. Tracking whale behavior provides early warnings.

Watch for: Large wallet accumulation during dips, whale transfers to exchanges (selling), and new whale wallets appearing (institutional entry).

Tools like Whale Alert track large transactions in real-time. Combine with price action for context - not all large transfers mean selling.`,
        keyTakeaways: [
          'Whales hold significant market influence',
          'Accumulation during dips = bullish',
          'Exchange transfers may signal selling',
          'Context matters - not all transfers are sales'
        ],
        youtubeId: 'Qd8I8UFSZMI',
        youtubeTitle: 'Whale Watching Guide'
      },
      {
        id: 4,
        title: 'HODL Waves and Supply',
        duration: '8 min',
        type: 'text',
        overview: `HODL waves show age distribution of coins. Coins held longer = stronger hands. When long-term holders sell, it often signals tops.

Realized cap vs Market cap: Realized cap values coins at price last moved. Gap between them shows unrealized profit/loss in the market.

Supply metrics: Illiquid supply (coins not moving), liquid supply on exchanges. Decreasing liquid supply with rising price = bullish.`,
        keyTakeaways: [
          'HODL waves show coin age distribution',
          'Long-term holders selling = potential top',
          'Realized cap shows cost basis',
          'Decreasing liquid supply = bullish'
        ]
      },
      {
        id: 5,
        title: 'On-Chain Analysis Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your on-chain analysis knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What do exchange inflows typically indicate?', options: ['Bullish signal', 'Potential selling', 'Market close', 'Nothing'], correctIndex: 1, explanation: 'Coins moving to exchanges often precede selling.' },
          { question: 'What does negative net flow mean?', options: ['Selling pressure', 'More leaving exchanges than entering', 'Crash imminent', 'No trading'], correctIndex: 1, explanation: 'Negative net flow = more outflows = accumulation.' },
          { question: 'Who are whales?', options: ['Small traders', 'Large holders that move markets', 'Exchanges', 'Miners only'], correctIndex: 1, explanation: 'Whales are large holders with market influence.' },
          { question: 'What do HODL waves show?', options: ['Price prediction', 'Age of coins', 'Trade volume', 'New wallets'], correctIndex: 1, explanation: 'HODL waves show how long coins have been held.' },
          { question: 'Decreasing liquid supply with rising price is:', options: ['Bearish', 'Bullish', 'Neutral', 'Irrelevant'], correctIndex: 1, explanation: 'Less available supply + demand = price increase.' }
        ]
      }
    ]
  }
];

// ==============================================================================
// ADVANCED COURSES - VIP ACCESS (FULL CONTENT)
// ==============================================================================

export const ADVANCED_COURSES: CourseContent[] = [
  {
    id: 'institutional',
    title: 'Institutional Trading',
    description: 'Trade like banks and hedge funds',
    category: 'advanced',
    lessons: [
      {
        id: 1,
        title: 'How Institutions Trade',
        duration: '10 min',
        type: 'video',
        overview: `Institutional traders (banks, hedge funds) don't trade like retail traders. They can't simply click buy/sell - their orders are too large. They need to accumulate and distribute positions over time without moving price against themselves.

Understanding institutional behavior gives you an edge. They leave footprints in the market: order blocks, fair value gaps, and liquidity sweeps. Learning to read these can put you on the same side as smart money.

Institutions need liquidity to fill orders. They often manipulate price to areas where retail stops cluster, then reverse. This is why many retail traders get stopped out before the market moves in their direction.`,
        keyTakeaways: [
          'Institutions can\'t enter/exit quickly like retail',
          'They accumulate/distribute over time',
          'They leave footprints: order blocks, FVGs, sweeps',
          'They hunt retail stop losses for liquidity'
        ],
        youtubeId: '5B-RpC3wbsg',
        youtubeTitle: 'How Institutions Trade'
      },
      {
        id: 2,
        title: 'Order Blocks',
        duration: '9 min',
        type: 'video',
        overview: `Order blocks are areas where institutions have placed significant orders. They appear as the last opposing candle before a strong move. When price returns to these areas, it often reverses.

Bullish order block: the last bearish candle before a strong bullish move. Bearish order block: the last bullish candle before a strong bearish move.

Not all order blocks are equal. Focus on ones that broke structure, have clean moves away, and haven't been mitigated (revisited) yet.`,
        keyTakeaways: [
          'Order blocks = institutional order areas',
          'Last opposing candle before strong move',
          'Price often reverses at order blocks',
          'Unmitigated blocks are most powerful'
        ],
        youtubeId: 'eSFt1F3sJwU',
        youtubeTitle: 'Order Blocks Explained'
      },
      {
        id: 3,
        title: 'Fair Value Gaps (FVG)',
        duration: '8 min',
        type: 'video',
        overview: `Fair Value Gaps are imbalances in price where buying and selling didn't occur equally. They appear as gaps between candle wicks, showing aggressive moves.

Price tends to return to fill these gaps because they represent "unfair" prices - areas where orders weren't properly matched. Institutional traders often target these gaps.

Use FVGs as entry zones. When price returns to fill a gap in the direction of your trade, it offers high-probability entries with tight stops.`,
        keyTakeaways: [
          'FVG = imbalance between candle wicks',
          'Represent aggressive, unbalanced moves',
          'Price tends to return and fill gaps',
          'Use as entry zones in trend direction'
        ],
        youtubeId: 'k7y-6xIyNYw',
        youtubeTitle: 'Fair Value Gaps Trading'
      },
      {
        id: 4,
        title: 'Liquidity Concepts',
        duration: '10 min',
        type: 'text',
        overview: `Liquidity is where stop losses and pending orders cluster. Common areas: above/below obvious swing points, round numbers, and trend line touches.

Institutions need liquidity to fill large orders. They often push price to these areas to trigger stops, which provides the liquidity they need, then reverse.

"Liquidity sweeps" occur when price briefly spikes beyond a level to grab stops, then reverses. Recognizing these can help you avoid getting stopped out and potentially trade the reversal.`,
        keyTakeaways: [
          'Liquidity = clustered orders (stops, pending)',
          'Found at swing points, round numbers',
          'Institutions sweep liquidity before reversing',
          'Avoid placing stops at obvious levels'
        ]
      },
      {
        id: 5,
        title: 'Institutional Concepts Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your institutional trading knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'Why can\'t institutions trade like retail?', options: ['Regulations', 'Their orders are too large', 'Time restrictions', 'Technology limits'], correctIndex: 1, explanation: 'Large orders would move price against them.' },
          { question: 'What is an order block?', options: ['Technical indicator', 'Last opposing candle before strong move', 'News event', 'Volume spike'], correctIndex: 1, explanation: 'Order block = institutional order area.' },
          { question: 'What is a Fair Value Gap?', options: ['Price target', 'Imbalance between candle wicks', 'Support level', 'Moving average'], correctIndex: 1, explanation: 'FVG shows aggressive, imbalanced moves.' },
          { question: 'What is a liquidity sweep?', options: ['Market close', 'Spike to grab stops then reverse', 'Volume increase', 'Trend start'], correctIndex: 1, explanation: 'Sweeps grab liquidity before reversing.' },
          { question: 'Where is liquidity commonly found?', options: ['Random levels', 'Above/below swing points', 'Only at round numbers', 'Never at obvious levels'], correctIndex: 1, explanation: 'Stops cluster at obvious swing points.' }
        ]
      }
    ]
  },
  {
    id: 'order-flow',
    title: 'Order Flow Analysis',
    description: 'Read market depth and order activity',
    category: 'advanced',
    lessons: [
      {
        id: 1,
        title: 'Order Flow Basics',
        duration: '9 min',
        type: 'video',
        overview: `Order flow shows the actual buying and selling happening in real-time. While charts show price history, order flow shows what's driving price right now.

Market orders (immediate execution) move price. Limit orders (pending orders) provide levels where price may pause. Understanding the interaction between these reveals market intent.

Order flow analysis requires specific tools: footprint charts, depth of market (DOM), and volume profile. These show where orders are executing and where liquidity sits.`,
        keyTakeaways: [
          'Order flow shows real-time buying/selling',
          'Market orders move price',
          'Limit orders provide support/resistance',
          'Requires specialized tools: footprint, DOM'
        ],
        youtubeId: '4OgL_e1PpTM',
        youtubeTitle: 'Order Flow Basics'
      },
      {
        id: 2,
        title: 'Volume Profile Analysis',
        duration: '10 min',
        type: 'video',
        overview: `Volume Profile shows where the most trading occurred at each price level. High Volume Nodes (HVN) act as magnets and S/R. Low Volume Nodes (LVN) are areas price moves through quickly.

Point of Control (POC) is the price with most volume - the "fair value" for that session. Price tends to return to POC like a magnet.

Value Area (VA) contains 70% of volume. Price inside VA is "fair" - expect ranging. Price outside VA is "unfair" - expect it to return or trend strongly.`,
        keyTakeaways: [
          'HVN = support/resistance, magnets',
          'LVN = areas of quick movement',
          'POC = fair value, price magnet',
          'Value Area = 70% of volume'
        ],
        youtubeId: 'TJxQO6ntAcs',
        youtubeTitle: 'Volume Profile Trading'
      },
      {
        id: 3,
        title: 'Delta and Cumulative Delta',
        duration: '9 min',
        type: 'video',
        overview: `Delta measures the difference between buying and selling volume. Positive delta = more buying. Negative delta = more selling.

Cumulative Delta (CD) shows the running total of delta. Rising CD with rising price confirms buyers in control. Divergence between price and CD signals potential reversal.

Delta divergence is powerful: if price makes new highs but delta is lower than the previous high, buying is weakening. This often precedes pullbacks.`,
        keyTakeaways: [
          'Delta = buying volume - selling volume',
          'Cumulative Delta shows running total',
          'Price + CD rising = buyers in control',
          'Delta divergence signals reversals'
        ],
        youtubeId: 'Y2Dx1J6P1Pw',
        youtubeTitle: 'Delta Analysis'
      },
      {
        id: 4,
        title: 'Absorption and Exhaustion',
        duration: '9 min',
        type: 'text',
        overview: `Absorption occurs when large limit orders absorb market orders without price moving much. This shows institutional presence - they're accumulating without showing their hand.

Watch for high volume with little price movement. This indicates strong hands absorbing selling (bullish) or buying (bearish) pressure.

Exhaustion occurs when aggressive buyers/sellers push price but fail to attract follow-through. Volume spikes but price quickly reverses. This signals the move is ending.`,
        keyTakeaways: [
          'Absorption = orders absorbed without price move',
          'Shows institutional accumulation',
          'Exhaustion = volume spike with quick reversal',
          'Both signal potential turning points'
        ]
      },
      {
        id: 5,
        title: 'Order Flow Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your order flow knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What moves price?', options: ['Limit orders', 'Market orders', 'News', 'Time'], correctIndex: 1, explanation: 'Market orders (immediate execution) move price.' },
          { question: 'What is Point of Control (POC)?', options: ['Random level', 'Price with most volume', 'Daily high', 'Daily low'], correctIndex: 1, explanation: 'POC = highest volume price level.' },
          { question: 'What does positive delta indicate?', options: ['More selling', 'More buying', 'No activity', 'Market close'], correctIndex: 1, explanation: 'Positive delta = buying > selling.' },
          { question: 'What is absorption?', options: ['Price spike', 'Orders absorbed with little price movement', 'Volume decrease', 'Trend start'], correctIndex: 1, explanation: 'Absorption = high volume, little price movement.' },
          { question: 'What does exhaustion indicate?', options: ['Trend start', 'Move is ending', 'More momentum coming', 'Market open'], correctIndex: 1, explanation: 'Exhaustion signals the current move is ending.' }
        ]
      }
    ]
  },
  {
    id: 'smart-money',
    title: 'Smart Money Concepts',
    description: 'Follow institutional footprints',
    category: 'advanced',
    lessons: [
      {
        id: 1,
        title: 'Smart Money vs Dumb Money',
        duration: '8 min',
        type: 'video',
        overview: `Smart Money refers to institutional traders with information advantages and deep pockets. Dumb Money is retail traders who often trade emotionally and predictably.

Retail traders tend to buy at highs and sell at lows, chase breakouts, and place stops at obvious levels. Smart money exploits these patterns.

The goal is to identify what smart money is doing and align with them. This means avoiding retail traps and recognizing accumulation/distribution phases.`,
        keyTakeaways: [
          'Smart Money = institutions with advantages',
          'Retail often buys highs, sells lows',
          'Smart money exploits retail behavior',
          'Align with smart money, avoid traps'
        ],
        youtubeId: 'NcC5C0Qd9kU',
        youtubeTitle: 'Smart Money Concepts'
      },
      {
        id: 2,
        title: 'Accumulation and Distribution',
        duration: '10 min',
        type: 'video',
        overview: `Accumulation is when smart money quietly builds positions at low prices. Price moves sideways while they absorb all selling. Then price breaks out.

Distribution is the opposite - smart money sells positions at high prices. Price moves sideways while they offload, then breaks down.

Wyckoff methodology describes these phases. Look for: trading range after trend, tests of support/resistance, springs (false breaks), and volume patterns.`,
        keyTakeaways: [
          'Accumulation = building positions at lows',
          'Distribution = selling positions at highs',
          'Both appear as sideways ranges',
          'Wyckoff describes these phases'
        ],
        youtubeId: '9q-fmQ_HjK4',
        youtubeTitle: 'Accumulation and Distribution'
      },
      {
        id: 3,
        title: 'Inducement and Manipulation',
        duration: '9 min',
        type: 'video',
        overview: `Inducement is how smart money attracts retail orders to provide liquidity. They create obvious patterns that retail traders love to trade.

Common inducements: double bottoms/tops that fail, obvious trend lines that break, support/resistance that doesn't hold initially.

The "stop hunt" is manipulation where price spikes to take out stops, then reverses. This provides smart money the liquidity they need to enter large positions.`,
        keyTakeaways: [
          'Inducement attracts retail orders',
          'Creates patterns retail loves to trade',
          'Stop hunts provide liquidity',
          'Recognize inducement to avoid traps'
        ],
        youtubeId: 'V9j-JmMxwVQ',
        youtubeTitle: 'Market Manipulation'
      },
      {
        id: 4,
        title: 'Trading with Smart Money',
        duration: '9 min',
        type: 'text',
        overview: `To trade with smart money: 1) Wait for liquidity grabs (stop hunts) before entering. 2) Trade from order blocks and FVGs. 3) Enter on retests, not breakouts. 4) Avoid obvious levels for stops.

The mindset shift: instead of asking "where should I enter?", ask "where will smart money enter?". Think about liquidity and order flow.

Patience is essential. Smart money setups don't appear constantly. Wait for high-probability scenarios where retail gets trapped and smart money reverses price.`,
        keyTakeaways: [
          'Wait for liquidity grabs before entering',
          'Trade from order blocks and FVGs',
          'Enter on retests, not breakouts',
          'Think "where will smart money enter?"'
        ]
      },
      {
        id: 5,
        title: 'Smart Money Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your smart money knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'Who is "Smart Money"?', options: ['Retail traders', 'Institutional traders', 'News reporters', 'Brokers'], correctIndex: 1, explanation: 'Smart Money = institutions with advantages.' },
          { question: 'What is accumulation?', options: ['Selling at highs', 'Building positions at lows', 'Random trading', 'Day trading'], correctIndex: 1, explanation: 'Accumulation = building positions quietly.' },
          { question: 'What is inducement?', options: ['Teaching', 'Attracting retail orders for liquidity', 'Technical indicator', 'News trading'], correctIndex: 1, explanation: 'Inducement attracts retail to provide liquidity.' },
          { question: 'What is a stop hunt?', options: ['Searching for trades', 'Spike to take out stops then reverse', 'Volume analysis', 'Trend following'], correctIndex: 1, explanation: 'Stop hunts grab liquidity then reverse.' },
          { question: 'How should you place stops?', options: ['At obvious levels', 'Beyond obvious levels with buffer', 'Very tight', 'Very wide'], correctIndex: 1, explanation: 'Avoid obvious levels that get hunted.' }
        ]
      }
    ]
  },
  {
    id: 'liquidity',
    title: 'Liquidity Trading',
    description: 'Understand and trade liquidity',
    category: 'advanced',
    lessons: [
      {
        id: 1,
        title: 'Liquidity Fundamentals',
        duration: '9 min',
        type: 'video',
        overview: `Liquidity in trading terms means resting orders (stops and limits) at specific price levels. These orders are the "fuel" that moves markets.

External liquidity sits above highs and below lows - where stops cluster. Internal liquidity is within price ranges - order blocks, FVGs, and imbalances.

Price is always seeking liquidity. Understanding this principle explains why price often sweeps highs/lows before reversing - it's grabbing liquidity.`,
        keyTakeaways: [
          'Liquidity = resting orders at price levels',
          'External: above highs, below lows',
          'Internal: order blocks, FVGs',
          'Price constantly seeks liquidity'
        ],
        youtubeId: 'mSN_FDxaZxI',
        youtubeTitle: 'Liquidity in Trading'
      },
      {
        id: 2,
        title: 'Liquidity Pools',
        duration: '8 min',
        type: 'video',
        overview: `Liquidity pools are areas where significant orders have accumulated. Equal highs/lows form obvious pools - everyone sees them, everyone places stops there.

"Buy-side liquidity" sits above resistance levels (buy stops). "Sell-side liquidity" sits below support levels (sell stops).

The most powerful trades come after liquidity pools are swept. Once the stops are triggered, the move often reverses because the "fuel" has been consumed.`,
        keyTakeaways: [
          'Equal highs/lows = obvious liquidity pools',
          'Buy-side above resistance, sell-side below support',
          'Best trades after pools are swept',
          'Swept liquidity often leads to reversal'
        ],
        youtubeId: '3a_nTBJ-r-8',
        youtubeTitle: 'Liquidity Pools Trading'
      },
      {
        id: 3,
        title: 'Trading Liquidity Sweeps',
        duration: '10 min',
        type: 'video',
        overview: `A liquidity sweep occurs when price spikes beyond a level, triggers stops, then reverses. This is the "raid" on liquidity before smart money makes their move.

To trade sweeps: 1) Identify liquidity pools (equal highs/lows, trend lines). 2) Wait for the sweep. 3) Look for reversal confirmation (order block, FVG, divergence). 4) Enter with stop beyond the sweep.

Risk warning: not all sweeps reverse. Sometimes price continues after grabbing liquidity. Always wait for confirmation and manage risk properly.`,
        keyTakeaways: [
          'Sweep = spike beyond level, triggers stops, reverses',
          'Identify pools, wait for sweep, confirm, enter',
          'Stop goes beyond the sweep high/low',
          'Not all sweeps reverse - always confirm'
        ],
        youtubeId: 'gL-vgQPmj4E',
        youtubeTitle: 'Trading Liquidity Sweeps'
      },
      {
        id: 4,
        title: 'Advanced Liquidity Concepts',
        duration: '9 min',
        type: 'text',
        overview: `Liquidity engineering is how smart money creates and sweeps liquidity. They may push price to form equal highs, then return later to sweep them.

Premium and Discount zones: price above equilibrium (50% of range) is premium - look to sell. Below equilibrium is discount - look to buy. Combine with liquidity for high-probability trades.

Optimal Trade Entry (OTE): the zone between 61.8% and 78.6% Fibonacci retracement where liquidity often sits. This is where smart money tends to enter after sweeps.`,
        keyTakeaways: [
          'Smart money engineers liquidity targets',
          'Premium = above 50%, look to sell',
          'Discount = below 50%, look to buy',
          'OTE zone: 61.8-78.6% retracement'
        ]
      },
      {
        id: 5,
        title: 'Liquidity Trading Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your liquidity trading knowledge.',
        keyTakeaways: [],
        quizQuestions: [
          { question: 'What is liquidity in trading?', options: ['Cash on hand', 'Resting orders at price levels', 'Market cap', 'Daily volume'], correctIndex: 1, explanation: 'Liquidity = stops and limits at levels.' },
          { question: 'Where is buy-side liquidity?', options: ['Below support', 'Above resistance', 'At round numbers only', 'Random locations'], correctIndex: 1, explanation: 'Buy-side sits above resistance (buy stops).' },
          { question: 'What happens after a sweep?', options: ['Always continues', 'Often reverses', 'Nothing', 'Market closes'], correctIndex: 1, explanation: 'Swept liquidity often leads to reversal.' },
          { question: 'What is the OTE zone?', options: ['0-23.6% Fib', '61.8-78.6% Fib', '100% Fib', 'Random zone'], correctIndex: 1, explanation: 'OTE = 61.8-78.6% retracement zone.' },
          { question: 'What is a premium zone?', options: ['Below 50% of range', 'Above 50% of range', 'Random area', 'News event area'], correctIndex: 1, explanation: 'Premium = above equilibrium, look to sell.' }
        ]
      }
    ]
  },
  {
    id: 'market-structure',
    title: 'Market Structure Analysis',
    description: 'Advanced price action',
    category: 'advanced',
    lessons: [
      { id: 1, title: 'Market Structure Deep Dive', duration: '10 min', type: 'video', overview: 'Market structure is the backbone of price action trading. It shows who is in control - buyers or sellers - and when that control shifts.\n\nKey elements: Swing highs/lows, Break of Structure (BOS), Change of Character (ChoCH), and structural liquidity.\n\nMastering structure lets you read market intent, not just react to price.', keyTakeaways: ['Structure shows who controls the market', 'Key: swing points, BOS, ChoCH', 'Structure reveals market intent', 'Foundation for all price action'], youtubeId: 'xE1F0R6SBco', youtubeTitle: 'Market Structure Deep Dive' },
      { id: 2, title: 'Multi-Timeframe Structure', duration: '11 min', type: 'video', overview: 'Higher timeframes dictate the overall direction. Lower timeframes provide entries.\n\nDaily/Weekly shows the trend. 4H shows swing moves. 1H/15M provides entry timing.\n\nAlways align lower timeframe entries with higher timeframe direction. Trading against HTF structure has low probability.', keyTakeaways: ['Higher TF = direction, Lower TF = entries', 'Daily/Weekly for trend, 4H for swings', '1H/15M for precise entries', 'Never trade against HTF structure'], youtubeId: 'RY_PLyWvMfY', youtubeTitle: 'Multi-Timeframe Structure' },
      { id: 3, title: 'Internal vs External Structure', duration: '9 min', type: 'video', overview: 'External structure: Major swing points that define the trend. Breaking these is significant.\n\nInternal structure: Minor swings within the trend. These create trading opportunities without changing trend direction.\n\nTrade internal structure breaks for entries, but only in direction of external structure.', keyTakeaways: ['External = major swing points', 'Internal = minor swings within trend', 'External breaks change trends', 'Trade internal in direction of external'], youtubeId: 'YH4JhMNwpwc', youtubeTitle: 'Internal vs External Structure' },
      { id: 4, title: 'Structure-Based Trading', duration: '9 min', type: 'text', overview: 'A complete structure trading approach:\n\n1. Identify HTF trend (daily/weekly external structure)\n2. Wait for LTF pullback to key level\n3. Look for LTF internal BOS in trend direction\n4. Enter after BOS confirmation\n5. Target HTF structure levels\n\nThis aligns all timeframes for high-probability setups.', keyTakeaways: ['Start with HTF trend identification', 'Wait for pullback to key level', 'Confirm with LTF structure break', 'Target HTF structural levels'] },
      { id: 5, title: 'Market Structure Quiz', duration: '5 min', type: 'quiz', overview: 'Test your market structure knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What does BOS stand for?', options: ['Buy or Sell', 'Break of Structure', 'Bearish or Strong', 'Base of Support'], correctIndex: 1, explanation: 'BOS = Break of Structure, confirms trend.' },
        { question: 'Which timeframe dictates direction?', options: ['1 minute', '15 minute', 'Higher timeframes', 'All equal'], correctIndex: 2, explanation: 'Higher TFs show overall direction.' },
        { question: 'What is external structure?', options: ['Minor swings', 'Major swing points defining trend', 'Indicators', 'News events'], correctIndex: 1, explanation: 'External = major structural points.' },
        { question: 'When to enter trades?', options: ['Against HTF structure', 'With HTF structure direction', 'Random timing', 'Only on news'], correctIndex: 1, explanation: 'Always align with HTF structure.' },
        { question: 'What is ChoCH?', options: ['Chart pattern', 'Change of Character', 'Choppy market', 'Channel breakout'], correctIndex: 1, explanation: 'ChoCH signals potential trend change.' }
      ]}
    ]
  },
  {
    id: 'algorithmic',
    title: 'Algorithmic Trading Intro',
    description: 'Automated trading basics',
    category: 'advanced',
    lessons: [
      { id: 1, title: 'What is Algorithmic Trading?', duration: '8 min', type: 'video', overview: 'Algorithmic trading uses computer programs to execute trades based on predefined rules. The computer follows your strategy without emotion.\n\nAdvantages: No emotional decisions, can trade 24/7, faster execution, backtesting capability.\n\nIt\'s not a magic solution - the algorithm is only as good as the strategy programmed into it.', keyTakeaways: ['Computers execute predefined rules', 'No emotional interference', 'Can trade 24/7 automatically', 'Only as good as the strategy'], youtubeId: 'nd7aN8-8vEQ', youtubeTitle: 'Algorithmic Trading Intro' },
      { id: 2, title: 'Types of Trading Algorithms', duration: '10 min', type: 'video', overview: 'Common algo types:\n\nTrend Following: Buy when price is above MA, sell below.\nMean Reversion: Buy oversold, sell overbought.\nArbitrage: Exploit price differences across markets.\nHigh-Frequency: Many small trades exploiting tiny edges.\n\nMost retail algos focus on trend following or mean reversion strategies.', keyTakeaways: ['Trend following = trade with momentum', 'Mean reversion = trade extremes', 'Arbitrage exploits price differences', 'HFT requires infrastructure'], youtubeId: 'EaGc1KHLFwQ', youtubeTitle: 'Types of Trading Algos' },
      { id: 3, title: 'Building Your First Algorithm', duration: '12 min', type: 'video', overview: 'Start simple. A basic algo might be:\n\nBuy: When 20 EMA crosses above 50 EMA\nSell: When 20 EMA crosses below 50 EMA\nRisk: 1% per trade\n\nPlatforms like TradingView (Pine Script), MT4/MT5 (MQL), or Python let you code and test strategies.\n\nAlways backtest extensively before live trading.', keyTakeaways: ['Start with simple rules', 'Use platforms: TradingView, MT4, Python', 'Include risk management in code', 'Backtest before going live'], youtubeId: 'GwPPMnvDp20', youtubeTitle: 'Building First Algorithm' },
      { id: 4, title: 'Risks of Automated Trading', duration: '8 min', type: 'text', overview: 'Algorithmic trading has unique risks:\n\nOver-optimization: Algorithm works perfectly on historical data but fails live (curve fitting).\nTechnical failures: Internet outage, broker disconnect, software bugs can cause unexpected losses.\nMarket changes: Strategy that worked may stop working as market conditions change.\n\nAlways monitor your algo and have kill switches for emergencies.', keyTakeaways: ['Over-optimization = curve fitting risk', 'Technical failures can cause losses', 'Markets change, strategies can fail', 'Always monitor and have kill switches'] },
      { id: 5, title: 'Algorithmic Trading Quiz', duration: '5 min', type: 'quiz', overview: 'Test your algorithmic trading knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'Main advantage of algo trading?', options: ['Guaranteed profits', 'No emotional decisions', 'No risk', 'Free money'], correctIndex: 1, explanation: 'Algos eliminate emotional trading decisions.' },
        { question: 'What is mean reversion?', options: ['Following trends', 'Trading price extremes back to average', 'News trading', 'Random entries'], correctIndex: 1, explanation: 'Mean reversion trades oversold/overbought conditions.' },
        { question: 'What is curve fitting?', options: ['Drawing curves', 'Over-optimizing to past data', 'Chart pattern', 'Trend lines'], correctIndex: 1, explanation: 'Curve fitting = strategy only works on historical data.' },
        { question: 'Why monitor running algos?', options: ['Not necessary', 'Technical failures and market changes', 'Fun to watch', 'Broker requirement'], correctIndex: 1, explanation: 'Algos can fail due to technical issues or market changes.' },
        { question: 'Best practice before live algo trading?', options: ['Trade immediately', 'Extensive backtesting', 'Guess and check', 'Skip testing'], correctIndex: 1, explanation: 'Always backtest extensively before live trading.' }
      ]}
    ]
  },
  {
    id: 'portfolio',
    title: 'Portfolio Management',
    description: 'Diversification strategies',
    category: 'advanced',
    lessons: [
      { id: 1, title: 'Portfolio Theory Basics', duration: '9 min', type: 'video', overview: 'Portfolio management is about balancing risk and return across multiple positions. Don\'t put all eggs in one basket.\n\nDiversification reduces overall risk. When one asset loses, others may gain, smoothing your equity curve.\n\nKey concepts: correlation, asset allocation, risk-adjusted returns (Sharpe ratio).', keyTakeaways: ['Don\'t put all eggs in one basket', 'Diversification reduces overall risk', 'Correlation affects portfolio risk', 'Sharpe ratio measures risk-adjusted return'], youtubeId: 'XLF8cFkL_xI', youtubeTitle: 'Portfolio Theory Basics' },
      { id: 2, title: 'Asset Allocation', duration: '10 min', type: 'video', overview: 'Asset allocation divides capital across different asset classes: currencies, stocks, commodities, bonds, crypto.\n\nAggressive allocation: More in volatile assets for higher potential returns.\nConservative allocation: More in stable assets for capital preservation.\n\nYour allocation should match your risk tolerance and goals.', keyTakeaways: ['Divide capital across asset classes', 'Aggressive = more volatile assets', 'Conservative = more stable assets', 'Match allocation to risk tolerance'], youtubeId: 'DFZKq_2i8AI', youtubeTitle: 'Asset Allocation Explained' },
      { id: 3, title: 'Position Correlation', duration: '9 min', type: 'video', overview: 'Holding correlated positions multiplies risk. If EUR/USD and GBP/USD both move against USD, losing on both hurts double.\n\nSeek low or negative correlation for diversification. Gold often moves inverse to USD. Bonds may move inverse to stocks.\n\nRegularly review your portfolio correlation and rebalance as needed.', keyTakeaways: ['Correlated positions = multiplied risk', 'Seek low/negative correlation', 'Gold often inverse to USD', 'Regularly review and rebalance'], youtubeId: 'jGU9eHi-kv8', youtubeTitle: 'Portfolio Correlation' },
      { id: 4, title: 'Risk Budgeting', duration: '8 min', type: 'text', overview: 'Risk budgeting allocates total portfolio risk across positions.\n\nExample: 5% total portfolio risk budget. Three positions get: 2%, 2%, 1%.\n\nHigher conviction trades can get larger risk allocation. But no single trade should dominate your risk.\n\nThis prevents catastrophic losses from any single position.', keyTakeaways: ['Allocate total risk across positions', 'Higher conviction = larger allocation', 'No single trade dominates risk', 'Prevents catastrophic single losses'] },
      { id: 5, title: 'Portfolio Management Quiz', duration: '5 min', type: 'quiz', overview: 'Test your portfolio management knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What is diversification?', options: ['Focusing on one asset', 'Spreading risk across multiple assets', 'Maximum leverage', 'Day trading only'], correctIndex: 1, explanation: 'Diversification spreads risk across assets.' },
        { question: 'What does Sharpe ratio measure?', options: ['Total return only', 'Risk-adjusted return', 'Market cap', 'Trading volume'], correctIndex: 1, explanation: 'Sharpe ratio = return relative to risk taken.' },
        { question: 'How do correlated positions affect risk?', options: ['Reduce risk', 'Multiply risk', 'No effect', 'Guarantee profits'], correctIndex: 1, explanation: 'Correlation multiplies portfolio risk.' },
        { question: 'What is risk budgeting?', options: ['Ignoring risk', 'Allocating risk across positions', 'Maximum risk', 'Zero risk'], correctIndex: 1, explanation: 'Risk budgeting divides total risk across trades.' },
        { question: 'Conservative allocation means:', options: ['More volatile assets', 'More stable assets', 'No allocation', 'All in crypto'], correctIndex: 1, explanation: 'Conservative = more stable, lower-risk assets.' }
      ]}
    ]
  },
  {
    id: 'options',
    title: 'Options Trading',
    description: 'Derivatives and hedging',
    category: 'advanced',
    lessons: [
      { id: 1, title: 'Options Fundamentals', duration: '10 min', type: 'video', overview: 'Options are contracts giving the right (not obligation) to buy or sell an asset at a specific price by a specific date.\n\nCall option: Right to BUY at strike price.\nPut option: Right to SELL at strike price.\n\nYou pay a premium for this right. Options add complexity but also flexibility.', keyTakeaways: ['Right, not obligation, to buy/sell', 'Call = right to buy, Put = right to sell', 'Pay premium for the option', 'Adds flexibility to trading'], youtubeId: 'VJgHkAqohbU', youtubeTitle: 'Options Fundamentals' },
      { id: 2, title: 'Options Greeks', duration: '11 min', type: 'video', overview: 'Greeks measure option sensitivity:\n\nDelta: How much option price moves with underlying.\nTheta: Time decay - options lose value over time.\nVega: Sensitivity to volatility changes.\nGamma: Rate of delta change.\n\nUnderstanding Greeks helps manage option positions.', keyTakeaways: ['Delta = price sensitivity', 'Theta = time decay', 'Vega = volatility sensitivity', 'Greeks help manage positions'], youtubeId: 'kCJcEOYuuII', youtubeTitle: 'Options Greeks Explained' },
      { id: 3, title: 'Basic Options Strategies', duration: '10 min', type: 'video', overview: 'Simple strategies for beginners:\n\nLong Call: Buy call when expecting price increase.\nLong Put: Buy put when expecting price decrease.\nCovered Call: Own asset, sell call for income.\nProtective Put: Own asset, buy put for protection.\n\nStart with these before advanced strategies.', keyTakeaways: ['Long call for bullish, put for bearish', 'Covered call generates income', 'Protective put = insurance', 'Start simple before complex'], youtubeId: '7PM4rNDr4oI', youtubeTitle: 'Basic Options Strategies' },
      { id: 4, title: 'Hedging with Options', duration: '9 min', type: 'text', overview: 'Options are powerful hedging tools. You can protect positions against adverse moves.\n\nExample: Long EUR/USD spot. Buy EUR/USD put option as insurance. If price drops, put gains offset spot losses.\n\nThe cost is the option premium - it\'s like paying an insurance premium for protection.\n\nHedging reduces profit potential but also limits losses.', keyTakeaways: ['Options can protect positions', 'Puts hedge long positions', 'Premium is the cost of protection', 'Hedging limits both profits and losses'] },
      { id: 5, title: 'Options Trading Quiz', duration: '5 min', type: 'quiz', overview: 'Test your options knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'What is a call option?', options: ['Obligation to buy', 'Right to buy', 'Right to sell', 'Obligation to sell'], correctIndex: 1, explanation: 'Call = right (not obligation) to buy.' },
        { question: 'What is Theta?', options: ['Price sensitivity', 'Time decay', 'Volatility', 'Interest rate'], correctIndex: 1, explanation: 'Theta measures time decay of options.' },
        { question: 'What is a covered call?', options: ['Buying call', 'Owning asset and selling call', 'Buying put', 'Selling naked call'], correctIndex: 1, explanation: 'Covered call = own asset + sell call for income.' },
        { question: 'How do options hedge?', options: ['Eliminate all risk', 'Offset losses with option gains', 'Increase leverage', 'Free insurance'], correctIndex: 1, explanation: 'Options gains can offset underlying losses.' },
        { question: 'What is the cost of hedging?', options: ['Free', 'Option premium', 'Broker fee only', 'No cost'], correctIndex: 1, explanation: 'The premium paid is the cost of protection.' }
      ]}
    ]
  },
  {
    id: 'intermarket',
    title: 'Intermarket Analysis',
    description: 'Cross-market correlations',
    category: 'advanced',
    lessons: [
      { id: 1, title: 'Intermarket Relationships', duration: '9 min', type: 'video', overview: 'Markets don\'t move in isolation. Stocks, bonds, commodities, and currencies all influence each other.\n\nClassic relationships: Dollar up = Gold down. Bonds up = Stocks down (sometimes). Oil up = CAD up.\n\nUnderstanding these connections provides broader market context for your trades.', keyTakeaways: ['Markets influence each other', 'Dollar and gold often inverse', 'Bond/stock relationship varies', 'Oil affects commodity currencies'], youtubeId: 'sSMT9GPHFQ0', youtubeTitle: 'Intermarket Analysis' },
      { id: 2, title: 'Currency & Commodity Links', duration: '10 min', type: 'video', overview: 'Commodity currencies are tied to their exports:\n\nAUD/USD correlates with Gold (Australia exports gold).\nUSD/CAD correlates inverse with Oil (Canada exports oil).\nNZD correlates with dairy prices.\n\nWatch commodity prices for clues about commodity currency direction.', keyTakeaways: ['AUD correlates with Gold', 'CAD correlates with Oil', 'NZD tied to dairy prices', 'Commodities guide currency direction'], youtubeId: 'Q0c-TqF-u5g', youtubeTitle: 'Currency Commodity Links' },
      { id: 3, title: 'Risk-On vs Risk-Off', duration: '9 min', type: 'video', overview: 'Market sentiment shifts between risk-on (bullish) and risk-off (bearish) modes.\n\nRisk-On: Stocks up, high-yield currencies up (AUD, NZD), safe havens down.\nRisk-Off: Stocks down, safe havens up (USD, JPY, CHF), high-yield currencies down.\n\nRecognizing the risk environment helps you pick the right trades.', keyTakeaways: ['Risk-on = bullish sentiment', 'Risk-off = bearish, flight to safety', 'Safe havens: USD, JPY, CHF', 'High-yield: AUD, NZD perform in risk-on'], youtubeId: '_NrhQCbFqcU', youtubeTitle: 'Risk On vs Risk Off' },
      { id: 4, title: 'Using Intermarket Analysis', duration: '8 min', type: 'text', overview: 'Practical application:\n\n1. Check overall sentiment (stocks, VIX)\n2. Look at correlated markets for confirmation\n3. Identify divergences between related markets\n4. Use as additional filter for trade decisions\n\nIntermarket analysis adds context but shouldn\'t replace your primary analysis.', keyTakeaways: ['Check overall market sentiment', 'Use correlations for confirmation', 'Identify intermarket divergences', 'Additional filter, not replacement'] },
      { id: 5, title: 'Intermarket Analysis Quiz', duration: '5 min', type: 'quiz', overview: 'Test your intermarket knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'USD and Gold typically move:', options: ['Same direction', 'Opposite directions', 'No relationship', 'Random'], correctIndex: 1, explanation: 'Dollar and gold often move inverse.' },
        { question: 'Which currency correlates with Oil?', options: ['EUR', 'JPY', 'CAD', 'GBP'], correctIndex: 2, explanation: 'CAD correlates with oil prices.' },
        { question: 'What happens in risk-off environment?', options: ['Stocks up', 'Safe havens up', 'High-yield up', 'Everything up'], correctIndex: 1, explanation: 'Risk-off = flight to safe havens.' },
        { question: 'Safe haven currencies include:', options: ['AUD, NZD', 'USD, JPY, CHF', 'EUR, GBP', 'BRL, MXN'], correctIndex: 1, explanation: 'USD, JPY, CHF are classic safe havens.' },
        { question: 'How to use intermarket analysis?', options: ['Replace primary analysis', 'Additional context and filter', 'Trade only correlations', 'Ignore it'], correctIndex: 1, explanation: 'Intermarket adds context to primary analysis.' }
      ]}
    ]
  },
  {
    id: 'pro-psychology',
    title: 'Pro Trading Psychology',
    description: 'Elite mental performance',
    category: 'advanced',
    lessons: [
      { id: 1, title: 'Elite Trader Mindset', duration: '10 min', type: 'video', overview: 'Professional traders think differently. They see losses as business expenses, not failures. They focus on process, not outcomes.\n\nKey shifts: From hoping to planning. From emotional to systematic. From outcome-focused to process-focused.\n\nThis mindset takes time to develop but separates consistent winners from the rest.', keyTakeaways: ['Losses are business expenses', 'Process over outcomes', 'Systematic over emotional', 'Mindset separates winners'], youtubeId: 'S4qkn_CFVK4', youtubeTitle: 'Elite Trader Mindset' },
      { id: 2, title: 'Performance Under Pressure', duration: '9 min', type: 'video', overview: 'Pressure causes mistakes. Large positions, drawdowns, and winning streaks all create pressure.\n\nTechniques: Pre-trade routines, breathing exercises, process checklists, position size limits.\n\nThe goal is to trade the same way whether up or down, large or small. Consistency is everything.', keyTakeaways: ['Pressure causes mistakes', 'Use pre-trade routines', 'Breathing exercises help calm', 'Trade consistently regardless of P&L'], youtubeId: 'lJ1egMKgHOs', youtubeTitle: 'Trading Under Pressure' },
      { id: 3, title: 'Developing Discipline', duration: '10 min', type: 'video', overview: 'Discipline is a skill that can be developed. It\'s not about willpower - it\'s about systems.\n\nCreate checklists for every trade. Remove temptation (close other tabs, limit screen time). Start with small stakes to build habits.\n\nTrack discipline metrics: Did you follow the plan? This matters more than P&L initially.', keyTakeaways: ['Discipline is a buildable skill', 'Use checklists and systems', 'Remove temptation sources', 'Track discipline, not just P&L'], youtubeId: 'YWgOJLCGEL4', youtubeTitle: 'Developing Discipline' },
      { id: 4, title: 'Continuous Improvement', duration: '9 min', type: 'text', overview: 'Elite traders never stop improving. They review every trade, identify patterns in their mistakes, and work on weaknesses.\n\nKeep a detailed trading journal. Weekly/monthly reviews identify what\'s working and what\'s not.\n\nTreat trading as a craft. Masters spend years refining their skill. Embrace the journey.', keyTakeaways: ['Elite traders review constantly', 'Detailed trading journal is essential', 'Weekly/monthly reviews', 'Trading is a craft to master'] },
      { id: 5, title: 'Pro Psychology Quiz', duration: '5 min', type: 'quiz', overview: 'Test your pro psychology knowledge.', keyTakeaways: [], quizQuestions: [
        { question: 'How do pros view losses?', options: ['Personal failures', 'Business expenses', 'Should never happen', 'Broker fault'], correctIndex: 1, explanation: 'Losses are normal business expenses.' },
        { question: 'What should you focus on?', options: ['Daily P&L', 'Winning trades only', 'Process and execution', 'Predictions'], correctIndex: 2, explanation: 'Process focus beats outcome focus.' },
        { question: 'How to build discipline?', options: ['Willpower alone', 'Systems and checklists', 'Trade more', 'Larger positions'], correctIndex: 1, explanation: 'Systems and structure build discipline.' },
        { question: 'Why keep a trading journal?', options: ['Broker requirement', 'Identify patterns and improve', 'Show off trades', 'Tax purposes only'], correctIndex: 1, explanation: 'Journals help identify improvement areas.' },
        { question: 'Elite traders believe trading is:', options: ['Get rich quick', 'A craft requiring years to master', 'Pure luck', 'Easy with right indicator'], correctIndex: 1, explanation: 'Trading is a skill developed over years.' }
      ]}
    ]
  }
];

// ==============================================================================
// COURSE PREVIEWS (for locked display)
// ==============================================================================

export const INTERMEDIATE_COURSE_PREVIEWS = INTERMEDIATE_COURSES.map(c => ({
  id: c.id,
  title: c.title,
  preview: c.description
}));

export const ADVANCED_COURSE_PREVIEWS = ADVANCED_COURSES.map(c => ({
  id: c.id,
  title: c.title,
  preview: c.description
}));

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

export function getCourseContent(courseId: string): CourseContent | null {
  // Search all course arrays
  const allCourses = [...BEGINNER_COURSES, ...INTERMEDIATE_COURSES, ...ADVANCED_COURSES];
  return allCourses.find(c => c.id === courseId) || null;
}

export function getLessonContent(courseId: string, lessonId: number): LessonContent | null {
  const course = getCourseContent(courseId);
  if (!course) return null;
  return course.lessons.find(l => l.id === lessonId) || null;
}

export function getCourseCategory(courseId: string): 'beginner' | 'intermediate' | 'advanced' | null {
  const course = getCourseContent(courseId);
  return course?.category || null;
}

// ==============================================================================
// SWIFT FX ACADEMY - LESSON CONTENT DATA v2.0
// ==============================================================================
// 
// STRUCTURE:
// - Beginner courses: FULL content (overview, key takeaways, embedded YouTube video, quizzes)
// - Intermediate/Advanced: PREVIEW ONLY (title + short description, locked)
// 
// VIDEO RULES:
// - All videos are SHORT (3-8 minutes) and topic-relevant
// - youtubeId is the video ID for embedding (not full URL)
// - Videos are beginner-friendly explainers
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
  youtubeId?: string; // YouTube video ID for embedding
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
// BEGINNER COURSES - FULL CONTENT
// ==============================================================================

export const BEGINNER_COURSES: CourseContent[] = [
  // ============================================================================
  // COURSE 1: INTRODUCTION TO TRADING
  // ============================================================================
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
          {
            question: 'What is the primary goal of trading?',
            options: ['To hold assets forever', 'To profit from price movements', 'To collect dividends only', 'To avoid all risk'],
            correctIndex: 1,
            explanation: 'Trading aims to profit by buying assets at one price and selling at another, capitalizing on price movements.'
          },
          {
            question: 'Which is the largest financial market in the world?',
            options: ['Stock Market', 'Forex Market', 'Cryptocurrency Market', 'Commodities Market'],
            correctIndex: 1,
            explanation: 'The Forex (Foreign Exchange) market is the largest with over $6 trillion traded daily.'
          },
          {
            question: 'What happens to price when there are more buyers than sellers?',
            options: ['Price goes down', 'Price stays the same', 'Price goes up', 'Market closes'],
            correctIndex: 2,
            explanation: 'When demand (buyers) exceeds supply (sellers), prices rise due to competition among buyers.'
          },
          {
            question: 'Who are retail traders?',
            options: ['Banks and hedge funds', 'Individual traders using their own money', 'Central banks', 'Market makers only'],
            correctIndex: 1,
            explanation: 'Retail traders are individuals who trade with their own personal capital, unlike institutional traders.'
          },
          {
            question: 'What role do market makers play?',
            options: ['They set interest rates', 'They provide liquidity by always being ready to buy/sell', 'They only trade stocks', 'They control currency values'],
            correctIndex: 1,
            explanation: 'Market makers ensure there\'s always someone to trade with, providing liquidity to the markets.'
          }
        ]
      }
    ]
  },

  // ============================================================================
  // COURSE 2: CHART READING BASICS
  // ============================================================================
  {
    id: 'chart-basics',
    title: 'Chart Reading Basics',
    description: 'Understanding candlesticks and patterns',
    category: 'beginner',
    lessons: [
      {
        id: 1,
        title: 'Introduction to Charts',
        duration: '6 min',
        type: 'video',
        overview: `Charts are visual representations of price movement over time. They are the primary tool traders use to analyze markets.

There are three main types: Line charts (simplest), Bar charts (showing open, high, low, close), and Candlestick charts (most popular).

Learning to read charts is like learning a new language - once you understand it, you'll see what the market is telling you.`,
        keyTakeaways: [
          'Charts visualize price movement over time',
          'Three main types: Line, Bar, and Candlestick',
          'Candlestick charts are most popular among traders',
          'Chart reading is essential for technical analysis'
        ],
        youtubeId: 'hU9BkqD3F6U',
        youtubeTitle: 'Introduction to Trading Charts'
      },
      {
        id: 2,
        title: 'Candlestick Anatomy',
        duration: '7 min',
        type: 'video',
        overview: `A candlestick shows four prices: Open, High, Low, and Close for a time period.

The body shows the range between open and close. Green means bullish (price went up), red means bearish (price went down).

The thin lines (wicks) show the highest and lowest prices reached. The size and shape tell a story about market sentiment.`,
        keyTakeaways: [
          'Each candle shows Open, High, Low, and Close (OHLC)',
          'Green/white = bullish (price went up)',
          'Red/black = bearish (price went down)',
          'Wicks show the extreme prices reached'
        ],
        youtubeId: 'C3KRwfj9F8Q',
        youtubeTitle: 'Candlestick Charts Explained'
      },
      {
        id: 3,
        title: 'Common Candlestick Patterns',
        duration: '8 min',
        type: 'video',
        overview: `Candlestick patterns can signal potential market moves. Key patterns include:

Doji: A candle with almost no body, showing indecision.
Hammer: Small body with long lower wick, can signal reversal.
Engulfing: When a candle completely covers the previous one.

No pattern works 100% of the time - always use them with other analysis.`,
        keyTakeaways: [
          'Doji candles show market indecision',
          'Hammer patterns can signal trend reversals',
          'Engulfing patterns show strong momentum shifts',
          'Always confirm patterns with other analysis'
        ],
        youtubeId: 'q8MNYg-Y1G8',
        youtubeTitle: 'Top Candlestick Patterns'
      },
      {
        id: 4,
        title: 'Timeframes Explained',
        duration: '8 min',
        type: 'text',
        overview: `Timeframes determine how much data each candlestick represents.

Scalpers use 1-5 minute charts for quick trades. Day Traders use 15-minute to 1-hour charts. Swing Traders prefer 4-hour to daily charts for multi-day trades.

A good practice is multi-timeframe analysis: using higher timeframes for trend direction and lower timeframes for entry timing.`,
        keyTakeaways: [
          'Scalpers: 1-5 minute charts for quick trades',
          'Day traders: 15min-1hour charts, same-day trades',
          'Swing traders: 4hour-daily charts, multi-day trades',
          'Multi-timeframe analysis combines different views'
        ]
      },
      {
        id: 5,
        title: 'Reading Price Action',
        duration: '6 min',
        type: 'video',
        overview: `Price action is the movement of price over time without relying on indicators.

Look for trends: Higher highs and higher lows = uptrend. Lower highs and lower lows = downtrend.

Identify key levels where price has reversed before. Watch for momentum - strong candles show conviction, weak candles show indecision.`,
        keyTakeaways: [
          'Price action is pure price movement analysis',
          'Uptrend = higher highs and higher lows',
          'Downtrend = lower highs and lower lows',
          'Key levels act as support and resistance'
        ],
        youtubeId: 'gvAJ92Zt9fY',
        youtubeTitle: 'Price Action Basics'
      },
      {
        id: 6,
        title: 'Chart Patterns Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your understanding of chart reading fundamentals.',
        keyTakeaways: [],
        quizQuestions: [
          {
            question: 'What does a green candlestick indicate?',
            options: ['Price went down', 'Price went up (bullish)', 'No price change', 'Market is closed'],
            correctIndex: 1,
            explanation: 'A green (or white) candlestick means the closing price was higher than the opening price - bullish movement.'
          },
          {
            question: 'What does OHLC stand for?',
            options: ['Only High Low Close', 'Open High Low Close', 'Open Hour Low Count', 'Option Hedge Long Call'],
            correctIndex: 1,
            explanation: 'OHLC stands for Open, High, Low, Close - the four data points in each candlestick.'
          },
          {
            question: 'What does a Doji candlestick indicate?',
            options: ['Strong buying pressure', 'Strong selling pressure', 'Market indecision', 'Market closure'],
            correctIndex: 2,
            explanation: 'A Doji has nearly equal open and close prices, indicating indecision between buyers and sellers.'
          },
          {
            question: 'What timeframe would a swing trader typically use?',
            options: ['1-minute charts', '4-hour to daily charts', '1-second charts', 'Yearly charts only'],
            correctIndex: 1,
            explanation: 'Swing traders hold positions for days to weeks, so they use 4-hour to daily charts for analysis.'
          },
          {
            question: 'An uptrend is characterized by:',
            options: ['Lower highs and lower lows', 'Higher highs and higher lows', 'Flat price movement', 'Random price spikes'],
            correctIndex: 1,
            explanation: 'An uptrend shows consistently higher highs and higher lows, indicating sustained buying pressure.'
          }
        ]
      }
    ]
  },

  // ============================================================================
  // COURSE 3: RISK MANAGEMENT 101
  // ============================================================================
  {
    id: 'risk-management',
    title: 'Risk Management 101',
    description: 'Protect your capital effectively',
    category: 'beginner',
    lessons: [
      {
        id: 1,
        title: 'Why Risk Management Matters',
        duration: '5 min',
        type: 'video',
        overview: `Risk management is the most important skill in trading. Even professional traders lose on many trades - what separates winners from losers is how they manage losses.

A common beginner mistake is risking too much per trade. One bad trade can wipe out weeks of gains.

Professional traders typically risk only 1-2% per trade. This ensures survival through losing streaks.`,
        keyTakeaways: [
          'Risk management is more important than strategy',
          'Even professionals lose on many trades',
          'Never risk more than 1-2% per trade',
          'Protecting capital keeps you in the game'
        ],
        youtubeId: 'wxZ26IOv1-8',
        youtubeTitle: 'Risk Management Basics'
      },
      {
        id: 2,
        title: 'Position Sizing',
        duration: '6 min',
        type: 'video',
        overview: `Position sizing determines how much you invest in each trade.

The formula: Decide your risk amount (e.g., 1% of account), calculate stop loss distance, then adjust position size so that if stopped out, you only lose your predetermined amount.

This keeps your dollar risk consistent regardless of the trade setup.`,
        keyTakeaways: [
          'Position size controls your dollar risk per trade',
          'Calculate based on your stop loss distance',
          'Keep risk consistent across all trades (1-2%)',
          'Larger stops = smaller position sizes'
        ],
        youtubeId: 'dLvAq5YlPCo',
        youtubeTitle: 'Position Sizing Explained'
      },
      {
        id: 3,
        title: 'Stop Losses and Take Profits',
        duration: '7 min',
        type: 'video',
        overview: `A stop loss automatically closes your trade if price moves against you. Never trade without one.

A take profit closes your trade when you reach your target.

The Risk-Reward Ratio compares potential profit to risk. Aim for 1:2 or better - risk $1 to make $2. With 1:2 ratio, you only need 33% win rate to break even!`,
        keyTakeaways: [
          'Always use a stop loss - no exceptions',
          'Take profits lock in gains automatically',
          'Aim for 1:2 or better risk-reward ratio',
          'With 1:2 ratio, 33% win rate = break even'
        ],
        youtubeId: 'FqF9Q9p1Yvg',
        youtubeTitle: 'Stop Loss and Take Profit'
      },
      {
        id: 4,
        title: 'The 1% Rule',
        duration: '7 min',
        type: 'text',
        overview: `The 1% Rule: Never risk more than 1% of your account on a single trade.

With a $10,000 account and 1% risk, your maximum loss per trade is $100.

The math is powerful:
- 10 losses at 1% = ~10% drawdown
- 10 losses at 5% = ~40% drawdown
- 10 losses at 10% = ~65% drawdown

When you lose 50% of your account, you need 100% gain just to recover. Protect your capital first.`,
        keyTakeaways: [
          'Risk maximum 1% of account per trade',
          '$10,000 account = $100 max risk per trade',
          '10 losing trades at 1% = only ~10% drawdown',
          'Capital preservation is the priority'
        ]
      },
      {
        id: 5,
        title: 'Risk Management Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your understanding of risk management principles.',
        keyTakeaways: [],
        quizQuestions: [
          {
            question: 'What is the recommended maximum risk per trade?',
            options: ['5-10%', '1-2%', '25%', '50%'],
            correctIndex: 1,
            explanation: 'Professional traders recommend risking only 1-2% per trade to survive losing streaks and protect capital.'
          },
          {
            question: 'What is a stop loss?',
            options: ['A profit target', 'An order that closes your trade at a predetermined loss', 'A trading indicator', 'A type of chart'],
            correctIndex: 1,
            explanation: 'A stop loss is an automatic order that closes your position when price reaches a level where you want to limit your loss.'
          },
          {
            question: 'With a 1:2 risk-reward ratio, what win rate is needed to break even?',
            options: ['50%', '75%', '33%', '90%'],
            correctIndex: 2,
            explanation: 'With 1:2 ratio, winning 33% of trades means: 1 win = +$2, 2 losses = -$2, so you break even.'
          },
          {
            question: 'If your account is $5,000 and you follow the 1% rule, what is your max risk per trade?',
            options: ['$500', '$50', '$100', '$250'],
            correctIndex: 1,
            explanation: '1% of $5,000 = $50 maximum risk per trade.'
          },
          {
            question: 'Why is position sizing important?',
            options: ['It makes you rich fast', 'It keeps your dollar risk consistent', 'It eliminates all losses', 'It guarantees profits'],
            correctIndex: 1,
            explanation: 'Proper position sizing ensures you risk the same dollar amount on every trade, regardless of stop loss distance.'
          }
        ]
      }
    ]
  },

  // ============================================================================
  // COURSE 4: TRADING PSYCHOLOGY
  // ============================================================================
  {
    id: 'trading-psychology',
    title: 'Trading Psychology',
    description: 'Master your emotions',
    category: 'beginner',
    lessons: [
      {
        id: 1,
        title: 'The Trader\'s Mindset',
        duration: '6 min',
        type: 'video',
        overview: `Trading is 80% psychology and 20% strategy. Most traders fail because they can't control emotions, not because of bad strategies.

The market doesn't care about your feelings. Successful traders think in probabilities - they know any single trade can lose, but their edge plays out over time.

Developing the right mindset means becoming comfortable with uncertainty and accepting losses as part of the business.`,
        keyTakeaways: [
          'Trading is 80% psychology, 20% strategy',
          'The market doesn\'t care about your emotions',
          'Think in probabilities, not certainties',
          'Accept that losses are part of trading'
        ],
        youtubeId: '8yVuew50N8g',
        youtubeTitle: 'Trading Mindset Basics'
      },
      {
        id: 2,
        title: 'Fear and Greed',
        duration: '5 min',
        type: 'video',
        overview: `Fear and greed are the two dominant trading emotions.

Fear causes: Early exits from winners, avoiding valid setups, moving stop losses, and freezing during key moments.

Greed causes: Holding too long, overtrading, risking too much, and chasing missed entries.

The solution is following your plan mechanically and trusting your edge over time.`,
        keyTakeaways: [
          'Fear and greed are the main trading emotions',
          'Fear makes you exit winners too early',
          'Greed makes you risk too much and overtrade',
          'Focus on process, not money, to stay balanced'
        ],
        youtubeId: 'Eb1_BIZXmkA',
        youtubeTitle: 'Fear and Greed in Trading'
      },
      {
        id: 3,
        title: 'Dealing with Losses',
        duration: '8 min',
        type: 'text',
        overview: `Every trader experiences losses. How you handle them determines success.

Accept that losses are normal - even the best traders lose 40-50% of trades. A losing trade doesn't mean you did something wrong.

Never revenge trade - the temptation to "make it back" usually leads to more losses.

Take breaks after losses. Keep a journal to track emotional patterns and improve over time.`,
        keyTakeaways: [
          'Losses are normal - pros lose 40-50% of trades',
          'Never revenge trade after a loss',
          'Take breaks to reset emotionally',
          'Keep a journal to track patterns'
        ]
      },
      {
        id: 4,
        title: 'Building Discipline',
        duration: '6 min',
        type: 'video',
        overview: `Discipline bridges your trading plan and results. Without it, even the best strategy is useless.

Create a detailed plan covering: what setups to trade, when to trade, how much to risk, and when to stop.

Commit to following it without exceptions. The plan exists because you made it with a clear head.

Start small - it's easier to follow rules when stakes are low. Treat trading like a business.`,
        keyTakeaways: [
          'Discipline connects your plan to results',
          'Create a detailed, written trading plan',
          'Follow the plan without exceptions',
          'Start with small sizes to build habits'
        ],
        youtubeId: 'YWgOJLCGEL4',
        youtubeTitle: 'Building Trading Discipline'
      },
      {
        id: 5,
        title: 'Psychology Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your understanding of trading psychology.',
        keyTakeaways: [],
        quizQuestions: [
          {
            question: 'What percentage of trading success is attributed to psychology?',
            options: ['20%', '50%', '80%', '10%'],
            correctIndex: 2,
            explanation: 'Trading is commonly described as 80% psychology and 20% strategy - emotional control is crucial.'
          },
          {
            question: 'What does fear typically cause traders to do?',
            options: ['Hold winning trades longer', 'Exit winning trades too early', 'Take more risks', 'Trade more frequently'],
            correctIndex: 1,
            explanation: 'Fear often causes traders to close profitable positions prematurely, missing larger gains.'
          },
          {
            question: 'What is revenge trading?',
            options: ['Trading against someone else', 'Taking more trades after a loss to recover quickly', 'A profitable strategy', 'Trading during revenge hours'],
            correctIndex: 1,
            explanation: 'Revenge trading is emotionally trying to recover losses immediately, which usually leads to more losses.'
          },
          {
            question: 'How should you respond to a losing trade?',
            options: ['Immediately take another trade', 'Double your position size', 'Take a break and review objectively', 'Quit trading forever'],
            correctIndex: 2,
            explanation: 'Taking a break allows emotional reset and objective review of whether you followed your plan.'
          },
          {
            question: 'Why is a trading plan important?',
            options: ['It guarantees profits', 'It provides rules to follow when emotions run high', 'It eliminates all losses', 'It is required by law'],
            correctIndex: 1,
            explanation: 'A trading plan provides structure and rules made with a clear mind, helping you avoid emotional decisions.'
          }
        ]
      }
    ]
  },

  // ============================================================================
  // COURSE 5: FOREX FUNDAMENTALS
  // ============================================================================
  {
    id: 'forex-basics',
    title: 'Forex Fundamentals',
    description: 'Currency pairs and market structure',
    category: 'beginner',
    lessons: [
      {
        id: 1,
        title: 'What is Forex?',
        duration: '5 min',
        type: 'video',
        overview: `Forex (Foreign Exchange) is the global marketplace for exchanging currencies. It's the largest and most liquid financial market.

Over $6 trillion is traded daily - more than all stock markets combined. This liquidity means easy entry and exit.

Forex operates 24 hours, 5 days a week, following global time zones. Currencies are always traded in pairs - when you "buy EUR/USD," you're buying Euros and selling US Dollars.`,
        keyTakeaways: [
          'Forex is the world\'s largest market at $6+ trillion daily',
          'It operates 24 hours, 5 days a week',
          'Currencies are always traded in pairs',
          'High liquidity allows easy entry and exit'
        ],
        youtubeId: 'aJ8FVhNkqws',
        youtubeTitle: 'What is Forex Trading?'
      },
      {
        id: 2,
        title: 'Currency Pairs Explained',
        duration: '6 min',
        type: 'video',
        overview: `Currency pairs are divided into Majors, Minors, and Exotics.

Major pairs include USD and are most traded: EUR/USD, GBP/USD, USD/JPY. They have tightest spreads.

Minor pairs (crosses) don't include USD: EUR/GBP, EUR/JPY.

Exotic pairs include emerging market currencies with wider spreads.

For beginners, stick to major pairs - they're most predictable and cheapest to trade.`,
        keyTakeaways: [
          'Majors include USD and are most liquid',
          'EUR/USD is the most traded pair globally',
          'Minor pairs (crosses) don\'t include USD',
          'Beginners should focus on major pairs'
        ],
        youtubeId: '4g7c4E8vU2c',
        youtubeTitle: 'Currency Pairs Explained'
      },
      {
        id: 3,
        title: 'Pips, Lots, and Leverage',
        duration: '7 min',
        type: 'video',
        overview: `A PIP is the smallest price move in most pairs. For EUR/USD, one pip = 0.0001.

LOT sizes: Standard lot = 100,000 units, Mini lot = 10,000, Micro lot = 1,000. One pip on a standard lot = about $10.

LEVERAGE lets you control large positions with small capital. 100:1 means $1,000 controls $100,000. Use leverage cautiously - it amplifies both gains AND losses!`,
        keyTakeaways: [
          'A pip is the smallest standard price movement',
          'Standard lot = 100,000 units of currency',
          'Leverage amplifies both gains AND losses',
          'Start with low leverage until experienced'
        ],
        youtubeId: 'TF9zMvJ6x3E',
        youtubeTitle: 'Pips, Lots and Leverage'
      },
      {
        id: 4,
        title: 'What Moves Currency Prices',
        duration: '10 min',
        type: 'text',
        overview: `Currency prices are influenced by several factors:

Interest Rates: Higher rates attract foreign investment, strengthening the currency. Central bank decisions are closely watched.

Economic Data: GDP, employment, and inflation reports affect currency strength.

Political Stability: Less political risk = stronger currency. Elections and geopolitical events cause volatility.

Market Sentiment: In "risk-on" environments, traders buy higher-yielding currencies. In "risk-off," they flee to safe havens like USD, JPY, CHF.`,
        keyTakeaways: [
          'Interest rates are the primary currency driver',
          'Central bank decisions cause major moves',
          'Economic data releases create volatility',
          'Political events affect currency strength'
        ]
      },
      {
        id: 5,
        title: 'Forex Trading Sessions',
        duration: '5 min',
        type: 'video',
        overview: `Forex operates in three major sessions:

Sydney (10PM-7AM GMT): Quietest, lower volatility.
Tokyo (12AM-9AM GMT): Asian currencies most active.
London (8AM-5PM GMT): Most active, highest volume.
New York (1PM-10PM GMT): Second most active.

Best trading: London/New York overlap (1PM-5PM GMT) has highest liquidity and volatility.`,
        keyTakeaways: [
          'Sydney session is quietest',
          'London session has highest volume',
          'New York features US data releases',
          'London/New York overlap offers best opportunities'
        ],
        youtubeId: 'W_r8pS2uQ48',
        youtubeTitle: 'Forex Trading Sessions'
      },
      {
        id: 6,
        title: 'Forex Fundamentals Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: 'Test your knowledge of Forex fundamentals.',
        keyTakeaways: [],
        quizQuestions: [
          {
            question: 'How much is traded daily in the Forex market?',
            options: ['$1 million', '$1 billion', 'Over $6 trillion', '$100 billion'],
            correctIndex: 2,
            explanation: 'The Forex market trades over $6 trillion daily, making it the world\'s largest financial market.'
          },
          {
            question: 'What is a pip in EUR/USD?',
            options: ['0.01', '0.001', '0.0001', '1.0'],
            correctIndex: 2,
            explanation: 'For most currency pairs like EUR/USD, one pip equals 0.0001 (the fourth decimal place).'
          },
          {
            question: 'What does 100:1 leverage mean?',
            options: ['You need $100 to trade', '$1 controls $100 of currency', 'You make 100x profits only', 'You can only lose $1'],
            correctIndex: 1,
            explanation: '100:1 leverage means $1 of your capital controls $100 worth of currency - amplifying both gains and losses.'
          },
          {
            question: 'Which trading session has the highest volume?',
            options: ['Sydney', 'Tokyo', 'London', 'Weekend'],
            correctIndex: 2,
            explanation: 'The London session has the highest trading volume as it overlaps with both Asian and US sessions.'
          },
          {
            question: 'What typically happens to a currency when its country raises interest rates?',
            options: ['It weakens', 'It strengthens', 'No effect', 'Trading stops'],
            correctIndex: 1,
            explanation: 'Higher interest rates attract foreign investment, increasing demand for the currency and typically strengthening it.'
          }
        ]
      }
    ]
  }
];

// ==============================================================================
// INTERMEDIATE COURSES - PREVIEW ONLY (LOCKED)
// ==============================================================================

export const INTERMEDIATE_COURSE_PREVIEWS = [
  { id: 'technical-analysis', title: 'Technical Analysis', preview: 'Master advanced chart patterns, indicators, and market structure analysis.' },
  { id: 'support-resistance', title: 'Support & Resistance', preview: 'Learn to identify key price levels where markets reverse and pause.' },
  { id: 'fibonacci', title: 'Fibonacci Trading', preview: 'Use mathematical ratios to predict retracements and extensions.' },
  { id: 'moving-averages', title: 'Moving Averages Mastery', preview: 'Implement MA strategies, crossovers, and dynamic support/resistance.' },
  { id: 'rsi-macd', title: 'RSI & MACD Strategies', preview: 'Deep dive into momentum indicators for timing entries and exits.' },
  { id: 'breakout-trading', title: 'Breakout Trading', preview: 'Catch explosive moves when price breaks through key levels.' },
];

// ==============================================================================
// ADVANCED COURSES - PREVIEW ONLY (LOCKED)
// ==============================================================================

export const ADVANCED_COURSE_PREVIEWS = [
  { id: 'institutional', title: 'Institutional Trading', preview: 'Trade like banks and hedge funds using institutional concepts.' },
  { id: 'order-flow', title: 'Order Flow Analysis', preview: 'Read market depth and understand how orders drive price.' },
  { id: 'smart-money', title: 'Smart Money Concepts', preview: 'Follow the footprints of institutional traders.' },
  { id: 'liquidity', title: 'Liquidity Trading', preview: 'Understand where liquidity sits and how price seeks it.' },
];

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

export function getCourseContent(courseId: string): CourseContent | null {
  return BEGINNER_COURSES.find(c => c.id === courseId) || null;
}

export function getLessonContent(courseId: string, lessonId: number): LessonContent | null {
  const course = getCourseContent(courseId);
  if (!course) return null;
  return course.lessons.find(l => l.id === lessonId) || null;
}

// ==============================================================================
// SWIFT FX ACADEMY - LESSON CONTENT DATA
// ==============================================================================
// 
// STRUCTURE:
// - Beginner courses: FULL content (overview, key takeaways, YouTube video)
// - Intermediate/Advanced: PREVIEW ONLY (title + short description, locked)
// ==============================================================================

export interface LessonContent {
  id: number;
  title: string;
  duration: string;
  type: 'video' | 'text' | 'quiz';
  overview: string;
  keyTakeaways: string[];
  youtubeUrl?: string;
  youtubeTitle?: string;
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
        duration: '8 min',
        type: 'video',
        overview: `Trading is the act of buying and selling financial assets with the goal of making a profit. When you trade, you're essentially trying to predict whether the price of an asset will go up or down.

Think of it like buying and selling items at a market. If you buy something at a low price and sell it at a higher price, you make a profit. The same principle applies to financial trading, but instead of physical items, you're trading currencies, stocks, commodities, or cryptocurrencies.

The beauty of modern trading is that anyone with an internet connection can participate in global markets. You don't need to be a Wall Street professional to start learning and eventually trading.`,
        keyTakeaways: [
          'Trading involves buying assets at one price and selling at another',
          'The goal is to profit from price movements in financial markets',
          'Modern technology allows anyone to access global markets',
          'Success requires education, practice, and proper risk management',
          'Starting small and learning continuously is key to long-term success'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=Xn7KWR9EOGQ',
        youtubeTitle: 'Trading 101: How Does Trading Work?'
      },
      {
        id: 2,
        title: 'Types of Financial Markets',
        duration: '10 min',
        type: 'video',
        overview: `There are several major financial markets where trading takes place, each with its own characteristics and opportunities.

The Forex (Foreign Exchange) market is the largest and most liquid market in the world, where currencies are traded 24 hours a day, 5 days a week. Daily trading volume exceeds $6 trillion.

The Stock Market allows you to buy and sell shares of publicly traded companies. When you own a stock, you own a small piece of that company.

Commodities markets let you trade physical goods like gold, oil, and agricultural products. These markets are influenced by supply and demand, weather, and geopolitical events.

Cryptocurrency markets are the newest addition, offering 24/7 trading of digital assets like Bitcoin and Ethereum.`,
        keyTakeaways: [
          'Forex is the largest market with $6+ trillion daily volume',
          'Stock markets let you own pieces of companies',
          'Commodities include gold, oil, and agricultural products',
          'Crypto markets operate 24/7 unlike traditional markets',
          'Each market has unique characteristics and trading hours'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=PHe0bXAIuk0',
        youtubeTitle: 'How The Stock Exchange Works (For Dummies)'
      },
      {
        id: 3,
        title: 'Understanding Market Participants',
        duration: '7 min',
        type: 'text',
        overview: `Financial markets are made up of various participants, each playing a different role in the ecosystem.

Retail Traders are individual traders like you who trade with their own money. While retail traders make up a small percentage of total volume, there are millions of us worldwide.

Institutional Traders include banks, hedge funds, and investment firms. They move large amounts of money and can influence market direction.

Market Makers provide liquidity by always being ready to buy or sell. They profit from the spread (the difference between buy and sell prices).

Central Banks control monetary policy and can dramatically impact currency values through interest rate decisions and interventions.

Understanding who else is in the market helps you make better trading decisions.`,
        keyTakeaways: [
          'Retail traders are individuals trading their own money',
          'Institutional traders move large volumes and can impact prices',
          'Market makers provide liquidity and profit from spreads',
          'Central banks influence markets through monetary policy',
          'Knowing other participants helps improve trading decisions'
        ]
      },
      {
        id: 4,
        title: 'How Prices Move',
        duration: '12 min',
        type: 'video',
        overview: `Price movement in financial markets is driven by one fundamental principle: supply and demand.

When more people want to buy an asset than sell it (high demand), the price goes up. When more people want to sell than buy (high supply), the price goes down. It's really that simple at its core.

However, what drives supply and demand is more complex. Economic data releases, news events, market sentiment, and technical factors all play a role.

For example, if a company reports better-than-expected earnings, more people will want to buy its stock, pushing the price up. If a country's central bank raises interest rates, its currency typically strengthens.

As a trader, your job is to analyze these factors and predict which direction prices will move.`,
        keyTakeaways: [
          'Prices move based on supply and demand',
          'More buyers than sellers = price goes up',
          'More sellers than buyers = price goes down',
          'News, economic data, and sentiment drive supply/demand',
          'Traders analyze these factors to predict price direction'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=p7HKvqRI_Bo',
        youtubeTitle: 'Supply and Demand Trading Explained'
      },
      {
        id: 5,
        title: 'Course Quiz: Trading Basics',
        duration: '5 min',
        type: 'quiz',
        overview: `Test your knowledge of trading fundamentals! This quiz covers everything you've learned in this course.

Topics covered:
- Definition of trading and its basic concepts
- Types of financial markets (Forex, Stocks, Commodities, Crypto)
- Market participants and their roles
- How supply and demand affect prices

Take your time and review the lessons if needed. This quiz is designed to reinforce your learning, not to trick you.`,
        keyTakeaways: [
          'Review all lessons before taking the quiz',
          'Focus on understanding concepts, not memorizing',
          'You can retake the quiz to improve your score',
          'Use this as a foundation for more advanced topics',
          'Congratulations on completing your first course!'
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
        overview: `Charts are visual representations of price movement over time. They are the primary tool traders use to analyze markets and make decisions.

There are three main types of charts: Line charts (simplest, showing closing prices), Bar charts (showing open, high, low, and close), and Candlestick charts (the most popular among traders).

Charts can be viewed across different timeframes - from 1-minute charts for day traders to weekly or monthly charts for long-term investors. The timeframe you choose depends on your trading style.

Learning to read charts is like learning a new language. Once you understand it, you'll be able to "see" what the market is telling you.`,
        keyTakeaways: [
          'Charts visualize price movement over time',
          'Three main types: Line, Bar, and Candlestick',
          'Candlestick charts are most popular among traders',
          'Timeframes range from 1-minute to monthly',
          'Chart reading is essential for technical analysis'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=hU9BkqD3F6U',
        youtubeTitle: 'Candlestick Charts for Beginners'
      },
      {
        id: 2,
        title: 'Candlestick Anatomy',
        duration: '10 min',
        type: 'video',
        overview: `A candlestick contains four pieces of information: the Opening price, Closing price, High, and Low for a specific time period.

The "body" of the candlestick shows the range between open and close. A green (or white) body means the price closed higher than it opened - bullish. A red (or black) body means the price closed lower - bearish.

The thin lines above and below the body are called "wicks" or "shadows." They show the highest and lowest prices reached during that period.

The size and shape of candlesticks tell a story. Long bodies show strong momentum, while small bodies indicate indecision. Long wicks can signal potential reversals.`,
        keyTakeaways: [
          'Each candle shows Open, High, Low, and Close (OHLC)',
          'Green/white = bullish (price went up)',
          'Red/black = bearish (price went down)',
          'Wicks show the highest and lowest prices reached',
          'Candle size and shape reveal market sentiment'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=C3KRwfj9F8Q',
        youtubeTitle: 'How to Read Candlestick Charts'
      },
      {
        id: 3,
        title: 'Common Candlestick Patterns',
        duration: '12 min',
        type: 'video',
        overview: `Candlestick patterns are formations that can signal potential market moves. Here are the most important ones for beginners:

Doji: A candle with almost no body, showing indecision. The open and close are nearly equal.

Hammer: A small body with a long lower wick. When appearing after a downtrend, it can signal a reversal upward.

Engulfing Pattern: When a candle completely "engulfs" the previous candle. Bullish engulfing can signal upward movement, bearish engulfing signals downward.

Pin Bar: Similar to hammer but can appear anywhere. The long wick shows rejection of a price level.

Remember: No pattern works 100% of the time. Always use patterns in context with other analysis.`,
        keyTakeaways: [
          'Doji candles show market indecision',
          'Hammer patterns can signal trend reversals',
          'Engulfing patterns show strong momentum shifts',
          'Pin bars indicate price rejection at key levels',
          'Always confirm patterns with other analysis tools'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=q8MNYg-Y1G8',
        youtubeTitle: 'Top 5 Candlestick Patterns for Trading'
      },
      {
        id: 4,
        title: 'Timeframes Explained',
        duration: '8 min',
        type: 'text',
        overview: `Timeframes determine how much price data each candlestick represents. Choosing the right timeframe is crucial for your trading style.

Scalpers use 1-minute to 5-minute charts, looking for quick trades lasting minutes. This requires fast decision-making and constant monitoring.

Day Traders typically use 15-minute to 1-hour charts. They close all positions before the day ends.

Swing Traders prefer 4-hour to daily charts. Their trades last days to weeks.

Position Traders use daily to weekly charts for trades lasting weeks to months.

A good practice is multi-timeframe analysis: using higher timeframes for trend direction and lower timeframes for entry timing.`,
        keyTakeaways: [
          'Scalpers: 1-5 minute charts for quick trades',
          'Day traders: 15min-1hour charts, same-day trades',
          'Swing traders: 4hour-daily charts, multi-day trades',
          'Position traders: daily-weekly charts, long-term',
          'Multi-timeframe analysis combines different views'
        ]
      },
      {
        id: 5,
        title: 'Reading Price Action',
        duration: '10 min',
        type: 'video',
        overview: `Price action is the movement of price over time. Reading price action means understanding what the market is doing without relying on indicators.

Look for trends: Higher highs and higher lows indicate an uptrend. Lower highs and lower lows show a downtrend.

Identify key levels: These are prices where the market has previously reversed or paused. They act as support (floor) and resistance (ceiling).

Watch for momentum: Strong candles with little wick show conviction. Weak, indecisive candles suggest the trend may be losing steam.

Price action trading is about reading the story the market is telling through the charts. It takes practice, but it's the foundation of technical analysis.`,
        keyTakeaways: [
          'Price action is pure price movement without indicators',
          'Uptrend = higher highs and higher lows',
          'Downtrend = lower highs and lower lows',
          'Key levels act as support and resistance',
          'Strong candles show conviction, weak candles show indecision'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=gvAJ92Zt9fY',
        youtubeTitle: 'Price Action Trading Explained'
      },
      {
        id: 6,
        title: 'Chart Patterns Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: `Test your understanding of chart reading fundamentals!

This quiz covers:
- Candlestick anatomy (body, wicks, colors)
- Common candlestick patterns
- Timeframe selection
- Basic price action concepts

Remember, chart reading is a skill that improves with practice. Use this quiz to identify areas where you might need more review.`,
        keyTakeaways: [
          'Practice identifying candlestick patterns',
          'Understand the significance of different timeframes',
          'Connect patterns to potential market movements',
          'Review any concepts you found challenging',
          'Continue practicing on live charts'
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
        duration: '8 min',
        type: 'video',
        overview: `Risk management is the most important skill in trading. You can have the best strategy in the world, but without proper risk management, you will eventually lose your account.

The truth is: even professional traders lose on many of their trades. What separates winners from losers is how they manage those losses.

A common beginner mistake is risking too much on a single trade. One bad trade can wipe out weeks or months of gains - or even your entire account.

Professional traders typically risk only 1-2% of their account per trade. This means even a string of losses won't destroy their account, and they live to trade another day.`,
        keyTakeaways: [
          'Risk management is more important than strategy',
          'Even professionals lose on many trades',
          'Never risk more than 1-2% per trade',
          'Protecting capital allows you to stay in the game',
          'One bad trade should never ruin your account'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=wxZ26IOv1-8',
        youtubeTitle: 'Risk Management in Trading - The Basics'
      },
      {
        id: 2,
        title: 'Position Sizing',
        duration: '10 min',
        type: 'video',
        overview: `Position sizing determines how much of your account you put into each trade. It's the cornerstone of risk management.

The formula is simple: First, decide how much you're willing to lose (e.g., 1% of your account). Then, calculate your stop loss distance. Finally, adjust your position size so that if stopped out, you only lose your predetermined amount.

Example: $10,000 account, 1% risk = $100 max loss. If your stop loss is 50 pips away, you would trade a position size where 50 pips = $100.

This approach ensures consistent risk regardless of the trade setup. Whether you're trading a tight stop or a wide stop, your dollar risk stays the same.`,
        keyTakeaways: [
          'Position size controls your dollar risk per trade',
          'Calculate based on your stop loss distance',
          'Keep risk consistent across all trades (1-2%)',
          'Larger stops = smaller position sizes',
          'Never adjust position size based on confidence level'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=dLvAq5YlPCo',
        youtubeTitle: 'Position Sizing: How Much to Risk Per Trade'
      },
      {
        id: 3,
        title: 'Stop Losses and Take Profits',
        duration: '10 min',
        type: 'video',
        overview: `A stop loss is an order that automatically closes your trade if the price moves against you by a certain amount. It's your safety net.

Never trade without a stop loss. Hope is not a strategy. If the market proves you wrong, accept the loss and move on.

A take profit is the opposite - it automatically closes your trade when you've reached your profit target.

The Risk-Reward Ratio compares potential profit to potential loss. A 1:2 ratio means you're risking $1 to potentially make $2. Aim for setups where your reward is at least twice your risk.

With a 1:2 risk-reward, you only need to win 33% of your trades to break even!`,
        keyTakeaways: [
          'Always use a stop loss - no exceptions',
          'Stop losses protect you from catastrophic losses',
          'Take profits lock in gains automatically',
          'Aim for 1:2 or better risk-reward ratio',
          'With 1:2 ratio, you can be wrong 66% and still profit'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=FqF9Q9p1Yvg',
        youtubeTitle: 'How to Set Stop Loss and Take Profit'
      },
      {
        id: 4,
        title: 'The 1% Rule',
        duration: '7 min',
        type: 'text',
        overview: `The 1% Rule is simple: never risk more than 1% of your trading account on a single trade.

With a $10,000 account and 1% risk, your maximum loss per trade is $100. This means you could lose 10 trades in a row and only be down 10%.

This might seem overly conservative, but it's how professionals protect their capital. The math is powerful:

- 10 consecutive losses at 1% = -9.6% drawdown
- 10 consecutive losses at 5% = -40% drawdown
- 10 consecutive losses at 10% = -65% drawdown

When you lose 50% of your account, you need a 100% gain just to get back to even. Protect your capital first.`,
        keyTakeaways: [
          'Risk maximum 1% of account per trade',
          '$10,000 account = $100 max risk per trade',
          '10 losing trades at 1% = only ~10% drawdown',
          'Losing 50% requires 100% gain to recover',
          'Capital preservation is the priority'
        ]
      },
      {
        id: 5,
        title: 'Risk Management Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: `Test your understanding of risk management principles!

This quiz covers:
- Position sizing calculations
- Stop loss and take profit concepts
- Risk-reward ratios
- The 1% rule
- Why risk management matters

Getting these fundamentals right will determine your long-term success as a trader. Review any areas where you feel uncertain.`,
        keyTakeaways: [
          'Risk management is a skill, not just knowledge',
          'Practice calculating position sizes',
          'Understand the math behind risk-reward',
          'Commit to following your risk rules',
          'Your trading career depends on capital preservation'
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
        duration: '8 min',
        type: 'video',
        overview: `Trading is 80% psychology and 20% strategy. Most traders fail not because of poor strategies, but because they can't control their emotions.

The market doesn't care about your feelings, your mortgage payment, or your ego. It will do what it does regardless of what you want or need.

Successful traders think in probabilities. They know that any single trade can lose, but over many trades, their edge plays out. They don't get emotional about individual results.

Developing the right mindset takes time and experience. It's about becoming comfortable with uncertainty and accepting that losses are part of the business.`,
        keyTakeaways: [
          'Trading is 80% psychology, 20% strategy',
          'The market doesn\'t care about your emotions',
          'Think in probabilities, not certainties',
          'Accept that losses are part of trading',
          'Emotional control separates winners from losers'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=8yVuew50N8g',
        youtubeTitle: 'Trading Psychology: The Mindset of Successful Traders'
      },
      {
        id: 2,
        title: 'Fear and Greed',
        duration: '10 min',
        type: 'video',
        overview: `Fear and greed are the two dominant emotions in trading. Understanding and managing them is crucial for success.

Fear causes traders to: Exit winning trades too early, Avoid taking valid setups, Move stop losses farther away (hoping), and Freeze during important moments.

Greed causes traders to: Hold winning trades too long, Overtrade (taking low-quality setups), Risk too much per trade, and Chase trades after missing entries.

Both emotions stem from focusing too much on money and not enough on process. The solution is to follow your trading plan mechanically and trust your edge over time.`,
        keyTakeaways: [
          'Fear and greed are the main trading emotions',
          'Fear makes you exit winners too early',
          'Greed makes you risk too much and overtrade',
          'Both emotions cause poor decision-making',
          'Focus on process, not money, to stay balanced'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=Eb1_BIZXmkA',
        youtubeTitle: 'Fear and Greed in Trading: How to Control Them'
      },
      {
        id: 3,
        title: 'Dealing with Losses',
        duration: '8 min',
        type: 'text',
        overview: `Every trader experiences losses. How you handle them determines your long-term success.

First, accept that losses are a normal part of trading. Even the best traders lose 40-50% of their trades. A losing trade doesn't mean you did something wrong - it might just be a normal outcome.

Never revenge trade. After a loss, the temptation is to immediately jump back in to "make it back." This almost always leads to more losses.

Instead, take a break after a loss. Review the trade objectively. Did you follow your plan? If yes, the loss was acceptable. If no, learn from the mistake.

Keep a trading journal to track your emotional states. You'll start to notice patterns and can work on your weak points.`,
        keyTakeaways: [
          'Losses are normal - even pros lose 40-50% of trades',
          'Never revenge trade after a loss',
          'Take breaks to reset emotionally',
          'Review trades objectively, not emotionally',
          'Keep a journal to track emotional patterns'
        ]
      },
      {
        id: 4,
        title: 'Building Discipline',
        duration: '10 min',
        type: 'video',
        overview: `Discipline is the bridge between your trading plan and consistent results. Without discipline, even the best strategy is useless.

Create a detailed trading plan that covers: What setups you'll trade, When you'll trade, How much you'll risk, and When you'll stop trading for the day.

Then, commit to following it. No exceptions. The plan exists because you made it with a clear head. During trading, emotions cloud judgment - trust the plan.

Start small. Trade with small position sizes while you build discipline. It's easier to follow rules when the stakes are low.

Treat trading like a business. Would a business owner randomly change their operations every day? No. Be consistent.`,
        keyTakeaways: [
          'Discipline connects your plan to results',
          'Create a detailed, written trading plan',
          'Follow the plan without exceptions',
          'Start with small sizes to build habits',
          'Treat trading like a professional business'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=YWgOJLCGEL4',
        youtubeTitle: 'How to Build Trading Discipline'
      },
      {
        id: 5,
        title: 'Psychology Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: `Test your understanding of trading psychology!

This quiz covers:
- The trader's mindset and probability thinking
- Managing fear and greed
- Proper response to losses
- Building and maintaining discipline

Psychology is often the hardest part of trading to master. Use this quiz to identify areas for personal development.`,
        keyTakeaways: [
          'Psychology is a continuous journey, not a destination',
          'Self-awareness is the first step to improvement',
          'Everyone struggles with emotions in trading',
          'Practice and journaling accelerate growth',
          'A strong psychology is your ultimate edge'
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
        duration: '8 min',
        type: 'video',
        overview: `Forex (Foreign Exchange) is the global marketplace for exchanging national currencies. It's the largest and most liquid financial market in the world.

Every day, over $6 trillion is traded in the Forex market. That's more than all stock markets combined. This massive liquidity means you can enter and exit positions easily.

Unlike stock markets, Forex operates 24 hours a day, 5 days a week. Trading follows the sun around the globe: Sydney opens first, then Tokyo, London, and finally New York.

Forex is traded in pairs because you're always comparing one currency to another. When you "buy EUR/USD," you're buying Euros and selling US Dollars.`,
        keyTakeaways: [
          'Forex is the world\'s largest market at $6+ trillion daily',
          'It operates 24 hours, 5 days a week',
          'Trading sessions follow global time zones',
          'Currencies are always traded in pairs',
          'High liquidity allows easy entry and exit'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=aJ8FVhNkqws',
        youtubeTitle: 'Forex Trading for Beginners'
      },
      {
        id: 2,
        title: 'Currency Pairs Explained',
        duration: '10 min',
        type: 'video',
        overview: `Currency pairs are divided into three categories: Majors, Minors (Crosses), and Exotics.

Major pairs include the US Dollar and are the most traded: EUR/USD (Euro/Dollar), GBP/USD (Pound/Dollar), USD/JPY (Dollar/Yen), and USD/CHF (Dollar/Franc).

Minor pairs don't include USD: EUR/GBP, EUR/JPY, GBP/JPY. They have slightly wider spreads but still good liquidity.

Exotic pairs include one major currency and one from a developing economy: USD/TRY, EUR/ZAR. These have wider spreads and more volatility.

For beginners, stick to major pairs. They have the tightest spreads and most predictable behavior.`,
        keyTakeaways: [
          'Majors include USD and are most liquid',
          'EUR/USD is the most traded pair globally',
          'Minor pairs (crosses) don\'t include USD',
          'Exotic pairs are more volatile with wider spreads',
          'Beginners should focus on major pairs'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=4g7c4E8vU2c',
        youtubeTitle: 'Currency Pairs Explained for Beginners'
      },
      {
        id: 3,
        title: 'Pips, Lots, and Leverage',
        duration: '12 min',
        type: 'video',
        overview: `Understanding pips, lots, and leverage is essential for Forex trading.

A PIP (Point in Percentage) is the smallest price move in most currency pairs. For EUR/USD, one pip = 0.0001. If EUR/USD moves from 1.1000 to 1.1001, it moved one pip.

LOT sizes determine how much currency you're trading: Standard lot = 100,000 units, Mini lot = 10,000 units, Micro lot = 1,000 units. One pip on a standard lot of EUR/USD = $10.

LEVERAGE allows you to control large positions with small capital. 100:1 leverage means $1,000 controls $100,000. While this amplifies gains, it also amplifies losses. Use leverage cautiously!`,
        keyTakeaways: [
          'A pip is the smallest standard price movement',
          'Standard lot = 100,000 units of currency',
          'Mini lot = 10,000, Micro lot = 1,000 units',
          'Leverage amplifies both gains AND losses',
          'Start with low leverage until experienced'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=TF9zMvJ6x3E',
        youtubeTitle: 'Pips, Lots and Leverage Explained'
      },
      {
        id: 4,
        title: 'What Moves Currency Prices',
        duration: '10 min',
        type: 'text',
        overview: `Currency prices are influenced by many factors, both fundamental and technical.

Interest Rates are the biggest driver. Higher interest rates attract foreign investment, increasing demand for that currency. Central bank decisions are closely watched.

Economic Data like GDP, employment figures, and inflation reports affect currency strength. Strong economic data typically strengthens a currency.

Political Stability matters too. Countries with less political risk see stronger currencies. Elections, trade wars, and geopolitical events cause volatility.

Market Sentiment - how traders feel about risk - affects currencies. In "risk-on" environments, traders buy higher-yielding currencies. In "risk-off," they flee to safe havens like USD, JPY, and CHF.`,
        keyTakeaways: [
          'Interest rates are the primary currency driver',
          'Central bank decisions cause major moves',
          'Economic data releases create volatility',
          'Political events affect currency strength',
          'Market sentiment drives risk-on/risk-off flows'
        ]
      },
      {
        id: 5,
        title: 'Forex Trading Sessions',
        duration: '8 min',
        type: 'video',
        overview: `The Forex market operates in three major sessions that overlap at certain times.

Sydney Session (10PM-7AM GMT): Quietest session with lower volatility. Good for range trading.

Tokyo Session (12AM-9AM GMT): Asian currencies like JPY are most active. Moderate volatility.

London Session (8AM-5PM GMT): The most active session with highest volume. European currencies move significantly.

New York Session (1PM-10PM GMT): Second most active. Major US data releases occur here.

The best trading occurs during session overlaps, especially London/New York (1PM-5PM GMT). This is when liquidity and volatility are highest.`,
        keyTakeaways: [
          'Sydney session is quietest, lowest volatility',
          'Tokyo session: Asian currencies most active',
          'London session has highest trading volume',
          'New York session features US data releases',
          'London/New York overlap offers best opportunities'
        ],
        youtubeUrl: 'https://www.youtube.com/watch?v=W_r8pS2uQ48',
        youtubeTitle: 'Forex Trading Sessions Explained'
      },
      {
        id: 6,
        title: 'Forex Fundamentals Quiz',
        duration: '5 min',
        type: 'quiz',
        overview: `Test your knowledge of Forex fundamentals!

This quiz covers:
- Currency pairs and their categories
- Pips, lots, and leverage calculations
- Factors that move currency prices
- Trading sessions and their characteristics

A solid understanding of these basics will serve you well as you progress in your Forex trading journey.`,
        keyTakeaways: [
          'Forex basics are the foundation for advanced trading',
          'Understanding pips and lots is essential for risk management',
          'Know what economic events to watch',
          'Choose the right session for your trading style',
          'Continue learning with more advanced courses'
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
  { id: 'trend-trading', title: 'Trend Trading Strategies', preview: 'Ride trends for maximum profit with proper entry and exit rules.' },
  { id: 'swing-trading', title: 'Swing Trading', preview: 'Hold positions for days to weeks using multi-timeframe analysis.' },
  { id: 'backtesting', title: 'Backtesting Strategies', preview: 'Test your strategies on historical data before risking real money.' },
  { id: 'trade-management', title: 'Trade Management', preview: 'Master entries, exits, scaling in/out, and position management.' },
  { id: 'news-trading', title: 'News Trading', preview: 'Trade economic events and news releases for profit.' },
  { id: 'correlation', title: 'Market Correlation', preview: 'Understand how different markets move together and diverge.' },
];

// ==============================================================================
// ADVANCED COURSES - PREVIEW ONLY (LOCKED)
// ==============================================================================

export const ADVANCED_COURSE_PREVIEWS = [
  { id: 'institutional', title: 'Institutional Trading', preview: 'Trade like banks and hedge funds using institutional concepts.' },
  { id: 'order-flow', title: 'Order Flow Analysis', preview: 'Read market depth and understand how orders drive price.' },
  { id: 'smart-money', title: 'Smart Money Concepts', preview: 'Follow the footprints of institutional traders.' },
  { id: 'liquidity', title: 'Liquidity Trading', preview: 'Understand where liquidity sits and how price seeks it.' },
  { id: 'market-structure', title: 'Market Structure Analysis', preview: 'Advanced price action and market structure techniques.' },
  { id: 'algorithmic', title: 'Algorithmic Trading Intro', preview: 'Introduction to automated trading systems and bots.' },
  { id: 'portfolio', title: 'Portfolio Management', preview: 'Diversify and manage multiple trading instruments.' },
  { id: 'options', title: 'Options Trading', preview: 'Learn derivatives trading for hedging and speculation.' },
  { id: 'intermarket', title: 'Intermarket Analysis', preview: 'Analyze relationships between stocks, bonds, commodities, and currencies.' },
  { id: 'pro-psychology', title: 'Pro Trading Psychology', preview: 'Elite mental performance and peak trading state.' },
];

// ==============================================================================
// HELPER FUNCTION: Get course content by ID
// ==============================================================================

export function getCourseContent(courseId: string): CourseContent | null {
  return BEGINNER_COURSES.find(c => c.id === courseId) || null;
}

export function getLessonContent(courseId: string, lessonId: number): LessonContent | null {
  const course = getCourseContent(courseId);
  if (!course) return null;
  return course.lessons.find(l => l.id === lessonId) || null;
}

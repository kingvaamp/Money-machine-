# Trading Bot Implementation Plan

## Table of Contents
1. [Current Architecture Overview](#current-architecture-overview)
2. [Existing Components](#existing-components)
3. [Implemented Features](#implemented-features)
4. [Improvements Based on Research](#improvements-based-on-research)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Risk Management Framework](#risk-management-framework)
7. [Strategy Selection Logic](#strategy-selection-logic)
8. [Testing and Validation](#testing-and-validation)

---

## Current Architecture Overview

The Trading Bot is built as a full-stack React application with a Node.js backend using Hono framework. It implements a multi-strategy ensemble approach with regime detection, risk management, and sentiment analysis.

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS + Radix UI components
- **Backend**: Hono (Node.js framework)
- **Database**: MySQL with Drizzle ORM
- **Trading**: CCXT library for exchange connectivity
- **ML/AI**: Custom regime classifier with Hurst Exponent analysis

### Project Structure
```
app/
├── api/
│   ├── trading/
│   │   ├── engine.ts       # Main trading engine
│   │   ├── strategies.ts   # Trading strategy implementations
│   │   ├── risk.ts         # Risk management module
│   │   ├── ml.ts           # ML and regime detection
│   │   ├── sentiment.ts    # Fear & Greed sentiment
│   │   ├── data-feed.ts    # Real-time data fetching
│   │   ├── executor.ts     # Order execution
│   │   ├── backtest.ts    # Backtesting engine
│   │   └── types.ts       # TypeScript type definitions
│   ├── db-routers.ts      # Database routers
│   ├── router.ts          # API router configuration
│   └── boot.ts            # Application bootstrap
├── db/
│   ├── schema.ts          # Database schema
│   └── seed.ts            # Database seeding
├── src/
│   ├── pages/             # React pages (Dashboard, Strategies, etc.)
│   ├── components/        # React components
│   └── providers/         # Context providers
└── package.json
```

---

## Existing Components

### 1. Trading Engine (`api/trading/engine.ts`)

**Purpose**: Core orchestration of all trading activities

**Key Features**:
- Manages bot state (capital, positions, P&L, drawdown)
- Coordinates signal generation, risk management, and order execution
- Handles market data loading and updates
- Implements tick-based processing cycle
- Supports both paper trading and live trading modes

**State Variables**:
```typescript
interface BotState {
  isRunning: boolean;
  mode: ExecutionMode;
  capital: number;
  activeStrategies: number;
  openPositions: number;
  dailyPnl: number;
  totalPnl: number;
  currentDrawdown: number;
  regime: MarketRegime & { hurstExponent?: number };
  lastUpdate: number;
  fearGreedScore?: number;
  fearGreedLabel?: string;
  activeSymbols: string[];
  dataSource: "real" | "synthetic";
}
```

**Current Limitations**:
- No dynamic position sizing based on signal confidence
- Limited multi-symbol support (single symbol processing)
- No built-in walk-forward validation for strategies

---

### 2. Trading Strategies (`api/trading/strategies.ts`)

**Implemented Strategies**:

#### Trend Following Strategy
- **Indicators**: EMA crossover (fast/slow), RSI, MACD
- **Entry**: Fast EMA crosses above Slow EMA + RSI not overbought + MACD histogram positive
- **Exit**: Fast EMA crosses below Slow EMA + RSI overbought
- **Parameters**: fastPeriod (20), slowPeriod (50), rsiPeriod (14), rsiOverbought (70), rsiOversold (30)

#### Mean Reversion Strategy
- **Indicators**: Bollinger Bands, RSI, ATR
- **Entry**: Price at or below lower Bollinger Band + RSI < 30
- **Exit**: Price at or above upper Bollinger Band + RSI > 70
- **Parameters**: bbPeriod (20), bbStdDev (2), rsiPeriod (14)

#### Grid Trading Strategy
- **Indicators**: SMA 50, ATR
- **Entry**: Price approaches grid level within 0.2% tolerance
- **Logic**: Places buy orders at regular intervals below price, sell orders above
- **Parameters**: gridLevels (10), gridRange (0.05)

#### Arbitrage Strategy
- **Indicators**: SMA lookback
- **Entry**: Price deviates from SMA by threshold amount
- **Logic**: Statistical mean reversion on price deviations
- **Parameters**: lookback (20), threshold (0.003 = 0.3%)

#### Market Making Strategy
- **Indicators**: ATR, volatility-adjusted spread
- **Entry**: Multiple bid/ask levels around current price
- **Logic**: Provides liquidity with dynamic spread based on volatility
- **Parameters**: spread (0.001), depth (3)

**Gap Analysis**:
- Missing: Breakout momentum strategy (high priority)
- Missing: Congressional front-running strategy (alternative data)
- Missing: Political signal analysis integration
- Need: Better regime-aware strategy activation/deactivation

---

### 3. Risk Management (`api/trading/risk.ts`)

**Implemented Components**:

#### RiskManager Class
- **Position Sizing**:
  - Kelly Criterion (half-Kelly for safety)
  - ATR-based position sizing with 2 ATR stop distance
  - Maximum position size enforcement (config.maxPositionSize)

- **Stop Loss/Take Profit**:
  - ATR-based dynamic stops (2 ATR for SL, 3 ATR for TP)
  - Trailing stop at 5% profit (3% trailing)
  - Time-based exit after 48 hours at loss

- **Exposure Limits**:
  - Maximum 80% capital exposure
  - Maximum open positions (config.maxOpenPositions)
  - Daily loss limit check

#### CircuitBreaker Class
- **Triggers**:
  - Daily loss warning at -5%
  - Daily loss critical at -7%
  - Drawdown warning at 10%
  - Drawdown critical at 15%
  - Too many positions warning at 15+

**Current Strengths**:
- Comprehensive circuit breakers implemented
- ATR-based dynamic stops
- Kelly Criterion position sizing

**Improvements Needed**:
- Add weekly loss limits (currently only daily)
- Implement consecutive loss limits (pause after X losses)
- Add portfolio-level correlation checking
- Implement confidence-based position sizing (1-2% risk based on signal quality)

---

### 4. Machine Learning & Regime Detection (`api/trading/ml.ts`)

**Implemented Components**:

#### RegimeClassifier
- **Primary Method**: Hurst Exponent (R/S analysis)
- **Regime Classification**:
  - H < 0.45 → Ranging (mean-reverting)
  - H > 0.55 → Trending (trend-following)
  - H ≈ 0.50 → Random walk (reduce exposure)

- **Secondary Indicators**:
  - EMA slope for trend direction
  - RSI for overbought/oversold
  - MACD histogram for momentum
  - ATR for volatility
  - Volume profile

**Regime Types**:
- trending_up
- trending_down
- ranging
- volatile
- breakout

#### PPORLOptimizer
- **Reward Function**: Sharpe ratio + win rate - drawdown penalty
- **Optimization**: Strategy weight adjustment based on recent performance
- **Action Selection**: Regime-aware strategy allocation

#### EnsembleStrategy
- **Signal Generation**: Combines all active strategies
- **Weighting Factors**:
  - Strategy allocation weight
  - Regime match
  - Hurst confidence
  - Sentiment boost

**Current Strengths**:
- Hurst Exponent for robust regime detection
- PPO-inspired optimization
- Fear & Greed sentiment integration

**Gaps**:
- No actual ML model training (simulated weights only)
- No Random Forest or XGBoost integration
- No LSTM for price prediction
- No walk-forward optimization
- Limited multi-timeframe analysis

---

### 5. Data Feed (`api/trading/data-feed.ts`)

**Features**:
- Real-time data fetching from Binance (via CCXT)
- Fallback to synthetic data if connection fails
- Historical data loading (200 candles default)
- Live data feed for simulation mode

**Current Status**: Working (testnet mode)

---

### 6. Order Execution (`api/trading/executor.ts`)

**Features**:
- Paper trading mode (Binance testnet)
- Simulation mode (in-memory)
- Market order support
- Order result tracking

**Current Status**: Working for paper trading

---

### 7. Backtesting (`api/trading/backtest.ts`)

**Features**:
- Historical simulation
- Configurable parameters (days, fees, slippage)
- Performance metrics calculation
- Equity curve tracking

**Gaps**:
- No walk-forward validation
- Limited stress testing across regimes
- No parameter optimization framework

---

## Implemented Features

### ✅ Completed Features

1. **Multi-Strategy Ensemble**
   - 5 strategy types implemented
   - Regime-based strategy selection
   - Weighted signal combination

2. **Risk Management**
   - ATR-based position sizing
   - Kelly Criterion calculation
   - Circuit breakers (daily loss, drawdown)
   - Stop loss and take profit automation

3. **Regime Detection**
   - Hurst Exponent analysis
   - EMA-based trend detection
   - Volatility adjustment

4. **Sentiment Analysis**
   - Fear & Greed Index integration
   - Signal boost based on sentiment

5. **Data Pipeline**
   - Binance real-time data (testnet)
   - Synthetic fallback
   - Historical data loading

6. **Order Execution**
   - Paper trading mode
   - Simulation mode

7. **Backtesting**
   - Historical simulation
   - Fee and slippage modeling
   - Performance metrics

8. **Database Schema**
   - Strategies, trades, positions
   - Backtests, signals, market data
   - Performance metrics tracking

9. **UI Dashboard**
   - Home (dashboard with signals)
   - Strategies (strategy management)
   - Terminal (live trading interface)
   - Backtest (historical testing)
   - Analytics (performance charts)
   - Settings (configuration)

---

## Improvements Based on Research

### Priority 1: Critical Risk Management Improvements

#### 1.1 Enhanced Circuit Breakers
```typescript
// Add to risk.ts - CircuitBreaker class
- Weekly loss limit (7-10%)
- Maximum drawdown from peak (15-20%)
- Consecutive loss limit (pause after 5 losses)
- Max consecutive winning limit (prevent overconfidence)
```

#### 1.2 Confidence-Based Position Sizing
```typescript
// New function in risk.ts
function calculateConfidenceBasedSize(
  capital: number,
  riskPerTrade: number,
  confidence: number,
  stopDistance: number
): number {
  // 0.5% for low confidence (single indicator)
  // 1% for medium confidence (multiple indicators)
  // 2% for high confidence (multi-timeframe confluence)
  const baseRisk = confidence >= 0.8 ? 2 : confidence >= 0.6 ? 1 : 0.5;
  const riskAmount = capital * (baseRisk / 100);
  return riskAmount / (stopDistance / capital);
}
```

#### 1.3 Dynamic Stop Loss Phases
```typescript
// Add to checkExit in risk.ts
- Initial stop: ATR-based at entry
- Breakeven move: when profit reaches 1R (move to entry)
- Trailing stop: when profit reaches 2R (trail with ATR)
```

### Priority 2: Strategy Improvements

#### 2.1 Add Breakout Momentum Strategy
```typescript
// New strategy class in strategies.ts
class BreakoutStrategy extends TradingStrategy {
  // Entry: price breaks 20-period high + volume 150% above average
  // Stop: opposite side of breakout range
  // Target: 2x risk reward
}
```

#### 2.2 Regime-Aware Strategy Activation
```typescript
// Modify EnsembleStrategy in ml.ts
// Only activate strategies suitable for current regime
const regimeStrategyMap = {
  trending_up: ['trend_following', 'arbitrage'],
  trending_down: ['trend_following', 'arbitrage'],
  ranging: ['mean_reversion', 'grid_trading'],
  volatile: ['mean_reversion', 'grid_trading'],
  breakout: ['trend_following', 'breakout']
};
```

#### 2.3 Multi-Indicator Consensus
```typescript
// Require 2-3 indicators to agree before generating signal
function validateSignalConsensus(indicators: TechnicalIndicators): boolean {
  const signals = [
    indicators.rsiSignal,    // RSI overbought/oversold
    indicators.macdSignal,  // MACD crossover
    indicators.emaSignal    // EMA crossover
  ];
  const agreeCount = signals.filter(s => s !== 'neutral').length;
  return agreeCount >= 2;  // Require at least 2
}
```

### Priority 3: Backtesting Improvements

#### 3.1 Walk-Forward Validation
```typescript
// New module: backtesting/walkforward.ts
interface WalkForwardConfig {
  inSampleMonths: number;  // e.g., 6
  outSampleMonths: number; // e.g., 3
  stepMonths: number;      // e.g., 1
  iterations: number;
}

function runWalkForwardValidation(
  strategy: TradingStrategy,
  data: OHLCV[],
  config: WalkForwardConfig
): WalkForwardResult[] {
  // Divide data into rolling windows
  // Optimize on in-sample, validate on out-of-sample
  // Track performance across all windows
}
```

#### 3.2 Stress Testing
```typescript
// New function in backtest.ts
interface StressTestScenario {
  name: string;
  period: { start: Date; end: Date };
  expectedRegime: string;
}

const stressScenarios: StressTestScenario[] = [
  { name: 'COVID Crash', period: { start: '2020-02-20', end: '2020-03-23' }, expectedRegime: 'volatile' },
  { name: 'Bull Run 2021', period: { start: '2020-10-01', end: '2021-04-15' }, expectedRegime: 'trending_up' },
  { name: 'Bear Market 2022', period: { start: '2022-01-01', end: '2022-12-31' }, expectedRegime: 'trending_down' },
  // etc.
];
```

### Priority 4: Machine Learning Integration

#### 4.1 Random Forest Direction Prediction
```typescript
// New module: ml/random-forest.ts
// Features: lagged returns, volume, RSI, MACD, Bollinger position
// Output: binary classification (up/down)
// Training: weekly retraining on recent data
```

#### 4.2 Ensemble Model Architecture
```typescript
// Combine multiple models with weighted voting
interface EnsembleConfig {
  models: {
    lstm: { weight: 0.4, enabled: boolean };
    randomForest: { weight: 0.25, enabled: boolean };
    xgboost: { weight: 0.25, enabled: boolean };
    technical: { weight: 0.1, enabled: boolean };
  };
  minConfidence: number;
}
```

#### 4.3 Multi-Timeframe Analysis
```typescript
// Require alignment across timeframes
interface MultiTimeframeSignal {
  tf15m: { regime: string; signal: Direction };
  tf1h: { regime: string; signal: Direction };
  tf4h: { regime: string; signal: Direction };
  consensus: Direction;
  confidence: number;
}
```

### Priority 5: Alternative Data

#### 5.1 Congressional Trading Integration
```typescript
// New module: data/congress.ts
// Fetch from https://www.congress.gov/legislation
// Parse PTR (Political Trading Reports)
// Trigger on 3+ crypto-related filings
```

#### 5.2 News Sentiment Analysis
```typescript
// New module: data/sentiment.ts
// Fetch from crypto news APIs
// Use keyword scoring or LLM for sentiment
// Apply 4-hour decay window for signal weighting
```

---

## Implementation Roadmap

### Phase 1: Risk Management (Week 1-2)

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 1.1 | Add weekly loss limit circuit breaker | TODO | P0 |
| 1.2 | Add consecutive loss limit (5 losses → pause) | TODO | P0 |
| 1.3 | Implement confidence-based position sizing | TODO | P0 |
| 1.4 | Add breakeven move and trailing stop phases | TODO | P1 |
| 1.5 | Add portfolio-level exposure correlation check | TODO | P1 |
| 1.6 | Implement drawdown-based position scaling | TODO | P2 |

### Phase 2: Strategy Improvements (Week 3-4)

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 2.1 | Add Breakout Momentum strategy | TODO | P1 |
| 2.2 | Implement regime-aware strategy activation | TODO | P1 |
| 2.3 | Add multi-indicator consensus requirement | TODO | P1 |
| 2.4 | Add Choppiness Index for range detection | TODO | P2 |
| 2.5 | Volume confirmation filter for all signals | TODO | P2 |

### Phase 3: Backtesting (Week 5-6)

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 3.1 | Implement walk-forward validation | TODO | P1 |
| 3.2 | Add stress test scenarios | TODO | P1 |
| 3.3 | Add parameter optimization framework | TODO | P2 |
| 3.4 | Create performance analytics dashboard | TODO | P2 |

### Phase 4: ML Integration (Week 7-10)

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 4.1 | Add Random Forest model for direction prediction | TODO | P1 |
| 4.2 | Implement ensemble voting | TODO | P1 |
| 4.3 | Add multi-timeframe analysis | TODO | P1 |
| 4.4 | Implement weekly model retraining | TODO | P2 |
| 4.5 | Add LSTM for volatility prediction | TODO | P2 |

### Phase 5: Alternative Data (Week 11-12)

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 5.1 | Add congressional trading tracker | TODO | P2 |
| 5.2 | Implement news sentiment analysis | TODO | P2 |
| 5.3 | Add FOMC/SEC event detection | TODO | P2 |

### Phase 6: Production Hardening (Week 13-14)

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 6.1 | Add comprehensive logging | TODO | P1 |
| 6.2 | Implement health monitoring | TODO | P1 |
| 6.3 | Add performance alerts | TODO | P1 |
| 6.4 | Create deployment documentation | TODO | P2 |

---

## Risk Management Framework

### Position Sizing Rules

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        POSITION SIZING DECISION TREE                    │
└─────────────────────────────────────────────────────────────────────────┘

Start: Calculate risk amount
├── Base risk = 1-2% of capital
│
Check signal confidence
├── High confidence (≥0.8) → Risk = 2%
├── Medium confidence (≥0.6) → Risk = 1%
└── Low confidence (<0.6) → Risk = 0.5%

Calculate stop loss distance
├── Use ATR × 2 for stop distance
└── If stop > 4% of price, reduce position

Calculate position size
├── positionSize = riskAmount / stopDistance
├── Enforce max position = maxPositionSize % of capital
└── Enforce total exposure < 80% of capital

Execute trade
```

### Circuit Breaker Rules

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CIRCUIT BREAKER MATRIX                           │
├───────────────────┬──────────────┬─────────────┬────────────────────────┤
│ Trigger           │ Threshold    │ Severity    │ Action                │
├───────────────────┼──────────────┼─────────────┼────────────────────────┤
│ Daily Loss        │ -5%          │ Warning     │ Log + Alert           │
│ Daily Loss        │ -7%          │ Critical    │ Stop all trading      │
│ Weekly Loss       │ -10%         │ Critical    │ Stop all trading      │
│ Drawdown          │ -10%         │ Warning     │ Reduce position by 50%│
│ Drawdown          │ -15%         │ Critical    │ Stop all trading      │
│ Consecutive Loss  │ 5            │ Warning     │ Pause for 1 hour      │
│ Consecutive Loss  │ 10           │ Critical    │ Stop + review         │
│ Max Positions     │ 15           │ Warning     │ No new positions      │
│ Volatility Spike  │ 3x avg       │ Warning     │ Reduce exposure 50%   │
└───────────────────┴──────────────┴─────────────┴────────────────────────┘
```

### Stop Loss Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STOP LOSS PHASE MANAGEMENT                         │
└─────────────────────────────────────────────────────────────────────────┘

Phase 1: Initial Stop (at entry)
└── Set at: entryPrice ± (ATR × 2)

Phase 2: Breakeven Move (at 1R profit)
└── Move stop to: entryPrice
└── Lock in zero-risk position

Phase 3: Trailing Stop (at 2R profit)
└── Trail with: ATR × 1.5
└── Move stop up as price increases

Phase 4: Time Exit (if no profit after 48h)
└── Exit if: profit < 0% after 48 hours
└── Prevents "holding forever" scenario
```

---

## Strategy Selection Logic

### Regime-to-Strategy Mapping

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    REGIME DETECTION & STRATEGY SELECTION                │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: Calculate Hurst Exponent (H)
├── H < 0.45 → Mean-reverting regime
├── H > 0.55 → Trending regime
└── H ≈ 0.50 → Random walk regime

Step 2: Calculate supporting indicators
├── EMA slope (trend direction)
├── RSI (overbought/oversold)
├── MACD histogram (momentum)
├── ATR % (volatility)
└── Volume profile (participation)

Step 3: Classify regime
├── trending_up: H > 0.55 + EMA slope > 0
├── trending_down: H > 0.55 + EMA slope < 0
├── ranging: H < 0.45
├── volatile: high ATR + no clear direction
└── breakout: high ATR + large price move

Step 4: Select strategies
├── trending_up → [Trend Following, Arbitrage]
├── trending_down → [Trend Following, Arbitrage]
├── ranging → [Mean Reversion, Grid Trading]
├── volatile → [Mean Reversion, Grid Trading]
└── breakout → [Trend Following, Breakout]

Step 5: Calculate weights (PPO optimizer)
├── Base weight from historical performance
├── Adjust for regime match (+20%)
├── Adjust for regime mismatch (-10%)
└── Normalize to sum to 1.0
```

### Signal Confidence Calculation

```
confidence = baseConfidence × strategyWeight × hurstConfidence + sentimentBoost

Where:
├── baseConfidence: Strategy-specific (0.6-0.95)
├── strategyWeight: From PPO optimizer (0.0-1.0)
├── hurstConfidence: 1.0 if H ≠ 0.5, 0.75 if H ≈ 0.5
├── regimeBoost: +0.2 if regime matches, -0.1 otherwise
└── sentimentBoost: From Fear & Greed Index (variable)

Filter: Only execute signals with confidence > 0.5
```

---

## Testing and Validation

### Backtesting Standards

```yaml
Minimum Backtest Requirements:
  - Duration: 200+ days
  - Trade Count: 100+ trades
  - Fee Modeling: 0.1% taker + 0.05% slippage
  - Regime Coverage: All regimes represented
  - Out-of-Sample: Minimum 20% held back

Performance Thresholds:
  - Profit Factor: > 1.5
  - Sharpe Ratio: > 1.0
  - Max Drawdown: < 20%
  - Win Rate: Depends on R:R (40%+ with 2:1)
  - Recovery Factor: > 1.5

Stress Test Requirements:
  - COVID Crash (Mar 2020)
  - Bull Run (Oct 2020 - Apr 2021)
  - Bear Market (2022)
  - High Volatility Periods
  - Low Liquidity Periods
```

### Walk-Forward Validation Protocol

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WALK-FORWARD VALIDATION                           │
└─────────────────────────────────────────────────────────────────────────┘

Year 1 (2023):
├── Jan-Jun: Optimize parameters
├── Jul-Sep: Test (holdout)
├── Jul-Sep: Validate results
└── Repeat for each 3-month window

Acceptance Criteria:
├── All windows profitable OR
├── Majority profitable with acceptable max drawdown
├── No regime with catastrophic failure
└── Consistent performance across windows
```

### Paper Trading Validation

```
Phase 1: Paper Trading (2-4 weeks)
├── Run on testnet with real market data
├── Match backtest performance (within 10%)
├── Verify order execution quality
├── Monitor circuit breaker behavior
└── Document any discrepancies

Transition to Live:
├── If paper trading matches backtest
├── If risk metrics behave as expected
├── If no technical issues for 2+ weeks
└── Then consider live trading with small capital
```

---

## Configuration Reference

### Risk Configuration

```typescript
const riskConfig: RiskConfig = {
  // Capital management
  capital: 100000,           // Starting capital in USDT
  
  // Position limits
  maxPositionSize: 2,        // Max % of capital per position
  maxOpenPositions: 10,      // Maximum concurrent positions
  
  // Loss limits
  maxDailyLoss: 7,          // Daily loss limit (%)
  maxWeeklyLoss: 10,         // Weekly loss limit (%)
  maxDrawdown: 15,          // Maximum drawdown from peak (%)
  
  // Trade parameters
  riskPerTrade: 2,          // Risk per trade (%)
  defaultStopLoss: 3,       // Default stop loss (%)
  defaultTakeProfit: 6,     // Default take profit (%)
  
  // Circuit breaker sensitivity
  consecutiveLossLimit: 5,  // Pause after X consecutive losses
  warningDrawdown: 10,      // Warning threshold (%)
  criticalDrawdown: 15      // Critical threshold (%)
};
```

### Strategy Configuration

```typescript
const strategyConfig: StrategyConfig = {
  id: 1,
  name: "BTC Trend Hunter",
  type: "trend_following",
  symbol: "BTCUSDT",
  timeframe: "1h",
  weight: 0.2,              // Allocation weight (0-1)
  isActive: true,
  parameters: {
    // Trend Following
    fastPeriod: 20,
    slowPeriod: 50,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    
    // Mean Reversion
    bbPeriod: 20,
    bbStdDev: 2,
    
    // Grid Trading
    gridLevels: 10,
    gridRange: 0.05,
    
    // Arbitrage
    lookback: 20,
    threshold: 0.003,
    
    // Market Making
    spread: 0.001,
    depth: 3
  }
};
```

---

## Appendix: Key Metrics Formulas

### Sharpe Ratio
```
Sharpe = (Average Return - Risk-Free Rate) / Standard Deviation

Common approximation:
Sharpe = (Total Return / Number of Periods) / (StdDev of Returns × √Periods)
```

### Profit Factor
```
Profit Factor = Gross Profit / Gross Loss

Interpretation:
- < 1.0: Losing strategy
- 1.0-1.5: Marginal
- 1.5-2.0: Good
- > 2.0: Excellent
```

### Maximum Drawdown
```
Drawdown = (Peak - Valley) / Peak

Recovery Required = Drawdown / (1 - Drawdown)
- 10% drawdown → 11.1% gain to recover
- 20% drawdown → 25% gain to recover
- 50% drawdown → 100% gain to recover
```

### Kelly Criterion
```
Kelly % = W - (1-W) / R

Where:
- W = Win probability (win rate)
- R = Win/Loss ratio (average win / average loss)

Fractional Kelly = Kelly % × 0.5 (for safety)
```

---

## Glossary

| Term | Definition |
|------|------------|
| ATR | Average True Range - volatility measure |
| Backtest | Historical simulation of strategy |
| Circuit Breaker | Automatic trading halt on risk thresholds |
| Drawdown | Peak-to-trough decline in equity |
| EMA | Exponential Moving Average |
| Hurst Exponent | Measure of trend vs mean-reversion |
| Kelly Criterion | Optimal position sizing formula |
| OHLCV | Open, High, Low, Close, Volume |
| PPO | Proximal Policy Optimization |
| R/R | Reward to Risk ratio |
| RSI | Relative Strength Index |
| Sharpe Ratio | Risk-adjusted return measure |
| SMA | Simple Moving Average |
| Walk-Forward | Rolling window validation technique |

---

*Last Updated: April 2026*
*Version: 1.0*
*Status: Implementation In Progress*
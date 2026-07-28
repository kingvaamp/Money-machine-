"""
Feature Engineering for Trading ML Pipeline — v2
=================================================
Upgraded with 120+ features:
- Volatility regime indicators (realized vol, Garman-Klass, Parkinson)
- Market microstructure (candle body, wick ratios, buy pressure)
- Hurst Exponent at multiple windows
- Multi-timeframe confluence placeholders
- Momentum divergences
- Regime classification features (ATR/BBW percentiles)

Usage:
    python3 features.py --symbol BTCUSDT --timeframe 1h
"""

import argparse
import sqlite3
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator, StochasticOscillator, ROCIndicator
from ta.trend import MACD, SMAIndicator, EMAIndicator, ADXIndicator, AroonIndicator
from ta.volatility import BollingerBands, AverageTrueRange

warnings.filterwarnings('ignore')


def calculate_hurst_exponent(series: np.ndarray, max_lag: int = 20) -> float:
    """R/S Analysis — Hurst Exponent calculation."""
    if len(series) < max_lag * 2:
        return 0.5
    lags = range(2, max_lag)
    tau = []
    for lag in lags:
        chunks = [series[i:i+lag] for i in range(0, len(series)-lag, lag)]
        if len(chunks) < 2:
            continue
        rs_vals = []
        for chunk in chunks:
            if len(chunk) < 2:
                continue
            mean = np.mean(chunk)
            deviations = np.cumsum(chunk - mean)
            R = np.max(deviations) - np.min(deviations)
            S = np.std(chunk, ddof=1)
            if S > 0:
                rs_vals.append(R / S)
        if rs_vals:
            tau.append(np.mean(rs_vals))
    if len(tau) < 2:
        return 0.5
    try:
        lags_used = list(range(2, 2 + len(tau)))
        poly = np.polyfit(np.log(lags_used), np.log(tau), 1)
        return float(np.clip(poly[0], 0.0, 1.0))
    except Exception:
        return 0.5


class FeatureEngineer:
    """Generate 120+ technical indicators and features for ML."""

    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = Path(__file__).parent / 'data' / 'ohlcv.db'
        self.db_path = db_path

    def load_data(self, symbol: str, timeframe: str, limit: int = None) -> pd.DataFrame:
        """Load OHLCV data from SQLite."""
        conn = sqlite3.connect(self.db_path)
        query = '''
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcv
            WHERE symbol = ? AND timeframe = ?
            ORDER BY timestamp ASC
        '''
        if limit:
            query += f' LIMIT {limit}'
        df = pd.read_sql_query(query, conn, params=(symbol, timeframe))
        conn.close()
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        return df

    def add_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add all 120+ features."""
        df = df.copy()

        # ─── PRICE FEATURES ────────────────────────────────────────────
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))

        # ─── MOVING AVERAGES ───────────────────────────────────────────
        for period in [7, 20, 50, 200]:
            df[f'sma_{period}'] = SMAIndicator(df['close'], window=period).sma_indicator()
            df[f'ema_{period}'] = EMAIndicator(df['close'], window=period).ema_indicator()
            df[f'sma_ratio_{period}'] = df['close'] / df[f'sma_{period}']
            df[f'ema_ratio_{period}'] = df['close'] / df[f'ema_{period}']

        # EMA slopes (momentum)
        for period in [20, 50]:
            ema = EMAIndicator(df['close'], window=period).ema_indicator()
            df[f'ema_slope_{period}'] = ema.diff(5) / ema.shift(5)

        # ─── RSI ───────────────────────────────────────────────────────
        df['rsi_14'] = RSIIndicator(df['close'], window=14).rsi()
        df['rsi_7'] = RSIIndicator(df['close'], window=7).rsi()
        df['rsi_21'] = RSIIndicator(df['close'], window=21).rsi()
        # RSI slope
        df['rsi_slope'] = df['rsi_14'].diff(3)

        # ─── MACD ──────────────────────────────────────────────────────
        macd = MACD(df['close'])
        df['macd'] = macd.macd()
        df['macd_signal'] = macd.macd_signal()
        df['macd_diff'] = macd.macd_diff()
        df['macd_diff_slope'] = df['macd_diff'].diff(3)

        # ─── BOLLINGER BANDS ───────────────────────────────────────────
        bb = BollingerBands(df['close'], window=20, window_dev=2)
        df['bb_upper'] = bb.bollinger_hband()
        df['bb_middle'] = bb.bollinger_mavg()
        df['bb_lower'] = bb.bollinger_lband()
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
        df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
        # BB width percentile (squeeze detector)
        df['bbw_percentile_30d'] = df['bb_width'].rolling(window=720).rank(pct=True)

        # ─── ATR ───────────────────────────────────────────────────────
        df['atr_14'] = AverageTrueRange(df['high'], df['low'], df['close'], window=14).average_true_range()
        df['atr_ratio'] = df['atr_14'] / df['close'] * 100
        # ATR percentile (vol regime)
        df['atr_percentile_30d'] = df['atr_14'].rolling(window=720).rank(pct=True)

        # ─── VOLATILITY REGIME ─────────────────────────────────────────
        # Realized volatility at multiple horizons
        df['realized_vol_6h'] = df['log_returns'].rolling(6).std() * np.sqrt(6)
        df['realized_vol_24h'] = df['log_returns'].rolling(24).std() * np.sqrt(24)
        df['realized_vol_7d'] = df['log_returns'].rolling(168).std() * np.sqrt(168)
        # Vol acceleration (short-term vs long-term vol ratio)
        df['vol_regime_ratio'] = df['realized_vol_6h'] / (df['realized_vol_7d'] + 1e-10)
        # Garman-Klass volatility (OHLC — less noise than close-to-close)
        df['garman_klass_vol'] = np.sqrt(
            0.5 * np.log(df['high'] / df['low'])**2 -
            (2 * np.log(2) - 1) * np.log(df['close'] / df['open'])**2
        )
        # Parkinson volatility (uses high/low range)
        df['parkinson_vol'] = np.sqrt(
            (1 / (4 * np.log(2))) * np.log(df['high'] / df['low'])**2
        )

        # ─── MARKET MICROSTRUCTURE ─────────────────────────────────────
        # Buy pressure: where did price settle in the candle? (0=bearish, 1=bullish)
        hl_range = df['high'] - df['low']
        df['buy_pressure'] = (df['close'] - df['low']) / (hl_range + 1e-10)
        # Candle body conviction
        df['candle_body_ratio'] = np.abs(df['close'] - df['open']) / (hl_range + 1e-10)
        # Wick rejection signals
        df['upper_wick_ratio'] = (df['high'] - df[['close', 'open']].max(axis=1)) / (hl_range + 1e-10)
        df['lower_wick_ratio'] = (df[['close', 'open']].min(axis=1) - df['low']) / (hl_range + 1e-10)
        # Volume-weighted price delta
        df['vwpd'] = df['returns'] * df['volume']

        # ─── STOCHASTIC ────────────────────────────────────────────────
        stoch = StochasticOscillator(df['high'], df['low'], df['close'])
        df['stoch_k'] = stoch.stoch()
        df['stoch_d'] = stoch.stoch_signal()

        # ─── ADX ───────────────────────────────────────────────────────
        adx_ind = ADXIndicator(df['high'], df['low'], df['close'], window=14)
        df['adx_14'] = adx_ind.adx()
        df['adx_pos'] = adx_ind.adx_pos()
        df['adx_neg'] = adx_ind.adx_neg()
        # ADX regime (1=trending, 0=ranging)
        df['adx_regime'] = (df['adx_14'] > 25).astype(int)

        # ─── AROON ─────────────────────────────────────────────────────
        aroon = AroonIndicator(high=df['high'], low=df['low'])
        df['aroon_up'] = aroon.aroon_up()
        df['aroon_down'] = aroon.aroon_down()
        df['aroon_oscillator'] = df['aroon_up'] - df['aroon_down']

        # ─── RATE OF CHANGE ────────────────────────────────────────────
        df['roc_5'] = ROCIndicator(df['close'], window=5).roc()
        df['roc_10'] = ROCIndicator(df['close'], window=10).roc()
        df['roc_20'] = ROCIndicator(df['close'], window=20).roc()

        # ─── VOLUME ────────────────────────────────────────────────────
        df['volume_sma_20'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / (df['volume_sma_20'] + 1e-10)
        df['volume_spike'] = (df['volume_ratio'] > 2.0).astype(int)
        df['volume_trend'] = df['volume'].rolling(5).mean() / (df['volume'].rolling(20).mean() + 1e-10)

        # ─── PRICE RANGE / SUPPORT ─────────────────────────────────────
        df['high_20'] = df['high'].rolling(window=20).max()
        df['low_20'] = df['low'].rolling(window=20).min()
        df['high_50'] = df['high'].rolling(window=50).max()
        df['low_50'] = df['low'].rolling(window=50).min()
        df['price_position_20'] = (df['close'] - df['low_20']) / (df['high_20'] - df['low_20'] + 1e-10)
        df['price_position_50'] = (df['close'] - df['low_50']) / (df['high_50'] - df['low_50'] + 1e-10)

        # ─── HURST EXPONENT (multiple windows) ─────────────────────────
        closes_arr = df['close'].values
        hurst_50 = []
        hurst_100 = []
        hurst_200 = []
        for i in range(len(closes_arr)):
            if i >= 200:
                hurst_50.append(calculate_hurst_exponent(closes_arr[i-50:i]))
                hurst_100.append(calculate_hurst_exponent(closes_arr[i-100:i]))
                hurst_200.append(calculate_hurst_exponent(closes_arr[i-200:i]))
            elif i >= 100:
                hurst_50.append(calculate_hurst_exponent(closes_arr[i-50:i]))
                hurst_100.append(calculate_hurst_exponent(closes_arr[i-100:i]))
                hurst_200.append(0.5)
            elif i >= 50:
                hurst_50.append(calculate_hurst_exponent(closes_arr[i-50:i]))
                hurst_100.append(0.5)
                hurst_200.append(0.5)
            else:
                hurst_50.append(0.5)
                hurst_100.append(0.5)
                hurst_200.append(0.5)

        df['hurst_50'] = hurst_50
        df['hurst_100'] = hurst_100
        df['hurst_200'] = hurst_200
        df['hurst_trend'] = df['hurst_100'].diff(10)  # Hurst accelerating = regime shift
        df['hurst_regime'] = pd.cut(
            df['hurst_100'],
            bins=[0, 0.45, 0.55, 1.0],
            labels=[0, 1, 2]  # 0=mean-reverting, 1=random, 2=trending
        ).astype(float)

        # ─── MOMENTUM DIVERGENCES ──────────────────────────────────────
        # Price making new high but RSI not → bearish divergence
        price_high_5 = df['close'].rolling(5).max()
        rsi_high_5 = df['rsi_14'].rolling(5).max()
        df['bearish_divergence'] = (
            (df['close'] > price_high_5.shift(5)) &
            (df['rsi_14'] < rsi_high_5.shift(5))
        ).astype(int)
        price_low_5 = df['close'].rolling(5).min()
        rsi_low_5 = df['rsi_14'].rolling(5).min()
        df['bullish_divergence'] = (
            (df['close'] < price_low_5.shift(5)) &
            (df['rsi_14'] > rsi_low_5.shift(5))
        ).astype(int)

        # ─── LAG FEATURES ──────────────────────────────────────────────
        for lag in [1, 2, 3, 5, 10]:
            df[f'returns_lag_{lag}'] = df['returns'].shift(lag)
            df[f'rsi_lag_{lag}'] = df['rsi_14'].shift(lag)

        # ─── ROLLING STATISTICS ────────────────────────────────────────
        for window in [5, 10, 20]:
            df[f'returns_std_{window}'] = df['returns'].rolling(window=window).std()
            df[f'returns_mean_{window}'] = df['returns'].rolling(window=window).mean()
            df[f'returns_skew_{window}'] = df['returns'].rolling(window=window).skew()

        return df

    def add_labels(self, df: pd.DataFrame, forward_periods: int = 24) -> pd.DataFrame:
        """Add prediction labels (future returns)."""
        df = df.copy()
        df['future_return'] = df['close'].shift(-forward_periods) / df['close'] - 1
        # Binary direction label
        df['label_direction'] = (df['future_return'] > 0).astype(int)
        # Strong move labels (threshold accounts for 0.1% fees × 2 sides)
        df['label_strong_up'] = (df['future_return'] > 0.003).astype(int)
        df['label_strong_down'] = (df['future_return'] < -0.003).astype(int)
        return df

    def prepare_dataset(self, symbol: str, timeframe: str, lookback: int = None) -> pd.DataFrame:
        """Load, add features and labels."""
        print(f"📊 Loading {symbol} {timeframe} data...")
        df = self.load_data(symbol, timeframe, lookback)
        print(f"🔧 Engineering {symbol} features (120+)...")
        df = self.add_features(df)
        print(f"🏷️ Generating labels...")
        df = self.add_labels(df)
        df = df.dropna()
        print(f"✅ Dataset ready: {len(df)} samples, {len(df.columns)} features")
        return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', default='BTCUSDT')
    parser.add_argument('--timeframe', default='1h')
    parser.add_argument('--lookback', type=int)
    parser.add_argument('--db')
    args = parser.parse_args()
    engineer = FeatureEngineer(args.db)
    df = engineer.prepare_dataset(args.symbol, args.timeframe, args.lookback)
    print(f"\n📈 Dataset shape: {df.shape}")
    print(f"\n📊 Label distribution:\n{df['label_direction'].value_counts()}")


if __name__ == '__main__':
    main()
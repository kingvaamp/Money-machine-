"""
Feature Engineering for Trading ML Pipeline
============================================
Generates technical indicators and features from OHLCV data.

Usage:
    python3 features.py --symbol BTCUSDT --timeframe 1h --lookback 500
"""

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator, StochasticOscillator, ROCIndicator
from ta.trend import MACD, SMAIndicator, EMAIndicator, ADXIndicator, AroonIndicator
from ta.volatility import BollingerBands, AverageTrueRange


class FeatureEngineer:
    """Generate technical indicators and features for ML."""
    
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
        
        # Convert timestamp to datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        return df
    
    def add_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add technical indicators as features."""
        df = df.copy()
        
        # Price-based features
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        # Moving averages
        for period in [7, 20, 50, 200]:
            df[f'sma_{period}'] = SMAIndicator(df['close'], window=period).sma_indicator()
            df[f'ema_{period}'] = EMAIndicator(df['close'], window=period).ema_indicator()
            df[f'sma_ratio_{period}'] = df['close'] / df[f'sma_{period}']
        
        # RSI
        df['rsi_14'] = RSIIndicator(df['close'], window=14).rsi()
        df['rsi_7'] = RSIIndicator(df['close'], window=7).rsi()
        
        # MACD
        macd = MACD(df['close'])
        df['macd'] = macd.macd()
        df['macd_signal'] = macd.macd_signal()
        df['macd_diff'] = macd.macd_diff()
        
        # Bollinger Bands
        bb = BollingerBands(df['close'], window=20, window_dev=2)
        df['bb_upper'] = bb.bollinger_hband()
        df['bb_middle'] = bb.bollinger_mavg()
        df['bb_lower'] = bb.bollinger_lband()
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
        df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
        
        # ATR (volatility)
        df['atr_14'] = AverageTrueRange(df['high'], df['low'], df['close'], window=14).average_true_range()
        df['atr_ratio'] = df['atr_14'] / df['close'] * 100
        
        # Stochastic
        stoch = StochasticOscillator(df['high'], df['low'], df['close'])
        df['stoch_k'] = stoch.stoch()
        df['stoch_d'] = stoch.stoch_signal()
        
        # ADX (trend strength)
        df['adx_14'] = ADXIndicator(df['high'], df['low'], df['close'], window=14).adx()
        
        # Aroon (trend changes) - using high and low
        aroon = AroonIndicator(high=df['high'], low=df['low'])
        df['aroon_up'] = aroon.aroon_up()
        df['aroon_down'] = aroon.aroon_down()
        df['aroon_oscillator'] = df['aroon_up'] - df['aroon_down']
        
        # Rate of Change
        df['roc_10'] = ROCIndicator(df['close'], window=10).roc()
        df['roc_20'] = ROCIndicator(df['close'], window=20).roc()
        
        # Volume features
        df['volume_sma_20'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma_20']
        
        # Price position features
        df['high_20'] = df['high'].rolling(window=20).max()
        df['low_20'] = df['low'].rolling(window=20).min()
        df['price_position'] = (df['close'] - df['low_20']) / (df['high_20'] - df['low_20'])
        
        # Lag features
        for lag in [1, 2, 3, 5, 10]:
            df[f'close_lag_{lag}'] = df['close'].shift(lag)
            df[f'returns_lag_{lag}'] = df['returns'].shift(lag)
        
        # Rolling statistics
        for window in [5, 10, 20]:
            df[f'returns_std_{window}'] = df['returns'].rolling(window=window).std()
            df[f'returns_mean_{window}'] = df['returns'].rolling(window=window).mean()
        
        return df
    
    def add_labels(self, df: pd.DataFrame, forward_periods: int = 24) -> pd.DataFrame:
        """Add prediction labels (future returns)."""
        df = df.copy()
        
        # Future returns (next N periods)
        df['future_return'] = df['close'].shift(-forward_periods) / df['close'] - 1
        
        # Binary labels
        df['label_direction'] = (df['future_return'] > 0).astype(int)  # 1 = up, 0 = down
        df['label_strong_up'] = (df['future_return'] > 0.02).astype(int)  # >2% up
        df['label_strong_down'] = (df['future_return'] < -0.02).astype(int)  # >2% down
        
        return df
    
    def prepare_dataset(self, symbol: str, timeframe: str, lookback: int = None) -> pd.DataFrame:
        """Load, add features and labels."""
        print(f"📊 Loading {symbol} {timeframe} data...")
        df = self.load_data(symbol, timeframe, lookback)
        
        print(f"🔧 Engineering features...")
        df = self.add_features(df)
        
        print(f"🏷️ Generating labels...")
        df = self.add_labels(df)
        
        # Drop NaN rows (from indicators)
        df = df.dropna()
        
        print(f"✅ Dataset ready: {len(df)} samples, {len(df.columns)} features")
        
        return df
    
    def get_feature_columns(self) -> list:
        """Return list of feature column names."""
        exclude = ['timestamp', 'open', 'high', 'low', 'close', 'volume',
                   'future_return', 'label_direction', 'label_strong_up', 'label_strong_down']
        return None  # Will be dynamically determined


def main():
    parser = argparse.ArgumentParser(description='Generate features from OHLCV data')
    parser.add_argument('--symbol', default='BTCUSDT', help='Trading symbol')
    parser.add_argument('--timeframe', default='1h', help='Timeframe')
    parser.add_argument('--lookback', type=int, help='Number of candles to load')
    parser.add_argument('--db', help='Path to database')
    
    args = parser.parse_args()
    
    engineer = FeatureEngineer(args.db)
    df = engineer.prepare_dataset(args.symbol, args.timeframe, args.lookback)
    
    print(f"\n📈 Dataset shape: {df.shape}")
    print(f"📋 Columns: {df.columns.tolist()[:20]}...")
    print(f"\n📊 Label distribution:")
    print(df['label_direction'].value_counts())


if __name__ == '__main__':
    main()
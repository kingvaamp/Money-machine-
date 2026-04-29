"""
Alternative: Fetch and Store Historical Data using SQLite
=========================================================
Since QuestDB requires a running server, this script uses 
SQLite with optimized time-series storage.

Usage:
    python3 fetch_data.py --symbol BTCUSDT --timeframe 1h --years 2
"""

import argparse
import csv
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import ccxt
import pandas as pd


class HistoricalDataFetcher:
    """Fetch and store historical OHLCV data."""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = Path(__file__).parent / 'data' / 'ohlcv.db'
        self.db_path = db_path
        self.db_path.parent.mkdir(exist_ok=True)
        
        self.exchange = ccxt.binance({
            'enableRateLimit': True,
            'options': {'defaultType': 'spot'}
        })
    
    def init_database(self):
        """Initialize SQLite database with OHLCV table."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ohlcv (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(symbol, timeframe, timestamp)
            )
        ''')
        
        # Create indexes for fast querying
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_symbol_time ON ohlcv(symbol, timeframe)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON ohlcv(timestamp)')
        
        conn.commit()
        conn.close()
        print(f"✅ Database initialized: {self.db_path}")
    
    def fetch_and_store(self, symbol: str, timeframe: str, years: int = 2):
        """Fetch historical data and store in database."""
        # Calculate start date
        start_date = datetime.now() - timedelta(days=years*365)
        
        print(f"\n{'='*60}")
        print(f"📥 Fetching {years} years of {symbol} ({timeframe}) data...")
        print(f"{'='*60}\n")
        
        all_data = []
        since = int(start_date.timestamp() * 1000)
        
        # Fetch in batches
        batch_count = 0
        while True:
            try:
                ohlcv = self.exchange.fetch_ohlcv(
                    symbol.replace('/', ''),
                    timeframe,
                    since=since,
                    limit=1000
                )
                
                if not ohlcv:
                    break
                
                all_data.extend(ohlcv)
                batch_count += 1
                print(f"  Batch {batch_count}: {len(ohlcv)} candles (total: {len(all_data)})")
                
                # Update since for next batch
                since = ohlcv[-1][0] + 1
                
                # Limit to prevent infinite loop
                if len(all_data) > years * 365 * 24 * 60:  # Rough max
                    break
                    
            except Exception as e:
                print(f"⚠️ Error: {e}")
                break
        
        if not all_data:
            print("❌ No data fetched")
            return 0
        
        # Store in database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        inserted = 0
        skipped = 0
        
        for row in all_data:
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO ohlcv 
                    (symbol, timeframe, timestamp, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    symbol.replace('/', ''),
                    timeframe,
                    row[0],
                    row[1], row[2], row[3], row[4], row[5]
                ))
                inserted += 1
            except:
                skipped += 1
        
        conn.commit()
        conn.close()
        
        print(f"\n✅ Stored {inserted} candles ({skipped} duplicates skipped)")
        return len(all_data)
    
    def get_data(self, symbol: str, timeframe: str, limit: int = None):
        """Retrieve data from database."""
        conn = sqlite3.connect(self.db_path)
        
        query = f'''
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcv
            WHERE symbol = ? AND timeframe = ?
            ORDER BY timestamp ASC
        '''
        
        if limit:
            query += f' LIMIT {limit}'
        
        df = pd.read_sql_query(query, conn, params=(symbol.replace('/', ''), timeframe))
        conn.close()
        
        return df
    
    def get_latest(self, symbol: str, timeframe: str) -> dict:
        """Get the most recent candle."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcv
            WHERE symbol = ? AND timeframe = ?
            ORDER BY timestamp DESC
            LIMIT 1
        ''', (symbol.replace('/', ''), timeframe))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                'timestamp': row[0],
                'open': row[1],
                'high': row[2],
                'low': row[3],
                'close': row[4],
                'volume': row[5]
            }
        return None


def main():
    parser = argparse.ArgumentParser(description='Fetch and store historical OHLCV data')
    parser.add_argument('--symbol', default='BTCUSDT', help='Trading symbol')
    parser.add_argument('--timeframe', default='1h', help='Timeframe (1m, 5m, 15m, 1h, 4h, 1d)')
    parser.add_argument('--years', type=int, default=2, help='Number of years to fetch')
    parser.add_argument('--db', help='Path to database file')
    
    args = parser.parse_args()
    
    fetcher = HistoricalDataFetcher(args.db)
    fetcher.init_database()
    fetcher.fetch_and_store(args.symbol, args.timeframe, args.years)
    
    # Display latest data
    latest = fetcher.get_latest(args.symbol, args.timeframe)
    if latest:
        print(f"\n📊 Latest candle:")
        print(f"  Time: {datetime.fromtimestamp(latest['timestamp']/1000)}")
        print(f"  Open: {latest['open']:.2f}")
        print(f"  High: {latest['high']:.2f}")
        print(f"  Low: {latest['low']:.2f}")
        print(f"  Close: {latest['close']:.2f}")
        print(f"  Volume: {latest['volume']:.2f}")


if __name__ == '__main__':
    main()
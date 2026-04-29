"""
QuestDB Data Pipeline for Trading Bot
=====================================
Fetches 2 years of historical OHLCV data from Binance and stores in QuestDB.

Usage:
    python3 pipeline.py --symbol BTCUSDT --timeframe 1h --start 2024-01-01

Author: King Vaamp
Date: April 2026
"""

import argparse
import asyncio
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any

import ccxt
import pandas as pd
import numpy as np
from questdb.ingress import QueuedConnection, SocketTransport
from dotenv import load_dotenv

load_dotenv()


class BinanceDataFetcher:
    """Fetch OHLCV data from Binance."""
    
    def __init__(self):
        self.exchange = ccxt.binance({
            'enableRateLimit': True,
            'options': {'defaultType': 'spot'}
        })
    
    def fetch_ohlcv(
        self, 
        symbol: str, 
        timeframe: str = '1h',
        start_date: str = None,
        end_date: str = None,
        limit: int = 1000
    ) -> List[List[Any]]:
        """Fetch OHLCV data from Binance."""
        since = self.exchange.parse8601(start_date) if start_date else None
        end_ts = self.exchange.parse8601(end_date) if end_date else None
        
        all_ohlcv = []
        while True:
            ohlcv = self.exchange.fetch_ohlcv(
                symbol, 
                timeframe, 
                since=since,
                limit=limit
            )
            
            if not ohlcv:
                break
            
            # Filter by end date if specified
            if end_ts and ohlcv[-1][0] >= end_ts:
                ohlcv = [x for x in ohlcv if x[0] < end_ts]
                all_ohlcv.extend(ohlcv)
                break
            
            all_ohlcv.extend(ohlcv)
            
            # Update since to last timestamp + 1
            since = ohlcv[-1][0] + 1
            
            # Break if we've reached the limit or no more data
            if len(ohlcv) < limit:
                break
        
        return all_ohlcv


class QuestDBConnector:
    """Connect to QuestDB and store OHLCV data."""
    
    def __init__(self, host: str = '127.0.0.1', port: int = 9009):
        self.host = host
        self.port = port
        self.transport = None
        self.conn = None
    
    def connect(self):
        """Establish connection to QuestDB."""
        self.transport = SocketTransport(host=self.host, port=self.port)
        self.conn = QueuedConnection(self.transport)
        print(f"✅ Connected to QuestDB at {self.host}:{self.port}")
    
    def create_table(self, table_name: str = 'ohlcv'):
        """Create OHLCV table if not exists."""
        create_sql = f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            symbol STRING,
            timeframe STRING,
            timestamp TIMESTAMP,
            open DOUBLE,
            high DOUBLE,
            low DOUBLE,
            close DOUBLE,
            volume DOUBLE,
            quote_volume DOUBLE,
            trades INTEGER,
            fetched_at TIMESTAMP
        ) TIMESTAMP(timestamp) PARTITION BY DAY;
        """
        self.conn.execute(create_sql)
        self.conn.commit()
        print(f"✅ Table '{table_name}' created/verified")
    
    def insert_ohlcv(self, data: List[List[Any]], symbol: str, timeframe: str):
        """Insert OHLCV data into QuestDB."""
        if not data:
            print("⚠️ No data to insert")
            return
        
        # Convert to DataFrame for easier processing
        df = pd.DataFrame(data, columns=[
            'timestamp', 'open', 'high', 'low', 'close', 'volume'
        ])
        
        # Add additional fields
        df['symbol'] = symbol
        df['timeframe'] = timeframe
        df['quote_volume'] = df['volume'] * df['close']  # Approximate
        df['trades'] = 0  # CCXT doesn't provide trade count in OHLCV
        df['fetched_at'] = datetime.now()
        
        # Format for QuestDB
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        
        # Insert using QuestDB's pandas API
        self.conn.send_df(
            df,
            table_name='ohlcv',
            symbols=['symbol', 'timeframe'],
            timestamps='timestamp'
        )
        self.conn.commit()
        
        print(f"✅ Inserted {len(df)} rows for {symbol} {timeframe}")
    
    def query(self, sql: str) -> pd.DataFrame:
        """Execute SQL query and return DataFrame."""
        self.conn.execute(sql)
        # For SELECT queries, we need to use execute_and_fetch
        result = self.conn.execute_and_fetch(sql)
        return result
    
    def close(self):
        """Close connection."""
        if self.conn:
            self.conn.close()
        print("🔌 Disconnected from QuestDB")


class OHLCVPipeline:
    """Main pipeline orchestrator."""
    
    def __init__(self, symbol: str, timeframe: str, start_date: str, end_date: str = None):
        self.symbol = symbol
        self.timeframe = timeframe
        self.start_date = start_date
        self.end_date = end_date or datetime.now().strftime('%Y-%m-%d')
        
        self.fetcher = BinanceDataFetcher()
        self.db = QuestDBConnector()
    
    def run(self):
        """Execute the full pipeline."""
        print(f"\n{'='*60}")
        print(f"🚀 OHLCV Data Pipeline Started")
        print(f"{'='*60}")
        print(f"Symbol: {self.symbol}")
        print(f"Timeframe: {self.timeframe}")
        print(f"Start: {self.start_date}")
        print(f"End: {self.end_date}")
        print(f"{'='*60}\n")
        
        # Connect to QuestDB
        self.db.connect()
        self.db.create_table()
        
        # Fetch data from Binance
        print(f"📥 Fetching data from Binance...")
        ohlcv_data = self.fetcher.fetch_ohlcv(
            self.symbol,
            self.timeframe,
            self.start_date,
            self.end_date
        )
        print(f"📊 Retrieved {len(ohlcv_data)} candles")
        
        # Insert into QuestDB
        print(f"💾 Storing in QuestDB...")
        self.db.insert_ohlcv(ohlcv_data, self.symbol, self.timeframe)
        
        # Verify data
        print(f"🔍 Verifying data...")
        result = self.db.query(
            f"SELECT count(*) as total_rows, min(timestamp) as earliest, max(timestamp) as latest "
            f"FROM ohlcv WHERE symbol = '{self.symbol}' AND timeframe = '{self.timeframe}'"
        )
        
        # Close connection
        self.db.close()
        
        print(f"\n{'='*60}")
        print(f"✅ Pipeline Complete!")
        print(f"{'='*60}\n")
        
        return len(ohlcv_data)


def main():
    parser = argparse.ArgumentParser(description='Fetch OHLCV data and store in QuestDB')
    parser.add_argument('--symbol', default='BTC/USDT', help='Trading symbol (default: BTC/USDT)')
    parser.add_argument('--timeframe', default='1h', help='Timeframe (default: 1h)')
    parser.add_argument('--start', default='2024-01-01', help='Start date (default: 2024-01-01)')
    parser.add_argument('--end', help='End date (optional)')
    
    args = parser.parse_args()
    
    # Format symbol for Binance (remove /)
    symbol = args.symbol.replace('/', '')
    
    pipeline = OHLCVPipeline(symbol, args.timeframe, args.start, args.end)
    pipeline.run()


if __name__ == '__main__':
    main()
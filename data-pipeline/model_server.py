"""
ML Model Integration Server
===========================
Loads trained model and provides predictions via HTTP API.

Usage:
    python3 model_server.py

Then in the app, call: http://localhost:8000/predict with OHLCV data.
"""

import argparse
import json
import sqlite3
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

import pickle
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler


class Predictor:
    """Load and run trained ML model."""
    
    def __init__(self, model_dir: str = None):
        if model_dir is None:
            model_dir = Path(__file__).parent / 'models'
        
        self.model_dir = Path(model_dir)
        self.model = None
        self.scaler = None
        self.feature_columns = None
        self.load_model()
    
    def load_model(self):
        """Load trained model and artifacts."""
        model_path = self.model_dir / 'random_forest_direction.pkl'
        scaler_path = self.model_dir / 'random_forest_direction_scaler.pkl'
        features_path = self.model_dir / 'random_forest_direction_features.json'
        
        if not model_path.exists():
            print(f"⚠️ Model not found at {model_path}")
            print(f"   Run: python3 train.py --model random_forest --label direction")
            return
        
        with open(model_path, 'rb') as f:
            self.model = pickle.load(f)
        
        with open(scaler_path, 'rb') as f:
            self.scaler = pickle.load(f)
        
        with open(features_path, 'r') as f:
            self.feature_columns = json.load(f)
        
        print(f"✅ Model loaded: {model_path.name}")
    
    def prepare_features(self, ohlcv_data: list) -> pd.DataFrame:
        """Convert OHLCV list to features matching training."""
        if not ohlcv_data:
            return pd.DataFrame()
        
        df = pd.DataFrame(ohlcv_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        # Generate features (same as training)
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        for period in [7, 20, 50, 200]:
            df[f'sma_{period}'] = df['close'].rolling(window=period).mean()
            df[f'ema_{period}'] = df['close'].ewm(span=period).mean()
            df[f'sma_ratio_{period}'] = df['close'] / df[f'sma_{period}']
        
        # RSI
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi_14'] = 100 - (100 / (1 + rs))
        
        # MACD
        ema12 = df['close'].ewm(span=12).mean()
        ema26 = df['close'].ewm(span=26).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_diff'] = df['macd'] - df['macd_signal']
        
        # Bollinger Bands
        df['bb_middle'] = df['close'].rolling(window=20).mean()
        std = df['close'].rolling(window=20).std()
        df['bb_upper'] = df['bb_middle'] + 2 * std
        df['bb_lower'] = df['bb_middle'] - 2 * std
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
        df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
        
        # ATR
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        df['atr_14'] = tr.rolling(window=14).mean()
        df['atr_ratio'] = df['atr_14'] / df['close'] * 100
        
        # Volume
        df['volume_sma_20'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma_20']
        
        # Drop NaN
        df = df.dropna()
        
        return df
    
    def predict(self, ohlcv_data: list) -> dict:
        """Generate prediction from OHLCV data."""
        if self.model is None:
            return {'error': 'Model not loaded', 'prediction': None, 'confidence': 0}
        
        if not ohlcv_data or len(ohlcv_data) < 50:
            return {'error': 'Insufficient data (need 50+ candles)', 'prediction': None, 'confidence': 0}
        
        df = self.prepare_features(ohlcv_data)
        
        # Get features that match training
        available_features = [c for c in self.feature_columns if c in df.columns]
        
        if len(available_features) < 10:
            return {'error': 'Not enough valid features', 'prediction': None, 'confidence': 0}
        
        X = df[available_features].values
        X = np.nan_to_num(X, nan=0, posinf=0, neginf=0)
        
        X_scaled = self.scaler.transform(X)
        
        # Get last prediction
        prediction = self.model.predict(X_scaled[-1:])[0]
        
        # Get probability
        proba = self.model.predict_proba(X_scaled[-1:])[0]
        confidence = float(max(proba))
        
        label = 'UP' if prediction == 1 else 'DOWN'
        
        return {
            'prediction': label,
            'confidence': confidence,
            'probability_up': float(proba[1]),
            'probability_down': float(proba[0]),
            'timestamp': datetime.now().isoformat()
        }


class MLRequestHandler(BaseHTTPRequestHandler):
    """HTTP handler for ML predictions."""
    
    predictor = None
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'model_loaded': self.predictor.model is not None}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        if self.path == '/predict':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body)
                ohlcv_data = data.get('ohlcv', [])
                
                result = self.predictor.predict(ohlcv_data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    parser = argparse.ArgumentParser(description='ML Model Prediction Server')
    parser.add_argument('--port', type=int, default=8000, help='Port to listen on')
    parser.add_argument('--model-dir', default=None, help='Path to models directory')
    args = parser.parse_args()
    
    # Initialize predictor
    MLRequestHandler.predictor = Predictor(args.model_dir)
    
    # Start server
    server = HTTPServer(('127.0.0.1', args.port), MLRequestHandler)
    print(f"\n🚀 ML Prediction Server running on http://127.0.0.1:{args.port}")
    print(f"   Health check: GET /health")
    print(f"   Predict: POST /predict with {{'ohlcv': [...]}}\n")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
        server.shutdown()


if __name__ == '__main__':
    main()
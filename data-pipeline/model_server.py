"""
ML Model Prediction Server — v2
================================
Serves WFV-trained XGBoost/LightGBM models via HTTP API.
Accepts raw OHLCV candles, runs feature engineering, returns confidence scores.

Endpoints:
  POST /predict          — main prediction endpoint
  GET  /health           — server health + model status
  GET  /feature_importance — top features driving predictions

Usage:
    pip install fastapi uvicorn
    python3 model_server.py --port 8000
"""

import json
import pickle
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

warnings.filterwarnings('ignore')

from features import FeatureEngineer

# ─── App setup ───────────────────────────────────────────────────────────────
app = FastAPI(title="TradingBot ML Server", version="2.0")

MODELS_DIR = Path(__file__).parent / 'models'
MODEL_NAME = 'wfv_xgboost_direction'   # Default: best WFV model

# Globals (loaded at startup)
model = None
scaler = None
feature_columns: List[str] = []
engineer = FeatureEngineer()
model_meta: Dict[str, Any] = {}


# ─── Schemas ─────────────────────────────────────────────────────────────────

class OHLCVCandle(BaseModel):
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float

class PredictRequest(BaseModel):
    candles: List[OHLCVCandle]
    symbol: Optional[str] = "BTCUSDT"

class PredictResponse(BaseModel):
    prediction: str          # "UP" or "DOWN"
    confidence: float        # 0.5–1.0 (from predict_proba)
    strong_signal: bool      # confidence > 0.72
    sit_out: bool            # True when model is uncertain (confidence 0.45–0.55)
    model: str
    feature_count: int


# ─── Startup: load model ─────────────────────────────────────────────────────

@app.on_event("startup")
async def load_model():
    global model, scaler, feature_columns, model_meta

    # Try WFV model first, fall back to legacy
    candidates = [
        MODEL_NAME,
        'wfv_xgboost_direction',
        'wfv_lightgbm_direction',
        'random_forest_direction',
    ]

    for name in candidates:
        model_path = MODELS_DIR / f'{name}.pkl'
        scaler_path = MODELS_DIR / f'{name}_scaler.pkl'
        features_path = MODELS_DIR / f'{name}_features.json'

        if model_path.exists() and scaler_path.exists() and features_path.exists():
            with open(model_path, 'rb') as f:
                model = pickle.load(f)
            with open(scaler_path, 'rb') as f:
                scaler = pickle.load(f)
            with open(features_path, 'r') as f:
                feature_columns = json.load(f)

            model_meta = {'name': name, 'features': len(feature_columns)}

            # Load WFV metrics if available
            wfv_results_path = MODELS_DIR / 'wfv_results.json'
            if wfv_results_path.exists():
                with open(wfv_results_path) as f:
                    wfv = json.load(f)
                model_meta['oos_sharpe'] = wfv.get('aggregate', {}).get('oos_sharpe', 'N/A')
                model_meta['oos_accuracy'] = wfv.get('aggregate', {}).get('oos_accuracy', 'N/A')
                model_meta['avg_wfe'] = wfv.get('aggregate', {}).get('avg_wfe', 'N/A')
                model_meta['validation'] = wfv.get('validation', 'unknown')

            print(f"✅ Loaded model: {name} ({len(feature_columns)} features)")
            return

    print("⚠️  No trained model found. Train first: python3 train.py --model xgboost --wfv")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok" if model is not None else "no_model",
        "model": model_meta,
        "feature_columns_count": len(feature_columns),
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    if model is None or scaler is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run train.py first.")
    if len(req.candles) < 250:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 250 candles for feature engineering. Got {len(req.candles)}."
        )

    # Build DataFrame from candles
    df = pd.DataFrame([c.dict() for c in req.candles])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df.set_index('timestamp', inplace=True)

    # Run feature engineering
    try:
        df_feat = engineer.add_features(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature engineering error: {e}")

    # Use only the last row (most recent candle)
    last_row = df_feat.iloc[[-1]]

    # Align to trained feature columns (fill missing with 0)
    missing = [c for c in feature_columns if c not in last_row.columns]
    for col in missing:
        last_row[col] = 0.0
    X = last_row[feature_columns].values
    X = np.nan_to_num(X, nan=0, posinf=0, neginf=0)

    # Scale + predict
    X_scaled = scaler.transform(X)
    proba = model.predict_proba(X_scaled)[0][1]   # probability of UP

    # Gating thresholds
    STRONG_THRESHOLD = 0.72
    TRADE_MIN = 0.55
    TRADE_MAX = 0.45

    if proba > 0.5:
        prediction = "UP"
        confidence = float(proba)
    else:
        prediction = "DOWN"
        confidence = float(1.0 - proba)

    sit_out = TRADE_MAX <= proba <= TRADE_MIN   # uncertain zone → skip trading

    return PredictResponse(
        prediction=prediction,
        confidence=round(confidence, 4),
        strong_signal=confidence >= STRONG_THRESHOLD,
        sit_out=sit_out,
        model=model_meta.get('name', 'unknown'),
        feature_count=len(feature_columns),
    )


@app.get("/feature_importance")
async def feature_importance(top_n: int = 20):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded.")
    try:
        importances = model.feature_importances_
        pairs = sorted(
            zip(feature_columns, importances),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]
        return {"features": [{"name": k, "importance": float(v)} for k, v in pairs]}
    except AttributeError:
        raise HTTPException(status_code=400, detail="Model does not support feature_importances_.")


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--model', default=MODEL_NAME, help='Model name prefix in models/')
    args = parser.parse_args()

    MODEL_NAME = args.model
    uvicorn.run(app, host=args.host, port=args.port, log_level='info')
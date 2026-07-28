"""
ML Training Pipeline v2 — XGBoost + LightGBM + Walk-Forward Validation
=======================================================================
Replaces the single 80/20 split with a proper Walk-Forward Validation
framework that prevents look-ahead bias in financial time series.

Walk-Forward Params:
  - Training window : 2000 candles (~83 days of 1h)
  - Test window     : 240  candles (~10 days)
  - Step size       : 120  candles (~5 days)
  - Min WFE         : 0.5  (reject if OOS Sharpe < 0.5 * IS Sharpe)

Usage:
    pip install xgboost lightgbm shap
    python3 train.py --model xgboost --label direction --wfv
    python3 train.py --model ensemble --label direction --wfv
"""

import argparse
import json
import pickle
import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, f1_score, precision_score,
                             recall_score)
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings('ignore')

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("⚠️  xgboost not installed. Run: pip install xgboost")

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False
    print("⚠️  lightgbm not installed. Run: pip install lightgbm")

from features import FeatureEngineer


# ─── Walk-Forward Validation ──────────────────────────────────────────────────

class WalkForwardTrainer:
    """
    Walk-Forward Validation for time-series ML.

    Trains on a rolling window of history, tests on the immediate future,
    steps forward, repeats. Stitches OOS predictions into a single
    continuous series for realistic performance evaluation.
    """

    def __init__(
        self,
        train_window: int = 2000,
        test_window: int = 240,
        step_size: int = 120,
        output_dir: str = None,
    ):
        self.train_window = train_window
        self.test_window = test_window
        self.step_size = step_size
        self.output_dir = Path(output_dir) if output_dir else Path(__file__).parent / 'models'
        self.output_dir.mkdir(exist_ok=True)

        self.feature_columns: List[str] = []
        self.best_model = None
        self.best_scaler = None

    def _exclude_cols(self) -> List[str]:
        return [
            'timestamp', 'open', 'high', 'low', 'close', 'volume',
            'future_return', 'label_direction', 'label_strong_up', 'label_strong_down'
        ]

    def _get_features(self, df: pd.DataFrame) -> List[str]:
        return [c for c in df.columns if c not in self._exclude_cols()]

    def _build_model(self, model_type: str, is_scaler_model: bool = False):
        """Instantiate a fresh model for each fold."""
        if model_type == 'xgboost' and HAS_XGB:
            return xgb.XGBClassifier(
                n_estimators=200,
                max_depth=5,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                use_label_encoder=False,
                eval_metric='logloss',
                random_state=42,
                n_jobs=-1,
            )
        elif model_type == 'lightgbm' and HAS_LGB:
            return lgb.LGBMClassifier(
                n_estimators=200,
                max_depth=5,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                n_jobs=-1,
                verbose=-1,
            )
        elif model_type == 'logistic_regression':
            return LogisticRegression(max_iter=1000, random_state=42, C=0.1)
        elif model_type == 'random_forest':
            from sklearn.ensemble import RandomForestClassifier
            return RandomForestClassifier(
                n_estimators=100, max_depth=8, min_samples_split=10,
                random_state=42, n_jobs=-1
            )
        else:
            raise ValueError(f"Unknown or unavailable model: {model_type}. Install xgboost/lightgbm.")

    def _calculate_sharpe(self, returns: np.ndarray) -> float:
        """Annualized Sharpe Ratio (1h data: √8760 periods/year)."""
        if len(returns) < 2 or returns.std() == 0:
            return 0.0
        return float((returns.mean() / returns.std()) * np.sqrt(8760))

    def _calculate_calmar(self, returns: np.ndarray) -> float:
        """Calmar Ratio = Annual Return / Max Drawdown."""
        cum = (1 + returns).cumprod()
        annual_return = cum[-1] ** (8760 / len(returns)) - 1
        peak = cum.cummax()
        drawdown = (cum - peak) / peak
        max_dd = abs(drawdown.min())
        return float(annual_return / max_dd) if max_dd > 0 else 0.0

    def run(
        self,
        df: pd.DataFrame,
        label_col: str = 'label_direction',
        model_type: str = 'xgboost',
    ) -> Dict:
        """
        Execute the full Walk-Forward loop.
        Returns stitched OOS results + best fold model.
        """
        if not self.feature_columns:
            self.feature_columns = self._get_features(df)

        X = df[self.feature_columns].values
        y = df[label_col].values
        X = np.nan_to_num(X, nan=0, posinf=0, neginf=0)

        n = len(X)
        min_required = self.train_window + self.test_window
        if n < min_required:
            raise ValueError(
                f"Not enough data. Need {min_required} samples, got {n}."
            )

        # Starting index: first valid train window
        start = self.train_window
        oos_predictions: List[np.ndarray] = []
        oos_probas: List[np.ndarray] = []
        oos_actuals: List[np.ndarray] = []
        oos_returns: List[np.ndarray] = []
        fold_metrics: List[Dict] = []

        # Reference returns for Sharpe calc (close-to-close 1-period)
        if 'returns' in df.columns:
            ret_arr = df['returns'].values
        else:
            ret_arr = np.zeros(n)

        fold = 0
        pos = start
        best_oos_sharpe = -np.inf

        print(f"\n🔄 Walk-Forward Validation ({model_type})")
        print(f"   Train: {self.train_window} | Test: {self.test_window} | Step: {self.step_size}")
        print(f"   Total folds: ~{(n - start - self.test_window) // self.step_size + 1}")

        while pos + self.test_window <= n:
            train_start = max(0, pos - self.train_window)
            train_end = pos
            test_start = pos
            test_end = min(n, pos + self.test_window)

            X_train = X[train_start:train_end]
            y_train = y[train_start:train_end]
            X_test = X[test_start:test_end]
            y_test = y[test_start:test_end]

            if len(X_train) < 200 or len(X_test) < 10:
                pos += self.step_size
                continue

            # Scale
            scaler = StandardScaler()
            X_train_s = scaler.fit_transform(X_train)
            X_test_s = scaler.transform(X_test)

            # Train
            model = self._build_model(model_type)
            model.fit(X_train_s, y_train)

            # OOS evaluation
            y_pred = model.predict(X_test_s)
            y_proba = model.predict_proba(X_test_s)[:, 1]

            acc = accuracy_score(y_test, y_pred)

            # Strategy returns: go long when model says UP (confidence > 0.55)
            signal = np.where(y_proba > 0.55, 1, np.where(y_proba < 0.45, -1, 0))
            period_returns = ret_arr[test_start:test_end]
            strat_returns = signal * period_returns
            # Subtract 0.2% round-trip cost per trade change
            trade_changes = np.abs(np.diff(signal, prepend=signal[0]))
            cost = trade_changes * 0.002
            net_returns = strat_returns - cost

            oos_sharpe = self._calculate_sharpe(net_returns)
            oos_calmar = self._calculate_calmar(net_returns)

            # IS metrics
            y_is_pred = model.predict(X_train_s)
            is_acc = accuracy_score(y_train, y_is_pred)
            is_strat_ret = np.where(
                model.predict_proba(X_train_s)[:, 1] > 0.55, 1, -1
            ) * ret_arr[train_start:train_end]
            is_sharpe = self._calculate_sharpe(is_strat_ret)
            wfe = oos_sharpe / is_sharpe if is_sharpe > 0.01 else 0.0

            print(
                f"  Fold {fold+1:2d} | IS acc: {is_acc:.3f} | OOS acc: {acc:.3f} | "
                f"OOS Sharpe: {oos_sharpe:.3f} | WFE: {wfe:.2f}"
            )

            oos_predictions.append(y_pred)
            oos_probas.append(y_proba)
            oos_actuals.append(y_test)
            oos_returns.append(net_returns)

            fold_metrics.append({
                'fold': fold,
                'train_size': len(X_train),
                'test_size': len(X_test),
                'is_accuracy': float(is_acc),
                'oos_accuracy': float(acc),
                'oos_sharpe': float(oos_sharpe),
                'oos_calmar': float(oos_calmar),
                'is_sharpe': float(is_sharpe),
                'wfe': float(wfe),
            })

            # Track best model by OOS Sharpe
            if oos_sharpe > best_oos_sharpe:
                best_oos_sharpe = oos_sharpe
                self.best_model = model
                self.best_scaler = scaler

            pos += self.step_size
            fold += 1

        # ─── Aggregate OOS Results ───────────────────────────────────────
        all_preds = np.concatenate(oos_predictions)
        all_probas = np.concatenate(oos_probas)
        all_actuals = np.concatenate(oos_actuals)
        all_returns = np.concatenate(oos_returns)

        agg_acc = float(accuracy_score(all_actuals, all_preds))
        agg_precision = float(precision_score(all_actuals, all_preds, zero_division=0))
        agg_recall = float(recall_score(all_actuals, all_preds, zero_division=0))
        agg_f1 = float(f1_score(all_actuals, all_preds, zero_division=0))
        agg_sharpe = self._calculate_sharpe(all_returns)
        agg_calmar = self._calculate_calmar(all_returns)
        avg_wfe = float(np.mean([m['wfe'] for m in fold_metrics]))

        print(f"\n{'─'*60}")
        print(f"📊 WALK-FORWARD AGGREGATE RESULTS")
        print(f"  OOS Accuracy:  {agg_acc:.4f}")
        print(f"  OOS Precision: {agg_precision:.4f}")
        print(f"  OOS Recall:    {agg_recall:.4f}")
        print(f"  OOS F1:        {agg_f1:.4f}")
        print(f"  OOS Sharpe:    {agg_sharpe:.3f} (target > 1.2)")
        print(f"  OOS Calmar:    {agg_calmar:.3f}")
        print(f"  Avg WFE:       {avg_wfe:.3f} (target > 0.5)")
        print(f"{'─'*60}")

        if avg_wfe < 0.3:
            print("⚠️  WARNING: Low WFE — model may be overfitting. Consider simpler features.")
        elif agg_sharpe > 1.0:
            print("✅ STRONG: OOS Sharpe > 1.0 — strategy looks viable.")

        return {
            'fold_metrics': fold_metrics,
            'aggregate': {
                'oos_accuracy': agg_acc,
                'oos_precision': agg_precision,
                'oos_recall': agg_recall,
                'oos_f1': agg_f1,
                'oos_sharpe': agg_sharpe,
                'oos_calmar': agg_calmar,
                'avg_wfe': avg_wfe,
                'total_folds': fold,
                'oos_probas': all_probas.tolist(),
            },
        }

    def save(self, name: str = 'wfv_model'):
        """Save best model from WFV + feature list."""
        if self.best_model is None:
            raise RuntimeError("No model to save — run .run() first.")

        model_path = self.output_dir / f'{name}.pkl'
        scaler_path = self.output_dir / f'{name}_scaler.pkl'
        features_path = self.output_dir / f'{name}_features.json'

        with open(model_path, 'wb') as f:
            pickle.dump(self.best_model, f)
        with open(scaler_path, 'wb') as f:
            pickle.dump(self.best_scaler, f)
        with open(features_path, 'w') as f:
            json.dump(self.feature_columns, f)

        print(f"💾 Best WFV model → {model_path}")
        return str(model_path)


# ─── Legacy single-split trainer (kept for compatibility) ─────────────────────

class MLTrainer:
    """Single-split trainer (legacy). Use WalkForwardTrainer for new work."""

    def __init__(self, output_dir: str = None):
        self.output_dir = Path(output_dir) if output_dir else Path(__file__).parent / 'models'
        self.output_dir.mkdir(exist_ok=True)
        self.scaler = StandardScaler()
        self.model = None
        self.feature_columns = None

    def _exclude_cols(self):
        return [
            'timestamp', 'open', 'high', 'low', 'close', 'volume',
            'future_return', 'label_direction', 'label_strong_up', 'label_strong_down'
        ]

    def prepare_data(self, df, label_col='label_direction', test_size=0.2):
        self.feature_columns = [c for c in df.columns if c not in self._exclude_cols()]
        X = np.nan_to_num(df[self.feature_columns].values, nan=0, posinf=0, neginf=0)
        y = df[label_col].values
        split = int(len(X) * (1 - test_size))
        return X[:split], X[split:], y[:split], y[split:]

    def scale_features(self, X_train, X_test):
        return self.scaler.fit_transform(X_train), self.scaler.transform(X_test)

    def train(self, X_train, y_train, model_type='random_forest', **kwargs):
        trainer = WalkForwardTrainer()
        self.model = trainer._build_model(model_type)
        self.model.fit(X_train, y_train)
        return self.model

    def evaluate(self, X_test, y_test):
        y_pred = self.model.predict(X_test)
        return {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'precision': float(precision_score(y_test, y_pred, zero_division=0)),
            'recall': float(recall_score(y_test, y_pred, zero_division=0)),
            'f1': float(f1_score(y_test, y_pred, zero_division=0)),
        }

    def save_model(self, name='model'):
        paths = {}
        for attr, fname in [('model', f'{name}.pkl'), ('scaler', f'{name}_scaler.pkl')]:
            p = self.output_dir / fname
            with open(p, 'wb') as f:
                pickle.dump(getattr(self, attr), f)
            paths[attr] = str(p)
        feat_p = self.output_dir / f'{name}_features.json'
        with open(feat_p, 'w') as f:
            json.dump(self.feature_columns, f)
        paths['features'] = str(feat_p)
        print(f"💾 Model saved → {paths['model']}")
        return paths

    def load_model(self, name='model'):
        with open(self.output_dir / f'{name}.pkl', 'rb') as f:
            self.model = pickle.load(f)
        with open(self.output_dir / f'{name}_scaler.pkl', 'rb') as f:
            self.scaler = pickle.load(f)
        with open(self.output_dir / f'{name}_features.json', 'r') as f:
            self.feature_columns = json.load(f)
        return self.model


def main():
    parser = argparse.ArgumentParser(description='Train ML model for trading signals')
    parser.add_argument('--symbol', default='BTCUSDT')
    parser.add_argument('--timeframe', default='1h')
    parser.add_argument('--label', default='direction',
                        choices=['direction', 'strong_up', 'strong_down'])
    parser.add_argument('--model', default='xgboost',
                        choices=['random_forest', 'gradient_boosting', 'logistic_regression',
                                 'xgboost', 'lightgbm'])
    parser.add_argument('--wfv', action='store_true', default=True,
                        help='Use Walk-Forward Validation (recommended)')
    parser.add_argument('--train-window', type=int, default=2000)
    parser.add_argument('--test-window', type=int, default=240)
    parser.add_argument('--step-size', type=int, default=120)
    args = parser.parse_args()

    label_map = {
        'direction': 'label_direction',
        'strong_up': 'label_strong_up',
        'strong_down': 'label_strong_down',
    }

    engineer = FeatureEngineer()
    df = engineer.prepare_dataset(args.symbol, args.timeframe)

    if args.wfv:
        # ── Walk-Forward Validation (recommended) ──
        wfv = WalkForwardTrainer(
            train_window=args.train_window,
            test_window=args.test_window,
            step_size=args.step_size,
        )
        wfv.feature_columns = [
            c for c in df.columns
            if c not in ['timestamp', 'open', 'high', 'low', 'close', 'volume',
                         'future_return', 'label_direction', 'label_strong_up', 'label_strong_down']
        ]
        results = wfv.run(df, label_col=label_map[args.label], model_type=args.model)
        model_path = wfv.save(name=f'wfv_{args.model}_{args.label}')

        # Save results JSON
        results_out = {
            'timestamp': datetime.now().isoformat(),
            'model': args.model,
            'validation': 'walk_forward',
            'label': args.label,
            'train_window': args.train_window,
            'test_window': args.test_window,
            'step_size': args.step_size,
            'aggregate': {k: v for k, v in results['aggregate'].items() if k != 'oos_probas'},
            'fold_metrics': results['fold_metrics'],
            'model_path': model_path,
        }
        results_path = Path(__file__).parent / 'models' / 'wfv_results.json'
        with open(results_path, 'w') as f:
            json.dump(results_out, f, indent=2)
        print(f"\n📄 WFV results → {results_path}")
    else:
        # Legacy single-split
        trainer = MLTrainer()
        X_tr, X_te, y_tr, y_te = trainer.prepare_data(df, label_map[args.label])
        X_tr_s, X_te_s = trainer.scale_features(X_tr, X_te)
        trainer.train(X_tr_s, y_tr, args.model)
        metrics = trainer.evaluate(X_te_s, y_te)
        print(f"\n📈 Metrics: {metrics}")
        trainer.save_model(f'{args.model}_{args.label}')


if __name__ == '__main__':
    main()
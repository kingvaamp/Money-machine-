"""
ML Training Pipeline for Trading Bot
=====================================
Trains classifiers and regressors for signal prediction.

Usage:
    python3 train.py --model random_forest --label direction
"""

import argparse
import json
import pickle
from datetime import datetime
from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, TimeSeriesSplit
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)

from features import FeatureEngineer


class MLTrainer:
    """Train ML models for trading signals."""
    
    def __init__(self, db_path: str = None, output_dir: str = None):
        self.db_path = db_path
        self.output_dir = Path(output_dir) if output_dir else Path(__file__).parent / 'models'
        self.output_dir.mkdir(exist_ok=True)
        
        self.scaler = StandardScaler()
        self.model = None
        self.feature_columns = None
    
    def prepare_data(
        self,
        df: pd.DataFrame,
        label_col: str = 'label_direction',
        test_size: float = 0.2
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Prepare features and labels for training."""
        # Exclude non-feature columns
        exclude_cols = [
            'timestamp', 'open', 'high', 'low', 'close', 'volume',
            'future_return', 'label_direction', 'label_strong_up', 'label_strong_down'
        ]
        
        self.feature_columns = [c for c in df.columns if c not in exclude_cols]
        
        X = df[self.feature_columns].values
        y = df[label_col].values
        
        # Handle any remaining NaN/inf
        X = np.nan_to_num(X, nan=0, posinf=0, neginf=0)
        
        # Time series split (no shuffle for temporal data)
        split_idx = int(len(X) * (1 - test_size))
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]
        
        print(f"📊 Train size: {len(X_train)}, Test size: {len(X_test)}")
        
        return X_train, X_test, y_train, y_test
    
    def scale_features(self, X_train: np.ndarray, X_test: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Scale features using StandardScaler."""
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        return X_train_scaled, X_test_scaled
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        model_type: str = 'random_forest',
        **kwargs
    ):
        """Train the specified model."""
        print(f"\n🤖 Training {model_type}...")
        
        if model_type == 'random_forest':
            self.model = RandomForestClassifier(
                n_estimators=kwargs.get('n_estimators', 100),
                max_depth=kwargs.get('max_depth', 10),
                min_samples_split=kwargs.get('min_samples_split', 10),
                random_state=42,
                n_jobs=-1
            )
        elif model_type == 'gradient_boosting':
            self.model = GradientBoostingClassifier(
                n_estimators=kwargs.get('n_estimators', 100),
                max_depth=kwargs.get('max_depth', 5),
                learning_rate=kwargs.get('learning_rate', 0.1),
                random_state=42
            )
        elif model_type == 'logistic_regression':
            self.model = LogisticRegression(
                max_iter=1000,
                random_state=42
            )
        else:
            raise ValueError(f"Unknown model: {model_type}")
        
        self.model.fit(X_train, y_train)
        print(f"✅ Model trained!")
        
        return self.model
    
    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> dict:
        """Evaluate model performance."""
        y_pred = self.model.predict(X_test)
        
        metrics = {
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, zero_division=0),
            'recall': recall_score(y_test, y_pred, zero_division=0),
            'f1': f1_score(y_test, y_pred, zero_division=0)
        }
        
        print(f"\n📈 Model Performance:")
        print(f"  Accuracy:  {metrics['accuracy']:.4f}")
        print(f"  Precision: {metrics['precision']:.4f}")
        print(f"  Recall:    {metrics['recall']:.4f}")
        print(f"  F1 Score:  {metrics['f1']:.4f}")
        
        print(f"\n📊 Confusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(f"  TN: {cm[0][0]:4d}  FP: {cm[0][1]:4d}")
        print(f"  FN: {cm[1][0]:4d}  TP: {cm[1][1]:4d}")
        
        return metrics
    
    def cross_validate(self, X: np.ndarray, y: np.ndarray, n_splits: int = 5) -> dict:
        """Time series cross-validation."""
        print(f"\n🔄 Running {n_splits}-fold time series cross-validation...")
        
        tscv = TimeSeriesSplit(n_splits=n_splits)
        scores = []
        
        for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
            X_train, X_val = X[train_idx], X[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]
            
            # Scale
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_val_scaled = self.scaler.transform(X_val)
            
            # Train and evaluate
            self.model.fit(X_train_scaled, y_train)
            score = self.model.score(X_val_scaled, y_val)
            scores.append(score)
            print(f"  Fold {fold+1}: {score:.4f}")
        
        print(f"\n📊 CV Mean: {np.mean(scores):.4f} ± {np.std(scores):.4f}")
        
        return {
            'mean': np.mean(scores),
            'std': np.std(scores),
            'scores': scores
        }
    
    def save_model(self, name: str = 'model'):
        """Save model and scaler to disk."""
        model_path = self.output_dir / f'{name}.pkl'
        scaler_path = self.output_dir / f'{name}_scaler.pkl'
        
        with open(model_path, 'wb') as f:
            pickle.dump(self.model, f)
        
        with open(scaler_path, 'wb') as f:
            pickle.dump(self.scaler, f)
        
        # Save feature columns
        features_path = self.output_dir / f'{name}_features.json'
        with open(features_path, 'w') as f:
            json.dump(self.feature_columns, f)
        
        print(f"\n💾 Model saved to {model_path}")
        print(f"💾 Scaler saved to {scaler_path}")
        print(f"💾 Features saved to {features_path}")
        
        return {
            'model_path': str(model_path),
            'scaler_path': str(scaler_path),
            'features_path': str(features_path)
        }
    
    def load_model(self, name: str = 'model'):
        """Load model and scaler from disk."""
        model_path = self.output_dir / f'{name}.pkl'
        scaler_path = self.output_dir / f'{name}_scaler.pkl'
        
        with open(model_path, 'rb') as f:
            self.model = pickle.load(f)
        
        with open(scaler_path, 'rb') as f:
            self.scaler = pickle.load(f)
        
        features_path = self.output_dir / f'{name}_features.json'
        with open(features_path, 'r') as f:
            self.feature_columns = json.load(f)
        
        print(f"✅ Model loaded from {model_path}")
        
        return self.model


def main():
    parser = argparse.ArgumentParser(description='Train ML model for trading signals')
    parser.add_argument('--symbol', default='BTCUSDT', help='Trading symbol')
    parser.add_argument('--timeframe', default='1h', help='Timeframe')
    parser.add_argument('--label', default='direction', 
                        choices=['direction', 'strong_up', 'strong_down'],
                        help='Label to predict')
    parser.add_argument('--model', default='random_forest',
                        choices=['random_forest', 'gradient_boosting', 'logistic_regression'],
                        help='Model type')
    parser.add_argument('--n-estimators', type=int, default=100, help='Number of trees')
    parser.add_argument('--test-size', type=float, default=0.2, help='Test set ratio')
    parser.add_argument('--cv', type=int, default=5, help='Cross-validation folds')
    
    args = parser.parse_args()
    
    # Map label args to column names
    label_map = {
        'direction': 'label_direction',
        'strong_up': 'label_strong_up',
        'strong_down': 'label_strong_down'
    }
    
    # Load and prepare data
    engineer = FeatureEngineer()
    df = engineer.prepare_dataset(args.symbol, args.timeframe)
    
    # Initialize trainer
    trainer = MLTrainer()
    
    # Prepare data
    X_train, X_test, y_train, y_test = trainer.prepare_data(
        df, 
        label_col=label_map[args.label],
        test_size=args.test_size
    )
    
    # Scale features
    X_train_scaled, X_test_scaled = trainer.scale_features(X_train, X_test)
    
    # Train model
    trainer.train(X_train_scaled, y_train, args.model, n_estimators=args.n_estimators)
    
    # Evaluate
    metrics = trainer.evaluate(X_test_scaled, y_test)
    
    # Cross-validation (full dataset) - skip for now due to time
    cv_results = {'mean': 0, 'std': 0, 'scores': []}
    # X_full = df[trainer.feature_columns].values
    # X_full = np.nan_to_num(X_full, nan=0, posinf=0, neginf=0)
    # X_full_scaled = trainer.scaler.fit_transform(X_full)
    # y_full = df[label_map[args.label]].values
    # cv_results = trainer.cross_validate(X_full_scaled, y_full, args.cv)
    
    # Save model
    model_info = trainer.save_model(f'{args.model}_{args.label}')
    
    # Save metrics
    results = {
        'timestamp': datetime.now().isoformat(),
        'model': args.model,
        'label': args.label,
        'metrics': metrics,
        'cv_results': cv_results,
        'model_path': model_info['model_path']
    }
    
    results_path = trainer.output_dir / 'training_results.json'
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Results saved to {results_path}")


if __name__ == '__main__':
    main()
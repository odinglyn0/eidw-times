import os
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np
import pandas as pd
import xgboost as xgb
from huggingface_hub import hf_hub_download
import psycopg2
from psycopg2.extras import RealDictCursor

HF_REPO = "unknown-wdie/xgboost-sm"
MODEL_KEYS = [
    "t1_h60m", "t1_h120m", "t1_h180m",
    "t2_h60m", "t2_h120m", "t2_h180m",
]

BAND_MINUTES = 5
LOOKBACK_HOURS = 24
BAND_COUNT = (LOOKBACK_HOURS * 60) // BAND_MINUTES

CACHE_DIR = Path(__file__).parent / ".model_cache"

def download_models(cache_dir: Path = CACHE_DIR) -> dict[str, xgb.Booster]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    models = {}

    meta_path = hf_hub_download(
        repo_id=HF_REPO,
        filename="model_meta.json",
        cache_dir=str(cache_dir),
        repo_type="model",
    )
    with open(meta_path) as f:
        meta = json.load(f)

    print(f"[meta] features={len(meta['feature_cols'])}, "
          f"horizons={meta['horizons_minutes']}, "
          f"band={meta['band_minutes']}min, lookback={meta['lookback_hours']}h")

    for key in MODEL_KEYS:
        path = hf_hub_download(
            repo_id=HF_REPO,
            filename=f"{key}.json",
            cache_dir=str(cache_dir),
            repo_type="model",
        )
        booster = xgb.Booster()
        booster.load_model(path)
        models[key] = booster
        print(f"[loaded] {key}")

    return models, meta

def get_db_connection(database_url: str | None = None):
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def fetch_recent_data(conn, lookback_hours: int = LOOKBACK_HOURS) -> pd.DataFrame:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours + 1)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT timestamp, t1, t2 FROM security_times "
            "WHERE timestamp >= %s ORDER BY timestamp ASC",
            (cutoff,),
        )
        rows = cur.fetchall()

    if not rows:
        raise RuntimeError(f"No data in the last {lookback_hours}h")

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["hour"] = df["timestamp"].dt.hour
    df["minute"] = df["timestamp"].dt.minute
    df["second"] = df["timestamp"].dt.second
    df["time_minutes"] = df["hour"] * 60 + df["minute"] + df["second"] / 60.0
    df = df.sort_values("time_minutes").reset_index(drop=True)
    df["band_idx"] = (df["time_minutes"] // BAND_MINUTES).astype(int)
    
    banded = (
        df.groupby("band_idx")
        .agg({"t1": "mean", "t2": "mean", "hour": "last", "minute": "last"})
        .sort_index()
        .reset_index(drop=True)
    )
    return banded

def build_features(df: pd.DataFrame, meta: dict) -> xgb.DMatrix:
    band_count = BAND_COUNT
    lag_cols_t1 = []
    lag_cols_t2 = []
    for lag in range(1, band_count + 1):
        col_t1 = f"t1_lag_{lag}"
        col_t2 = f"t2_lag_{lag}"
        df[col_t1] = df["t1"].shift(lag)
        df[col_t2] = df["t2"].shift(lag)
        lag_cols_t1.append(col_t1)
        lag_cols_t2.append(col_t2)

    df = df.dropna().reset_index(drop=True)

    if len(df) == 0:
        raise RuntimeError(
            f"Not enough data to fill {band_count} lag bands. "
            f"Need >{LOOKBACK_HOURS}h of continuous data."
        )

    latest = df.iloc[[-1]].copy()

    hour_sin = np.sin(2 * np.pi * latest["hour"] / 24.0)
    hour_cos = np.cos(2 * np.pi * latest["hour"] / 24.0)
    min_sin = np.sin(2 * np.pi * latest["minute"] / 60.0)
    min_cos = np.cos(2 * np.pi * latest["minute"] / 60.0)

    feature_cols = ["t1", "t2", "hour", "minute"] + lag_cols_t1 + lag_cols_t2
    X = latest[feature_cols].copy()
    X["hour_sin"] = hour_sin.values
    X["hour_cos"] = hour_cos.values
    X["min_sin"] = min_sin.values
    X["min_cos"] = min_cos.values

    expected_cols = meta["feature_cols"]
    X = X[expected_cols]

    return xgb.DMatrix(X)

def predict(
    models: dict[str, xgb.Booster],
    dmatrix: xgb.DMatrix,
) -> dict[str, float]:
    results = {}
    for key, booster in models.items():
        pred = booster.predict(dmatrix)
        results[key] = round(float(pred[0]), 1)
    return results


def run(database_url: str | None = None) -> dict:
    print("Downloading models from HuggingFace...")
    models, meta = download_models()

    print("Fetching recent data from Postgres...")
    conn = get_db_connection(database_url)
    try:
        df = fetch_recent_data(conn)
    finally:
        conn.close()

    print(f"Banded rows available: {len(df)}")
    dmatrix = build_features(df, meta)

    print("Running inference...")
    predictions = predict(models, dmatrix)

    now = datetime.now(timezone.utc)
    output = {
        "generated_at": now.isoformat(),
        "model": HF_REPO,
        "predictions": {},
    }

    for key, value in predictions.items():
        terminal, horizon = key.split("_h")
        horizon_min = int(horizon.replace("m", ""))
        forecast_time = now + timedelta(minutes=horizon_min)

        if terminal not in output["predictions"]:
            output["predictions"][terminal] = []

        output["predictions"][terminal].append({
            "horizon_minutes": horizon_min,
            "forecast_time_utc": forecast_time.isoformat(),
            "predicted_wait_minutes": value,
        })

    for terminal in output["predictions"]:
        output["predictions"][terminal].sort(key=lambda x: x["horizon_minutes"])

    return output

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")

    result = run()

    print("\n" + "=" * 60)
    print("PREDICTIONS")
    print("=" * 60)
    print(f"Generated: {result['generated_at']}")
    print(f"Model:     {result['model']}\n")

    for terminal, forecasts in result["predictions"].items():
        print(f"  {terminal.upper()}:")
        for fc in forecasts:
            print(f"    +{fc['horizon_minutes']:>3}min  →  {fc['predicted_wait_minutes']:.1f} min  "
                  f"(at {fc['forecast_time_utc'][:19]}Z)")
    print()

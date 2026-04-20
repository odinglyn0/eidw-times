import os
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import xgboost as xgb
import sentry_sdk

sentry_dsn = os.environ.get("SENTRY_DSN", "")
if sentry_dsn:
    sentry_sdk.init(dsn=sentry_dsn, traces_sample_rate=0.1)

HF_REPO = "unknown-wdie/xgboost-sm"
MODEL_DIR = Path("/app/models")
MODEL_KEYS = [
    "t1_h60m",
    "t1_h120m",
    "t1_h180m",
    "t2_h60m",
    "t2_h120m",
    "t2_h180m",
]

BAND_MINUTES = 5
LOOKBACK_HOURS = 24
BAND_COUNT = (LOOKBACK_HOURS * 60) // BAND_MINUTES

DEP_FEATURE_COLS = [
    "dep_count_t1",
    "dep_count_t2",
    "dep_next_1h_t1",
    "dep_next_1h_t2",
    "dep_next_2h_t1",
    "dep_next_2h_t2",
    "dep_next_3h_t1",
    "dep_next_3h_t2",
]


def load_models():
    meta_path = MODEL_DIR / "model_meta.json"
    with open(meta_path) as f:
        meta = json.load(f)

    models = {}
    for key in MODEL_KEYS:
        booster = xgb.Booster()
        booster.load_model(str(MODEL_DIR / f"{key}.json"))
        models[key] = booster

    return models, meta


def get_db_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def fetch_departures_for_bands(conn, band_timestamps):
    if not band_timestamps:
        return {}
    earliest = min(band_timestamps) - timedelta(minutes=30)
    latest = max(band_timestamps) + timedelta(hours=3, minutes=30)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT scheduled_datetime, terminal_name FROM departures "
            "WHERE scheduled_datetime >= %s AND scheduled_datetime <= %s "
            "ORDER BY scheduled_datetime ASC",
            (earliest, latest),
        )
        rows = cur.fetchall()

    t1_deps = sorted(
        [r["scheduled_datetime"] for r in rows if r["terminal_name"] == "T1"]
    )
    t2_deps = sorted(
        [r["scheduled_datetime"] for r in rows if r["terminal_name"] == "T2"]
    )
    return {"t1": t1_deps, "t2": t2_deps}


def count_deps_in_window(dep_list, start, end):
    count = 0
    for d in dep_list:
        if d < start:
            continue
        if d > end:
            break
        count += 1
    return count


def fetch_recent_data(conn):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS + 1)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT timestamp, t1, t2 FROM security_times "
            "WHERE timestamp >= %s ORDER BY timestamp ASC",
            (cutoff,),
        )
        rows = cur.fetchall()

    if not rows:
        raise RuntimeError(f"No data in the last {LOOKBACK_HOURS}h")

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)
    df["band_ts"] = df["timestamp"].dt.floor(f"{BAND_MINUTES}min")
    banded = (
        df.groupby("band_ts")
        .agg({"t1": "mean", "t2": "mean"})
        .sort_index()
        .reset_index()
    )

    band_timestamps = list(banded["band_ts"].dt.to_pydatetime())
    dep_data = fetch_departures_for_bands(conn, band_timestamps)

    dep_features = {c: [] for c in DEP_FEATURE_COLS}
    for ts in band_timestamps:
        ts_aware = ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
        for terminal, key in [("t1", "t1"), ("t2", "t2")]:
            deps = dep_data.get(key, [])
            dep_features[f"dep_count_{terminal}"].append(
                count_deps_in_window(
                    deps,
                    ts_aware - timedelta(minutes=30),
                    ts_aware + timedelta(minutes=30),
                )
            )
            dep_features[f"dep_next_1h_{terminal}"].append(
                count_deps_in_window(
                    deps,
                    ts_aware + timedelta(minutes=30),
                    ts_aware + timedelta(minutes=90),
                )
            )
            dep_features[f"dep_next_2h_{terminal}"].append(
                count_deps_in_window(
                    deps,
                    ts_aware + timedelta(minutes=90),
                    ts_aware + timedelta(minutes=150),
                )
            )
            dep_features[f"dep_next_3h_{terminal}"].append(
                count_deps_in_window(
                    deps,
                    ts_aware + timedelta(minutes=150),
                    ts_aware + timedelta(minutes=210),
                )
            )

    for col in DEP_FEATURE_COLS:
        banded[col] = dep_features[col]

    banded["hour"] = banded["band_ts"].dt.hour
    banded["minute"] = banded["band_ts"].dt.minute
    banded = banded.drop(columns=["band_ts"]).reset_index(drop=True)

    return banded


def build_features(df, meta):
    band_count = BAND_COUNT
    dep_lag_bands = meta.get("dep_lag_bands", 12)

    t1_lags = pd.concat(
        {f"t1_lag_{lag}": df["t1"].shift(lag) for lag in range(1, band_count + 1)},
        axis=1,
    )
    t2_lags = pd.concat(
        {f"t2_lag_{lag}": df["t2"].shift(lag) for lag in range(1, band_count + 1)},
        axis=1,
    )
    lag_cols_t1 = list(t1_lags.columns)
    lag_cols_t2 = list(t2_lags.columns)

    dep_lag_frames = {}
    for dep_col in ["dep_count_t1", "dep_count_t2"]:
        for lag in range(1, dep_lag_bands + 1):
            lag_name = f"{dep_col}_lag_{lag}"
            dep_lag_frames[lag_name] = df[dep_col].shift(lag)
    dep_lags_df = pd.DataFrame(dep_lag_frames)
    dep_lag_cols = list(dep_lags_df.columns)

    df = pd.concat([df, t1_lags, t2_lags, dep_lags_df], axis=1)
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

    feature_cols = (
        ["t1", "t2", "hour", "minute"]
        + lag_cols_t1
        + lag_cols_t2
        + DEP_FEATURE_COLS
        + dep_lag_cols
    )
    X = latest[feature_cols].copy()
    X["hour_sin"] = hour_sin.values
    X["hour_cos"] = hour_cos.values
    X["min_sin"] = min_sin.values
    X["min_cos"] = min_cos.values

    expected_cols = meta["feature_cols"]
    X = X[expected_cols]

    return xgb.DMatrix(X)


def predict(models, dmatrix):
    results = {}
    for key, booster in models.items():
        pred = booster.predict(dmatrix)
        results[key] = round(float(pred[0]), 1)
    return results


def upsert_predictions(conn, predictions, now):
    with conn.cursor() as cur:
        for key, value in predictions.items():
            terminal_str, horizon_str = key.split("_h")
            terminal = 1 if terminal_str == "t1" else 2
            horizon_minutes = int(horizon_str.replace("m", ""))
            target_hour = (now + timedelta(minutes=horizon_minutes)).replace(
                minute=0, second=0, microsecond=0
            )

            cur.execute(
                "INSERT INTO predictions (terminal, target_hour, predicted_wait, horizon, last_prediction_time) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (terminal, target_hour) "
                "DO UPDATE SET predicted_wait = EXCLUDED.predicted_wait, "
                "horizon = EXCLUDED.horizon, "
                "last_prediction_time = EXCLUDED.last_prediction_time",
                (terminal, target_hour, value, f"{horizon_minutes}m", now),
            )

            cur.execute(
                "INSERT INTO prediction_history (terminal, target_hour, predicted_wait, horizon, predicted_at) "
                "VALUES (%s, %s, %s, %s, %s)",
                (terminal, target_hour, value, f"{horizon_minutes}m", now),
            )

    conn.commit()


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                terminal SMALLINT NOT NULL,
                target_hour TIMESTAMPTZ NOT NULL,
                predicted_wait REAL NOT NULL,
                horizon TEXT NOT NULL,
                last_prediction_time TIMESTAMPTZ NOT NULL,
                PRIMARY KEY (terminal, target_hour)
            )
        """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS prediction_history (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                terminal SMALLINT NOT NULL,
                target_hour TIMESTAMPTZ NOT NULL,
                predicted_wait REAL NOT NULL,
                horizon TEXT NOT NULL,
                predicted_at TIMESTAMPTZ NOT NULL
            )
        """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_prediction_history_target
            ON prediction_history (terminal, target_hour, predicted_at)
        """
        )
    conn.commit()


def main():
    print("Loading models from disk...")
    models, meta = load_models()

    print("Connecting to database...")
    conn = get_db_connection()

    try:
        ensure_tables(conn)

        print("Fetching recent data...")
        df = fetch_recent_data(conn)
        print(f"Banded rows: {len(df)}")

        print("Building features...")
        dmatrix = build_features(df, meta)

        print("Running inference...")
        predictions = predict(models, dmatrix)

        now = datetime.now(timezone.utc)
        print("Upserting predictions...")
        upsert_predictions(conn, predictions, now)

        for key, value in sorted(predictions.items()):
            terminal_str, horizon_str = key.split("_h")
            horizon_minutes = int(horizon_str.replace("m", ""))
            target = (now + timedelta(minutes=horizon_minutes)).replace(
                minute=0, second=0, microsecond=0
            )
            print(
                f"  {terminal_str.upper()} +{horizon_minutes}min -> {value}min (target: {target.isoformat()})"
            )

        print("Done.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

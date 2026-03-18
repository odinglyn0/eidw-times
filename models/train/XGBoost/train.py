import modal
import os

app = modal.App("trainium-eidwtimes-xgboost-sm")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "xgboost",
        "pandas",
        "pyarrow",
        "numpy",
        "scikit-learn",
        "wandb",
        "huggingface_hub",
        "joblib",
    )
    .apt_install("libgomp1")
)

data_volume = modal.Volume.from_name("eidwtimes-data", create_if_missing=True)

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


@app.function(
    image=image,
    gpu=modal.gpu.A100(size="40GB"),
    timeout=1800,
    volumes={"/data": data_volume},
    secrets=[
        modal.Secret.from_name("wandb-secret"),
        modal.Secret.from_name("hf-secret"),
    ],
)
def train(
    data_path: str = "/data",
    security_glob: str = "security_times*.parquet",
    departures_glob: str = "departures*.parquet",
    wandb_project: str = "eidwtimes-xgboost-sm",
    hf_repo: str = "unknown-wdie/xgboost-sm",
    horizons_minutes: list[int] = [60, 120, 180],
    band_minutes: int = 5,
    lookback_hours: int = 24,
    dep_lag_bands: int = 12,
):
    import glob
    import json
    import tempfile

    import joblib
    import numpy as np
    import pandas as pd
    import wandb
    import xgboost as xgb
    from huggingface_hub import HfApi
    from sklearn.metrics import mean_absolute_error, mean_squared_error

    sec_files = sorted(glob.glob(os.path.join(data_path, security_glob)))
    if not sec_files:
        raise FileNotFoundError(
            f"No security parquet files found in {data_path}/{security_glob}"
        )

    df = pd.concat([pd.read_parquet(f) for f in sec_files], ignore_index=True)
    print(f"Loaded {len(df)} security rows from {len(sec_files)} file(s)")

    dep_files = sorted(glob.glob(os.path.join(data_path, departures_glob)))
    if dep_files:
        dep_df = pd.concat([pd.read_parquet(f) for f in dep_files], ignore_index=True)
        print(f"Loaded {len(dep_df)} departure rows from {len(dep_files)} file(s)")
    else:
        dep_df = pd.DataFrame(columns=["hour", "minute", "terminal_name"])
        print("No departure parquet files found, departure features will be zero")

    df["time_minutes"] = df["hour"] * 60 + df["minute"] + df["second"] / 60.0
    df = df.sort_values("time_minutes").reset_index(drop=True)

    if len(dep_df) > 0 and "hour" in dep_df.columns and "minute" in dep_df.columns:
        dep_df["time_minutes"] = dep_df["hour"] * 60 + dep_df["minute"]
        t1_dep_times = sorted(
            dep_df.loc[dep_df["terminal_name"] == "T1", "time_minutes"].tolist()
        )
        t2_dep_times = sorted(
            dep_df.loc[dep_df["terminal_name"] == "T2", "time_minutes"].tolist()
        )
    else:
        t1_dep_times = []
        t2_dep_times = []

    def count_in_range(dep_list, lo, hi):
        count = 0
        for d in dep_list:
            if d < lo:
                continue
            if d > hi:
                break
            count += 1
        return count

    dep_count_t1 = []
    dep_count_t2 = []
    dep_next_1h_t1 = []
    dep_next_1h_t2 = []
    dep_next_2h_t1 = []
    dep_next_2h_t2 = []
    dep_next_3h_t1 = []
    dep_next_3h_t2 = []

    for _, row in df.iterrows():
        tm = row["time_minutes"]
        dep_count_t1.append(count_in_range(t1_dep_times, tm - 30, tm + 30))
        dep_count_t2.append(count_in_range(t2_dep_times, tm - 30, tm + 30))
        dep_next_1h_t1.append(count_in_range(t1_dep_times, tm + 30, tm + 90))
        dep_next_1h_t2.append(count_in_range(t2_dep_times, tm + 30, tm + 90))
        dep_next_2h_t1.append(count_in_range(t1_dep_times, tm + 90, tm + 150))
        dep_next_2h_t2.append(count_in_range(t2_dep_times, tm + 90, tm + 150))
        dep_next_3h_t1.append(count_in_range(t1_dep_times, tm + 150, tm + 210))
        dep_next_3h_t2.append(count_in_range(t2_dep_times, tm + 150, tm + 210))

    df["dep_count_t1"] = dep_count_t1
    df["dep_count_t2"] = dep_count_t2
    df["dep_next_1h_t1"] = dep_next_1h_t1
    df["dep_next_1h_t2"] = dep_next_1h_t2
    df["dep_next_2h_t1"] = dep_next_2h_t1
    df["dep_next_2h_t2"] = dep_next_2h_t2
    df["dep_next_3h_t1"] = dep_next_3h_t1
    df["dep_next_3h_t2"] = dep_next_3h_t2

    band_count = (lookback_hours * 60) // band_minutes
    df["band_idx"] = (df["time_minutes"] // band_minutes).astype(int)

    targets = ["t1", "t2"]
    horizon_steps = [h // band_minutes for h in horizons_minutes]

    lag_cols_t1 = []
    lag_cols_t2 = []
    for lag in range(1, band_count + 1):
        col_t1 = f"t1_lag_{lag}"
        col_t2 = f"t2_lag_{lag}"
        df[col_t1] = df["t1"].shift(lag)
        df[col_t2] = df["t2"].shift(lag)
        lag_cols_t1.append(col_t1)
        lag_cols_t2.append(col_t2)

    dep_lag_cols = []
    for dep_col in ["dep_count_t1", "dep_count_t2"]:
        for lag in range(1, dep_lag_bands + 1):
            lag_name = f"{dep_col}_lag_{lag}"
            df[lag_name] = df[dep_col].shift(lag)
            dep_lag_cols.append(lag_name)

    for h_steps in horizon_steps:
        df[f"t1_target_{h_steps}"] = df["t1"].shift(-h_steps)
        df[f"t2_target_{h_steps}"] = df["t2"].shift(-h_steps)

    df = df.dropna().reset_index(drop=True)
    print(f"Usable rows after lag/target construction: {len(df)}")

    hour_sin = np.sin(2 * np.pi * df["hour"] / 24.0)
    hour_cos = np.cos(2 * np.pi * df["hour"] / 24.0)
    min_sin = np.sin(2 * np.pi * df["minute"] / 60.0)
    min_cos = np.cos(2 * np.pi * df["minute"] / 60.0)

    feature_cols = (
        ["t1", "t2", "hour", "minute"]
        + lag_cols_t1
        + lag_cols_t2
        + DEP_FEATURE_COLS
        + dep_lag_cols
    )
    X = df[feature_cols].copy()
    X["hour_sin"] = hour_sin.values
    X["hour_cos"] = hour_cos.values
    X["min_sin"] = min_sin.values
    X["min_cos"] = min_cos.values

    split = int(len(X) * 0.8)
    X_train, X_val = X.iloc[:split], X.iloc[split:]

    wandb.init(
        project=wandb_project,
        config={
            "model": "xgboost",
            "gpu": "A100-40GB",
            "lookback_hours": lookback_hours,
            "band_minutes": band_minutes,
            "horizons_minutes": horizons_minutes,
            "dep_lag_bands": dep_lag_bands,
            "n_rows_total": len(df),
            "n_features": X.shape[1],
            "train_size": len(X_train),
            "val_size": len(X_val),
        },
    )

    models = {}
    metrics = {}

    for terminal in targets:
        for h_steps in horizon_steps:
            label = f"{terminal}_target_{h_steps}"
            y_train = df[label].iloc[:split]
            y_val = df[label].iloc[split:]

            dtrain = xgb.DMatrix(X_train, label=y_train)
            dval = xgb.DMatrix(X_val, label=y_val)

            params = {
                "objective": "reg:squarederror",
                "eval_metric": "mae",
                "tree_method": "hist",
                "device": "cuda",
                "max_depth": 4,
                "learning_rate": 0.05,
                "subsample": 0.8,
                "colsample_bytree": 0.6,
                "reg_alpha": 0.1,
                "reg_lambda": 1.0,
                "min_child_weight": 5,
                "seed": 42,
            }

            evals_result = {}
            model = xgb.train(
                params,
                dtrain,
                num_boost_round=500,
                evals=[(dtrain, "train"), (dval, "val")],
                early_stopping_rounds=30,
                evals_result=evals_result,
                verbose_eval=25,
            )

            preds = model.predict(dval)
            mae = mean_absolute_error(y_val, preds)
            rmse = np.sqrt(mean_squared_error(y_val, preds))

            model_key = f"{terminal}_h{h_steps * band_minutes}m"
            models[model_key] = model
            metrics[model_key] = {"mae": mae, "rmse": rmse}

            wandb.log(
                {
                    f"{model_key}/mae": mae,
                    f"{model_key}/rmse": rmse,
                    f"{model_key}/best_iteration": model.best_iteration,
                }
            )

            for epoch_idx in range(len(evals_result["train"]["mae"])):
                wandb.log(
                    {
                        f"{model_key}/train_mae": evals_result["train"]["mae"][
                            epoch_idx
                        ],
                        f"{model_key}/val_mae": evals_result["val"]["mae"][epoch_idx],
                        f"{model_key}/epoch": epoch_idx,
                    }
                )

            print(
                f"{model_key}: MAE={mae:.2f}, RMSE={rmse:.2f}, best_iter={model.best_iteration}"
            )

    with tempfile.TemporaryDirectory() as tmpdir:
        artifact_paths = []
        for model_key, model in models.items():
            json_path = os.path.join(tmpdir, f"{model_key}.json")
            model.save_model(json_path)
            artifact_paths.append(json_path)

        meta = {
            "feature_cols": list(X.columns),
            "horizons_minutes": horizons_minutes,
            "band_minutes": band_minutes,
            "lookback_hours": lookback_hours,
            "dep_lag_bands": dep_lag_bands,
            "dep_feature_cols": DEP_FEATURE_COLS,
            "targets": targets,
            "metrics": {
                k: {mk: round(mv, 4) for mk, mv in v.items()}
                for k, v in metrics.items()
            },
        }
        meta_path = os.path.join(tmpdir, "model_meta.json")
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
        artifact_paths.append(meta_path)

        art = wandb.Artifact("eidwtimes-xgboost-sm", type="model")
        for p in artifact_paths:
            art.add_file(p)
        wandb.log_artifact(art)

        api = HfApi(token=os.environ.get("HF_TOKEN"))
        try:
            api.create_repo(hf_repo, repo_type="model", exist_ok=True)
        except Exception:
            pass

        for p in artifact_paths:
            api.upload_file(
                path_or_fileobj=p,
                path_in_repo=os.path.basename(p),
                repo_id=hf_repo,
                repo_type="model",
            )
        print(f"Published {len(artifact_paths)} files to hf.co/{hf_repo}")

    wandb.finish()
    return metrics


@app.local_entrypoint()
def main():
    result = train.remote()
    print("Training complete. Metrics:")
    for k, v in result.items():
        print(f"  {k}: {v}")

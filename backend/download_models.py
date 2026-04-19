import os
from huggingface_hub import hf_hub_download
import shutil

HF_REPO = "unknown-wdie/xgboost-sm"  # "wdie" is eidw backwards
MODEL_DIR = "/app/models"
MODEL_KEYS = [
    "t1_h60m",
    "t1_h120m",
    "t1_h180m",
    "t2_h60m",
    "t2_h120m",
    "t2_h180m",
]

HF_TOKEN = os.environ.get("HF_TOKEN")
if not HF_TOKEN:
    raise RuntimeError("HF_TOKEN not set")

os.makedirs(MODEL_DIR, exist_ok=True)

for filename in ["model_meta.json"] + [f"{k}.json" for k in MODEL_KEYS]:
    print(f"Downloading {filename}...")
    cached = hf_hub_download(
        repo_id=HF_REPO,
        filename=filename,
        token=HF_TOKEN,
        repo_type="model",
    )
    shutil.copy2(cached, os.path.join(MODEL_DIR, filename))

print(f"Done — {MODEL_DIR}")

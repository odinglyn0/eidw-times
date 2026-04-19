import hashlib
import hmac as hmac_mod
import json
import logging
import math
import os
import time

logger = logging.getLogger(__name__)

DATAPULSE_SECRET = os.environ.get("DATAPULSE_SECRET", os.environ.get("DATAGRAM_SIGNING_KEY", ""))
DATAPULSE_BASELINE_WINDOW = 10
DATAPULSE_DEVIATION_THRESHOLD = 3.5
DATAPULSE_MIN_SAMPLES = 3
DATAPULSE_SEAL_TTL = 86400

_redis_ref = None


def _get_redis():
    global _redis_ref
    if _redis_ref is not None:
        return _redis_ref
    try:
        from redis_middleware import _get_redis as _mw_redis
        _redis_ref = _mw_redis()
        return _redis_ref
    except Exception:
        return None


def _hmac_sha256(key: str, data: str) -> str:
    return hmac_mod.new(key.encode(), data.encode(), hashlib.sha256).hexdigest()


def datapulse_extract_seal(headers: dict) -> dict | None:
    raw = headers.get("X-Datapulse-Seal")
    if not raw:
        return None
    try:
        decoded = json.loads(raw)
        return decoded
    except Exception:
        return None


def datapulse_verify_seal_signature(seal: dict, fingerprint: str) -> bool:
    provided_sig = seal.get("sig")
    if not provided_sig:
        return False

    payload = {k: v for k, v in seal.items() if k != "sig"}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))

    now_bucket = int(time.time()) // 300
    for bucket in [now_bucket, now_bucket - 1, now_bucket + 1]:
        session_key = _hmac_sha256(DATAPULSE_SECRET, f"session|{fingerprint}|{bucket}")[:32]
        expected = _hmac_sha256(session_key, f"{fingerprint}|{canonical}")
        if hmac_mod.compare_digest(provided_sig, expected):
            return True

    return False


def datapulse_compute_entropy(seal: dict) -> float:
    mouse_entropy = seal.get("me", 0)
    scroll_entropy = seal.get("se", 0)
    key_entropy = seal.get("ke", 0)
    touch_entropy = seal.get("te", 0)
    idle_ratio = seal.get("ir", 0)
    event_count = seal.get("ec", 0)

    if event_count < 5:
        return 0.0

    raw = (
        mouse_entropy * 0.35
        + scroll_entropy * 0.20
        + key_entropy * 0.15
        + touch_entropy * 0.20
        + (1.0 - idle_ratio) * 0.10
    )

    return round(min(max(raw, 0.0), 1.0), 6)


def datapulse_record_and_check(fingerprint: str, seal: dict) -> tuple[bool, str]:
    r = _get_redis()
    if not r:
        return True, "redis_unavailable"

    try:
        entropy = datapulse_compute_entropy(seal)
        now = int(time.time())

        baseline_key = f"datapulse:baseline:{fingerprint}"
        r.lpush(baseline_key, json.dumps({"e": entropy, "ts": now}))
        r.ltrim(baseline_key, 0, DATAPULSE_BASELINE_WINDOW - 1)
        r.expire(baseline_key, DATAPULSE_SEAL_TTL)

        samples_raw = r.lrange(baseline_key, 0, -1)
        samples = [json.loads(s)["e"] for s in samples_raw]

        if len(samples) < DATAPULSE_MIN_SAMPLES:
            return True, "baseline_building"

        mean = sum(samples) / len(samples)
        variance = sum((s - mean) ** 2 for s in samples) / len(samples)
        stddev = math.sqrt(variance) if variance > 0 else 0.01

        deviation = abs(entropy - mean) / stddev if stddev > 0 else 0

        if deviation > DATAPULSE_DEVIATION_THRESHOLD:
            logger.warning(
                f"[DATAPULSE] Behavioral anomaly | fp={fingerprint[:16]}... | "
                f"entropy={entropy:.4f} | mean={mean:.4f} | stddev={stddev:.4f} | "
                f"deviation={deviation:.2f}σ"
            )

            anomaly_key = f"datapulse:anomaly:{fingerprint}"
            count = r.incr(anomaly_key)
            r.expire(anomaly_key, 3600)

            if count >= 3:
                r.setex(
                    f"datapulse:flagged:{fingerprint}",
                    3600,
                    json.dumps({
                        "flagged_at": now,
                        "anomaly_count": count,
                        "last_entropy": entropy,
                        "baseline_mean": mean,
                    }),
                )
                return False, "behavioral_anomaly_threshold"

            return True, f"anomaly_warning_{count}"

        return True, "nominal"
    except Exception as e:
        logger.error(f"[DATAPULSE] Check error: {e}")
        return True, "check_error_passthrough"


def datapulse_is_flagged(fingerprint: str) -> bool:
    r = _get_redis()
    if not r:
        return False
    try:
        return r.exists(f"datapulse:flagged:{fingerprint}") > 0
    except Exception:
        return False


def datapulse_generate_signing_params(fingerprint: str) -> dict:
    session_key = _hmac_sha256(DATAPULSE_SECRET, f"session|{fingerprint}|{int(time.time() // 300)}")
    return {
        "datapulseSessionKey": session_key[:32],
        "datapulseVersion": 2,
    }

import hashlib
import hmac as hmac_mod
import json
import logging
import math
import os
import time

logger = logging.getLogger(__name__)

DATARIFT_SECRET = os.environ.get("DATARIFT_SECRET", os.environ.get("DATAGRAM_SIGNING_KEY", ""))
DATARIFT_MIN_GAP_MS = 10_000
DATARIFT_PERF_RATIO_LOW = 0.2
DATARIFT_PERF_RATIO_HIGH = 5.0
DATARIFT_WINDOW_SIZE = 30
DATARIFT_ANOMALY_THRESHOLD = 6
DATARIFT_BLOCK_AFTER = 3
DATARIFT_TTL = 86400

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


def datarift_extract_temporal(headers: dict) -> dict | None:
    raw = headers.get("X-Datarift-Temporal")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def datarift_verify_signature(temporal: dict, fingerprint: str) -> bool:
    provided_sig = temporal.get("sig")
    if not provided_sig:
        return False

    epoch_key = _hmac_sha256(DATARIFT_SECRET, f"epoch|{fingerprint}")[:24]

    payload = {k: v for k, v in temporal.items() if k != "sig"}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    expected = _hmac_sha256(epoch_key, f"rift|{fingerprint}|{canonical}")

    return hmac_mod.compare_digest(provided_sig, expected)


def datarift_record_and_check(fingerprint: str, temporal: dict, server_time_ms: int) -> tuple[bool, str]:
    r = _get_redis()
    if not r:
        return True, "redis_unavailable"

    try:
        client_perf = temporal.get("perf", 0)
        client_epoch = temporal.get("epoch", 0)
        client_mono = temporal.get("mono", 0)
        seq = temporal.get("seq", 0)

        clock_offset = server_time_ms - client_epoch

        timeline_key = f"datarift:timeline:{fingerprint}"

        entry = json.dumps({
            "server_ms": server_time_ms,
            "client_epoch": client_epoch,
            "client_perf": client_perf,
            "client_mono": client_mono,
            "offset": clock_offset,
            "seq": seq,
        })

        r.lpush(timeline_key, entry)
        r.ltrim(timeline_key, 0, DATARIFT_WINDOW_SIZE - 1)
        r.expire(timeline_key, DATARIFT_TTL)

        samples_raw = r.lrange(timeline_key, 0, -1)
        samples = [json.loads(s) for s in samples_raw]
        samples.reverse()

        if len(samples) < 2:
            return True, "timeline_building"

        anomaly_score = 0

        for i in range(1, len(samples)):
            if samples[i]["seq"] <= samples[i - 1]["seq"]:
                anomaly_score += 3

        for i in range(1, len(samples)):
            server_gap = samples[i]["server_ms"] - samples[i - 1]["server_ms"]
            if server_gap < DATARIFT_MIN_GAP_MS:
                continue

            perf_diff = samples[i]["client_perf"] - samples[i - 1]["client_perf"]
            if perf_diff <= 0:
                anomaly_score += 3
                continue

            perf_ratio = perf_diff / server_gap
            if perf_ratio < DATARIFT_PERF_RATIO_LOW or perf_ratio > DATARIFT_PERF_RATIO_HIGH:
                anomaly_score += 2

            mono_diff = samples[i]["client_mono"] - samples[i - 1]["client_mono"]
            if mono_diff <= 0:
                anomaly_score += 3

        qualified_offsets = []
        for i in range(1, len(samples)):
            server_gap = samples[i]["server_ms"] - samples[i - 1]["server_ms"]
            if server_gap >= DATARIFT_MIN_GAP_MS:
                d_offset = samples[i]["offset"] - samples[i - 1]["offset"]
                rate = d_offset / server_gap
                qualified_offsets.append(rate)

        if len(qualified_offsets) >= 3:
            mean_drift = sum(qualified_offsets) / len(qualified_offsets)
            variance = sum((d - mean_drift) ** 2 for d in qualified_offsets) / len(qualified_offsets)
            stddev = math.sqrt(variance) if variance > 0 else 0
            if stddev > 0:
                latest_z = abs(qualified_offsets[-1] - mean_drift) / stddev
                if latest_z > 4.0:
                    anomaly_score += 2

        if anomaly_score >= DATARIFT_ANOMALY_THRESHOLD:
            logger.warning(
                f"[DATARIFT] Temporal anomaly | fp={fingerprint[:16]}... | "
                f"anomaly_score={anomaly_score} | samples={len(samples)}"
            )

            flag_key = f"datarift:flagged:{fingerprint}"
            count = r.incr(flag_key)
            r.expire(flag_key, 3600)

            if count >= DATARIFT_BLOCK_AFTER:
                r.setex(
                    f"datarift:blocked:{fingerprint}",
                    1800,
                    json.dumps({
                        "blocked_at": int(time.time()),
                        "anomaly_score": anomaly_score,
                    }),
                )
                return False, "chrono_drift_blocked"

            return True, f"chrono_warning_{count}"

        return True, "temporal_nominal"
    except Exception as e:
        logger.error(f"[DATARIFT] Check error: {e}")
        return True, "check_error_passthrough"


def datarift_is_blocked(fingerprint: str) -> bool:
    r = _get_redis()
    if not r:
        return False
    try:
        return r.exists(f"datarift:blocked:{fingerprint}") > 0
    except Exception:
        return False


def datarift_generate_params(fingerprint: str) -> dict:
    epoch_key = _hmac_sha256(DATARIFT_SECRET, f"epoch|{fingerprint}")
    return {
        "datariftEpochKey": epoch_key[:24],
        "datariftVersion": 1,
    }

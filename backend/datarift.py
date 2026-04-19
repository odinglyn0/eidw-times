import hashlib
import hmac as hmac_mod
import json
import logging
import math
import os
import time

logger = logging.getLogger(__name__)

DATARIFT_SECRET = os.environ.get("DATARIFT_SECRET", os.environ.get("DATAGRAM_SIGNING_KEY", ""))
DATARIFT_MAX_DRIFT_RATE = 0.05
DATARIFT_MIN_SAMPLES = 4
DATARIFT_WINDOW_SIZE = 20
DATARIFT_ANOMALY_THRESHOLD = 3
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

        now_ms = server_time_ms
        clock_offset = now_ms - client_epoch

        timeline_key = f"datarift:timeline:{fingerprint}"

        entry = json.dumps({
            "server_ms": now_ms,
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

        if len(samples) < DATARIFT_MIN_SAMPLES:
            return True, "timeline_building"

        offsets = [s["offset"] for s in samples]
        server_times = [s["server_ms"] for s in samples]

        drift_rates = []
        for i in range(1, len(offsets)):
            dt_server = server_times[i] - server_times[i - 1]
            if dt_server > 0:
                d_offset = offsets[i] - offsets[i - 1]
                rate = d_offset / dt_server
                drift_rates.append(rate)

        if not drift_rates:
            return True, "insufficient_drift_data"

        mean_drift = sum(drift_rates) / len(drift_rates)
        variance = sum((d - mean_drift) ** 2 for d in drift_rates) / len(drift_rates)
        stddev = math.sqrt(variance) if variance > 0 else 0

        latest_rate = drift_rates[-1]
        if stddev > 0 and len(drift_rates) >= 3:
            z_score = abs(latest_rate - mean_drift) / stddev
        else:
            z_score = 0

        mono_violations = 0
        for i in range(1, len(samples)):
            if samples[i]["client_mono"] <= samples[i - 1]["client_mono"]:
                mono_violations += 1
            if samples[i]["seq"] <= samples[i - 1]["seq"]:
                mono_violations += 1

        perf_jumps = 0
        for i in range(1, len(samples)):
            perf_diff = samples[i]["client_perf"] - samples[i - 1]["client_perf"]
            server_diff = samples[i]["server_ms"] - samples[i - 1]["server_ms"]
            if server_diff > 0:
                perf_ratio = perf_diff / server_diff
                if perf_ratio < 0.5 or perf_ratio > 2.0:
                    perf_jumps += 1

        anomaly_score = mono_violations * 2 + perf_jumps + (1 if z_score > 3.0 else 0)

        if anomaly_score >= DATARIFT_ANOMALY_THRESHOLD:
            logger.warning(
                f"[DATARIFT] Temporal anomaly | fp={fingerprint[:16]}... | "
                f"anomaly_score={anomaly_score} | z_score={z_score:.2f} | "
                f"mono_violations={mono_violations} | perf_jumps={perf_jumps} | "
                f"mean_drift={mean_drift:.6f}"
            )

            flag_key = f"datarift:flagged:{fingerprint}"
            count = r.incr(flag_key)
            r.expire(flag_key, 3600)

            if count >= 2:
                r.setex(
                    f"datarift:blocked:{fingerprint}",
                    3600,
                    json.dumps({
                        "blocked_at": int(time.time()),
                        "anomaly_score": anomaly_score,
                        "z_score": z_score,
                        "mono_violations": mono_violations,
                        "perf_jumps": perf_jumps,
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

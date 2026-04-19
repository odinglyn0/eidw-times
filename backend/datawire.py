import hashlib
import hmac as hmac_mod
import json
import logging
import os
import secrets
import time

logger = logging.getLogger(__name__)

DATAWIRE_SECRET = os.environ.get("DATAWIRE_SECRET", os.environ.get("DATAGRAM_SIGNING_KEY", ""))
DATAWIRE_CANARY_COUNT = 100
DATAWIRE_BLACKHOLE_TTL = 86400 * 7

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


def _hmac_sha512(key: str, data: str) -> str:
    return hmac_mod.new(key.encode(), data.encode(), hashlib.sha512).hexdigest()


def _sha512(data: str) -> str:
    return hashlib.sha512(data.encode()).hexdigest()


CANARY_ROUTE_TEMPLATES = [
    "/api/internal-metrics",
    "/api/admin-config",
    "/api/debug-trace",
    "/api/session-export",
    "/api/token-refresh",
    "/api/cache-purge",
    "/api/health-deep",
    "/api/audit-log",
]


def datawire_generate_canaries(fingerprint: str, fp_hmac_prefix: str, route_key: str, signing_key: str, exp: int) -> dict:
    canaries = {}

    for i in range(DATAWIRE_CANARY_COUNT):
        seed = _hmac_sha512(DATAWIRE_SECRET, f"canary|{fingerprint}|{exp}|{i}")
        idx = int(seed[:4], 16) % len(CANARY_ROUTE_TEMPLATES)
        fake_route = CANARY_ROUTE_TEMPLATES[idx]
        suffix = seed[4:16]
        canary_route = f"{fake_route}-{suffix}"

        hashed_path = _hmac_sha512(route_key, canary_route)[:24]
        per_route_hs_key = _hmac_sha512(signing_key, route_key + "|" + canary_route)
        sign_payload = f"datagram.eidwtimes.xyz/{fp_hmac_prefix}/{hashed_path}|{exp}"
        cookie_value = _hmac_sha512(per_route_hs_key, sign_payload)

        canary_id = seed[16:32]
        cookie_name = f"_cw_{hashed_path[:6]}"

        r = _get_redis()
        if r:
            try:
                r.setex(
                    f"datawire:canary:{hashed_path}",
                    86400,
                    json.dumps({
                        "fp": fingerprint,
                        "canary_id": canary_id,
                        "fake_route": canary_route,
                        "created": int(time.time()),
                    }),
                )
            except Exception as e:
                logger.error(f"[DATAWIRE] Redis canary store failed: {e}")

        canaries[canary_route] = {
            "path": hashed_path,
            "cookieName": cookie_name,
            "cookieValue": cookie_value,
            "hsKey": per_route_hs_key[:32],
        }

    return canaries


def datawire_check_canary_trip(hashed_path: str, client_ip: str) -> tuple[bool, str]:
    r = _get_redis()
    if not r:
        return False, ""

    try:
        raw = r.get(f"datawire:canary:{hashed_path}")
        if not raw:
            return False, ""

        canary = json.loads(raw)
        fingerprint = canary["fp"]

        logger.warning(
            f"[DATAWIRE] CANARY TRIPPED | fp={fingerprint[:16]}... | ip={client_ip} | "
            f"canary_id={canary['canary_id']} | fake_route={canary['fake_route']}"
        )

        r.setex(
            f"datawire:blackhole:fp:{fingerprint}",
            DATAWIRE_BLACKHOLE_TTL,
            json.dumps({
                "tripped_at": int(time.time()),
                "ip": client_ip,
                "canary_id": canary["canary_id"],
                "fake_route": canary["fake_route"],
            }),
        )

        r.setex(
            f"datawire:blackhole:ip:{client_ip}",
            DATAWIRE_BLACKHOLE_TTL,
            json.dumps({
                "tripped_at": int(time.time()),
                "fp": fingerprint,
                "canary_id": canary["canary_id"],
            }),
        )

        r.incr("datawire:trip_count")

        r.delete(f"datawire:canary:{hashed_path}")

        datawire_rotate_manifest(fingerprint)

        return True, fingerprint
    except Exception as e:
        logger.error(f"[DATAWIRE] Canary check error: {e}")
        return False, ""


def datawire_is_blackholed(fingerprint: str, client_ip: str) -> bool:
    r = _get_redis()
    if not r:
        return False
    try:
        if r.exists(f"datawire:blackhole:fp:{fingerprint}"):
            return True
        if r.exists(f"datawire:blackhole:ip:{client_ip}"):
            return True
        return False
    except Exception:
        return False


def datawire_rotate_manifest(fingerprint: str):
    r = _get_redis()
    if not r:
        return
    try:
        r.setex(
            f"datawire:rotated:{fingerprint}",
            86400,
            json.dumps({
                "rotated_at": int(time.time()),
                "reason": "canary_trip",
            }),
        )
        keys = r.keys(f"datawire:canary:*")
        for key in keys:
            try:
                raw = r.get(key)
                if raw:
                    data = json.loads(raw)
                    if data.get("fp") == fingerprint:
                        r.delete(key)
            except Exception:
                continue
    except Exception as e:
        logger.error(f"[DATAWIRE] Manifest rotation error: {e}")

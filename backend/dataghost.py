import hashlib
import hmac as hmac_mod
import json
import logging
import os
import secrets
import time

logger = logging.getLogger(__name__)

DATAGHOST_SECRET = os.environ.get("DATAGHOST_SECRET", os.environ.get("DATAGRAM_SIGNING_KEY", ""))
DATAGHOST_ROTATION_INTERVAL = 60
DATAGHOST_PHANTOM_TTL = 300
DATAGHOST_TRAP_TTL = 86400

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


def _hmac_sha512(key: str, data: str) -> str:
    return hmac_mod.new(key.encode(), data.encode(), hashlib.sha512).hexdigest()


def _derive_rotation_key(base_key: str, minute_bucket: int) -> str:
    return _hmac_sha256(base_key, f"ghost_rotation|{minute_bucket}")


def _current_minute_bucket() -> int:
    return int(time.time()) // DATAGHOST_ROTATION_INTERVAL


def dataghost_generate_phantom(fingerprint: str, route: str, response_hash: str) -> str:
    minute_bucket = _current_minute_bucket()
    rotation_key = _derive_rotation_key(DATAGHOST_SECRET, minute_bucket)

    phantom_id = secrets.token_hex(12)
    phantom_payload = f"{phantom_id}|{fingerprint}|{route}|{response_hash}|{minute_bucket}"
    phantom_sig = _hmac_sha512(rotation_key, phantom_payload)

    phantom_blob = json.dumps({
        "pid": phantom_id,
        "mb": minute_bucket,
        "sig": phantom_sig[:48],
        "entropy": secrets.token_hex(16),
    }, separators=(",", ":"))

    r = _get_redis()
    if r:
        try:
            r.setex(
                f"dataghost:phantom:{phantom_id}",
                DATAGHOST_PHANTOM_TTL,
                json.dumps({
                    "fp": fingerprint,
                    "route": route,
                    "response_hash": response_hash,
                    "minute_bucket": minute_bucket,
                    "created": int(time.time()),
                }),
            )
        except Exception as e:
            logger.error(f"[DATAGHOST] Phantom store failed: {e}")

    return phantom_blob


def dataghost_check_replay(request_body: bytes, fingerprint: str, client_ip: str) -> tuple[bool, str]:
    r = _get_redis()
    if not r:
        return False, ""

    try:
        try:
            body_str = request_body.decode("utf-8")
        except Exception:
            return False, ""

        try:
            parsed = json.loads(body_str)
        except Exception:
            return False, ""

        phantom_raw = parsed.get("_phantom")
        if not phantom_raw:
            return False, ""

        if isinstance(phantom_raw, str):
            try:
                phantom = json.loads(phantom_raw)
            except Exception:
                return False, ""
        elif isinstance(phantom_raw, dict):
            phantom = phantom_raw
        else:
            return False, ""

        phantom_id = phantom.get("pid")
        if not phantom_id:
            return False, ""

        stored_raw = r.get(f"dataghost:phantom:{phantom_id}")
        if not stored_raw:
            trap_check = r.get(f"dataghost:seen:{phantom_id}")
            if trap_check:
                logger.warning(
                    f"[DATAGHOST] PHANTOM REPLAY DETECTED | fp={fingerprint[:16]}... | "
                    f"ip={client_ip} | phantom_id={phantom_id}"
                )

                r.setex(
                    f"dataghost:trapped:fp:{fingerprint}",
                    DATAGHOST_TRAP_TTL,
                    json.dumps({
                        "trapped_at": int(time.time()),
                        "ip": client_ip,
                        "phantom_id": phantom_id,
                    }),
                )

                r.setex(
                    f"dataghost:trapped:ip:{client_ip}",
                    DATAGHOST_TRAP_TTL,
                    json.dumps({
                        "trapped_at": int(time.time()),
                        "fp": fingerprint,
                        "phantom_id": phantom_id,
                    }),
                )

                r.incr("dataghost:trap_count")

                return True, phantom_id
            return False, ""

        r.setex(f"dataghost:seen:{phantom_id}", DATAGHOST_PHANTOM_TTL * 2, "1")

        return False, ""
    except Exception as e:
        logger.error(f"[DATAGHOST] Replay check error: {e}")
        return False, ""


def dataghost_is_trapped(fingerprint: str, client_ip: str) -> bool:
    r = _get_redis()
    if not r:
        return False
    try:
        if r.exists(f"dataghost:trapped:fp:{fingerprint}"):
            return True
        if r.exists(f"dataghost:trapped:ip:{client_ip}"):
            return True
        return False
    except Exception:
        return False


def dataghost_wrap_response(response_data: bytes, fingerprint: str, route: str) -> bytes:
    try:
        response_hash = hashlib.sha256(response_data).hexdigest()[:16]
        phantom_blob = dataghost_generate_phantom(fingerprint, route, response_hash)

        try:
            parsed = json.loads(response_data)
        except Exception:
            return response_data

        if isinstance(parsed, dict):
            wrapped = {"_phantom": phantom_blob, "_payload": parsed}
        elif isinstance(parsed, list):
            wrapped = {"_phantom": phantom_blob, "_payload": parsed}
        else:
            return response_data

        return json.dumps(wrapped, separators=(",", ":")).encode()
    except Exception as e:
        logger.error(f"[DATAGHOST] Wrap error: {e}")
        return response_data

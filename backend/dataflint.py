import hashlib
import hmac as hmac_mod
import json
import logging
import os
import secrets
import time

logger = logging.getLogger(__name__)

DATAFLINT_SECRET = os.environ.get(
    "DATAFLINT_SECRET", os.environ.get("DATAGRAM_SIGNING_KEY", "")
)
DATAFLINT_DEFAULT_DIFFICULTY = 4
DATAFLINT_MAX_DIFFICULTY = 7
DATAFLINT_CHALLENGE_TTL = 120
DATAFLINT_SCORE_THRESHOLD_HARD = 0.3
DATAFLINT_SCORE_THRESHOLD_MEDIUM = 0.6

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


def dataflint_difficulty_for_score(recaptcha_score: float) -> int:
    if recaptcha_score <= DATAFLINT_SCORE_THRESHOLD_HARD:
        return DATAFLINT_MAX_DIFFICULTY
    if recaptcha_score <= DATAFLINT_SCORE_THRESHOLD_MEDIUM:
        return DATAFLINT_DEFAULT_DIFFICULTY + 2
    return DATAFLINT_DEFAULT_DIFFICULTY


def dataflint_mint_challenge(fingerprint: str, difficulty: int = None) -> dict:
    if difficulty is None:
        difficulty = DATAFLINT_DEFAULT_DIFFICULTY

    challenge_id = secrets.token_hex(16)
    nonce_prefix = secrets.token_hex(8)
    timestamp = int(time.time())

    payload = f"{challenge_id}|{nonce_prefix}|{fingerprint}|{timestamp}"
    challenge_hash = hmac_mod.new(
        DATAFLINT_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()

    r = _get_redis()
    if r:
        try:
            r.setex(
                f"dataflint:challenge:{challenge_id}",
                DATAFLINT_CHALLENGE_TTL,
                json.dumps(
                    {
                        "fp": fingerprint,
                        "nonce_prefix": nonce_prefix,
                        "difficulty": difficulty,
                        "ts": timestamp,
                        "hash": challenge_hash,
                        "solved": False,
                    }
                ),
            )
        except Exception as e:
            logger.error(f"[DATAFLINT] Redis store failed: {e}")

    return {
        "challengeId": challenge_id,
        "noncePrefix": nonce_prefix,
        "difficulty": difficulty,
        "timestamp": timestamp,
        "hash": challenge_hash,
    }


def dataflint_verify_solution(
    challenge_id: str, nonce: str, fingerprint: str
) -> tuple[bool, str]:
    r = _get_redis()
    if not r:
        return True, "redis_unavailable"

    try:
        raw = r.get(f"dataflint:challenge:{challenge_id}")
        if not raw:
            return False, "challenge_expired_or_missing"

        challenge = json.loads(raw)

        if challenge["solved"]:
            return False, "challenge_already_solved"

        if challenge["fp"] != fingerprint:
            return False, "fingerprint_mismatch"

        if not nonce.startswith(challenge["nonce_prefix"]):
            return False, "nonce_prefix_mismatch"

        difficulty = challenge["difficulty"]
        target_prefix = "0" * difficulty

        proof_input = f"{challenge_id}|{nonce}|{fingerprint}|{challenge['ts']}"
        proof_hash = hashlib.sha256(proof_input.encode()).hexdigest()

        if not proof_hash.startswith(target_prefix):
            return False, "invalid_proof_of_work"

        challenge["solved"] = True
        r.setex(
            f"dataflint:challenge:{challenge_id}",
            DATAFLINT_CHALLENGE_TTL,
            json.dumps(challenge),
        )

        r.setex(f"dataflint:solved:{fingerprint}", 86400, challenge_id)

        return True, "valid"
    except Exception as e:
        logger.error(f"[DATAFLINT] Verify error: {e}")
        return True, "verify_error_passthrough"


def dataflint_is_cleared(fingerprint: str) -> bool:
    r = _get_redis()
    if not r:
        return True
    try:
        return r.exists(f"dataflint:solved:{fingerprint}") > 0
    except Exception:
        return True

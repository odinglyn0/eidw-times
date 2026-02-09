import os
import time
import json
import hashlib
import logging
from flask import request, jsonify, g

try:
    from upstash_redis import Redis
except ImportError:
    Redis = None

logger = logging.getLogger(__name__)

UPSTASH_REDIS_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "")
UPSTASH_REDIS_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")

_redis = None


def _get_redis():
    global _redis
    if _redis is not None:
        return _redis
    if not Redis:
        return None
    if not UPSTASH_REDIS_URL or not UPSTASH_REDIS_TOKEN:
        return None
    try:
        _redis = Redis(url=UPSTASH_REDIS_URL, token=UPSTASH_REDIS_TOKEN)
        return _redis
    except Exception as e:
        logger.error(f"[upstash] Failed to connect: {e}")
        return None


def _token_bucket_check(redis_client, key, capacity, refill_rate, window_secs):
    now_ms = int(time.time() * 1000)
    lua = """
    local key       = KEYS[1]
    local capacity  = tonumber(ARGV[1])
    local refill    = tonumber(ARGV[2])
    local now_ms    = tonumber(ARGV[3])
    local ttl_s     = tonumber(ARGV[4])

    local data = redis.call('HMGET', key, 'tokens', 'last_ms')
    local tokens  = tonumber(data[1])
    local last_ms = tonumber(data[2])

    if tokens == nil then
        tokens  = capacity
        last_ms = now_ms
    end

    local elapsed = math.max(0, now_ms - last_ms)
    tokens = math.min(capacity, tokens + (elapsed / 1000.0) * refill)

    local allowed = 0
    if tokens >= 1 then
        tokens = tokens - 1
        allowed = 1
    end

    redis.call('HMSET', key, 'tokens', tostring(tokens), 'last_ms', tostring(now_ms))
    redis.call('EXPIRE', key, ttl_s)

    return {allowed, tostring(math.floor(tokens))}
    """
    try:
        result = redis_client.eval(
            lua,
            keys=[key],
            args=[str(capacity), str(refill_rate), str(now_ms), str(window_secs)]
        )
        return int(result[0]) == 1
    except Exception as e:
        logger.error(f"[upstash] token bucket error: {e}")
        return False


def _get_token_hash():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return hashlib.sha256(auth[7:].encode()).hexdigest()[:16]
    cf_ip = request.headers.get("CF-Connecting-IP", "")
    if cf_ip:
        return hashlib.sha256(cf_ip.strip().encode()).hexdigest()[:16]
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return hashlib.sha256(forwarded.split(",")[0].strip().encode()).hexdigest()[:16]
    return hashlib.sha256((request.remote_addr or "unknown").encode()).hexdigest()[:16]


def rate_limit_middleware(app):
    @app.before_request
    def _check_rate_limits():
        if request.method == "OPTIONS":
            return None
        if not request.path.startswith("/api/"):
            return None

        redis_client = _get_redis()
        if not redis_client:
            return jsonify({"error": "Service unavailable"}), 503

        token_hash = _get_token_hash()
        endpoint = request.path

        if not _token_bucket_check(redis_client, f"rl:ep:{token_hash}:{endpoint}", 24, 1, 30):
            logger.warning(f"[rate-limit] Per-endpoint limit: {token_hash} -> {endpoint}")
            return jsonify({"error": "Rate limit exceeded"}), 429

        if not _token_bucket_check(redis_client, f"rl:global:{token_hash}", 100, 10, 60):
            logger.warning(f"[rate-limit] Global limit: {token_hash}")
            return jsonify({"error": "Rate limit exceeded"}), 429

        return None


CACHE_TTL = 300

CACHEABLE_ENDPOINTS = {
    "/api/current-security-data":    {"method": "GET",  "key_from": "path"},
    "/api/security-data":            {"method": "GET",  "key_from": "path"},
    "/api/recommendation":           {"method": "GET",  "key_from": "path"},
    "/api/facility-hours":           {"method": "GET",  "key_from": "path"},
    "/api/active-announcements":     {"method": "GET",  "key_from": "path"},
    "/api/last-departures":          {"method": "GET",  "key_from": "path"},
    "/api/seo-security-data":        {"method": "GET",  "key_from": "path"},
    "/api/processed-security-data":  {"method": "GET",  "key_from": "query"},
    "/api/processed-departure-data": {"method": "GET",  "key_from": "query"},
    "/api/departure-data":           {"method": "POST", "key_from": "body"},
    "/api/range-security-data":      {"method": "POST", "key_from": "body"},
    "/api/range-departure-data":     {"method": "POST", "key_from": "body"},
    "/api/chart-data":               {"method": "POST", "key_from": "body"},
    "/api/simulate/gamma/method-c":  {"method": "POST", "key_from": "body"},
}


def _build_cache_key(endpoint, config):
    strategy = config["key_from"]
    if strategy == "path":
        return f"cache:{endpoint}"
    elif strategy == "query":
        h = hashlib.md5(request.query_string).hexdigest()[:12]
        return f"cache:{endpoint}:{h}"
    elif strategy == "body":
        try:
            body = request.get_data(as_text=True) or ""
            h = hashlib.md5(body.encode()).hexdigest()[:12]
            return f"cache:{endpoint}:{h}"
        except Exception:
            return None
    return None


def response_cache_middleware(app):
    @app.before_request
    def _cache_check():
        if request.method == "OPTIONS":
            return None

        config = CACHEABLE_ENDPOINTS.get(request.path)
        if not config or request.method != config["method"]:
            return None

        redis_client = _get_redis()
        if not redis_client:
            return None

        cache_key = _build_cache_key(request.path, config)
        if not cache_key:
            return None

        try:
            cached = redis_client.get(cache_key)
            if cached:
                if isinstance(cached, bytes):
                    cached = cached.decode("utf-8")
                resp = jsonify(json.loads(cached))
                resp.headers["X-Cache"] = "HIT"
                return resp
        except Exception:
            pass

        g._cache_key = cache_key
        return None

    @app.after_request
    def _cache_store(response):
        cache_key = getattr(g, '_cache_key', None)
        if not cache_key:
            return response
        if response.status_code != 200:
            return response
        if not response.content_type or "json" not in response.content_type:
            return response

        redis_client = _get_redis()
        if not redis_client:
            return response

        try:
            redis_client.set(cache_key, response.get_data(as_text=True), ex=CACHE_TTL)
            response.headers["X-Cache"] = "MISS"
        except Exception:
            pass

        return response

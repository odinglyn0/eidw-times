import os
import json
import logging
import hashlib
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from zoneinfo import ZoneInfo
from flask import Flask, request, jsonify, make_response, g
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np
import jwt
from google.cloud import recaptchaenterprise_v1
from google.cloud.recaptchaenterprise_v1 import Assessment
from upstash_middleware import rate_limit_middleware, response_cache_middleware

import hmac as hmac_mod

app = Flask(__name__)
CORS(app, origins=[
    r"https://datagram\.eidwtimes\.xyz",
    r"https://eidwtimes\.xyz",
    r"https://romeo-api-b\.eidwtimes\.xyz",
    r"http://localhost:8080",
    r"http://localhost:3000",
], supports_credentials=True, allow_headers=[
    "Content-Type", "Authorization", "X-Session-Fingerprint",
    "X-Datagram-Cookie", "X-Datagram-Exp", "X-Datagram-RK", "X-Datagram-CV",
])
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

class ISOJSONProvider(app.json_provider_class):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

app.json_provider_class = ISOJSONProvider
app.json = ISOJSONProvider(app)

DATABASE_URL = os.environ.get('DATABASE_URL')
DUBLIN_TZ = ZoneInfo("Europe/Dublin")
RECAPTCHA_SITE_KEY = os.environ.get('RECAPTCHA_SITE_KEY', '')
GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', '')
BOUNCE_TOKEN_SECRET = os.environ.get('BOUNCE_TOKEN_SECRET')
DATAGRAM_SIGNING_KEY = os.environ.get('DATAGRAM_SIGNING_KEY')
RECAPTCHA_SCORE_THRESHOLD = 0.5

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def _verify_recaptcha_enterprise(token, expected_action=None):
    logging.info(f"[RECAPTCHA] Starting assessment | site_key={RECAPTCHA_SITE_KEY[:8]}... | project={GCP_PROJECT_ID} | expected_action={expected_action} | token_len={len(token) if token else 0}")
    client = recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient()
    event = recaptchaenterprise_v1.Event()
    event.site_key = RECAPTCHA_SITE_KEY
    event.token = token
    assessment = recaptchaenterprise_v1.Assessment()
    assessment.event = event
    req = recaptchaenterprise_v1.CreateAssessmentRequest()
    req.assessment = assessment
    req.parent = f"projects/{GCP_PROJECT_ID}"
    response = client.create_assessment(req)
    logging.info(f"[RECAPTCHA] Assessment response | valid={response.token_properties.valid} | invalid_reason={response.token_properties.invalid_reason} | action={response.token_properties.action} | score={response.risk_analysis.score} | reasons={list(response.risk_analysis.reasons)}")
    if not response.token_properties.valid:
        logging.warning(f"[RECAPTCHA] Token INVALID: reason={response.token_properties.invalid_reason}")
        return False, 0.0
    if expected_action and response.token_properties.action != expected_action:
        logging.warning(f"[RECAPTCHA] Action mismatch: expected={expected_action} got={response.token_properties.action}")
    return True, response.risk_analysis.score


def _mint_bounce_token(client_ip, fingerprint, country):
    payload = {
        "ip": client_ip,
        "fp": fingerprint,
        "co": country,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=1),
        "type": "elasticBounceTokenScreen",
    }
    return jwt.encode(payload, BOUNCE_TOKEN_SECRET, algorithm="HS512")


def _get_client_ip():
    cf_ip = request.headers.get("CF-Connecting-IP", "")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _get_client_country():
    return request.headers.get("CF-IPCountry", "XX")


def _hmac_sha512(key: str, data: str) -> str:
    return hmac_mod.new(key.encode(), data.encode(), hashlib.sha512).hexdigest()


def _sha512(data: str) -> str:
    return hashlib.sha512(data.encode()).hexdigest()


def _verify_datagram_headers() -> tuple[bool, str]:
    dg_cookie_name = request.headers.get("X-Datagram-Cookie", "")
    dg_exp = request.headers.get("X-Datagram-Exp", "")
    dg_rk = request.headers.get("X-Datagram-RK", "")

    if not all([dg_cookie_name, dg_exp, dg_rk]):
        return True, "", ""

    try:
        exp_ts = int(dg_exp)
        if exp_ts < int(datetime.now(timezone.utc).timestamp()):
            return False, "Datagram expired", ""
    except ValueError:
        return False, "Invalid datagram expiry", ""

    path_parts = request.path.strip("/").split("/")
    if len(path_parts) < 2:
        return False, "Invalid datagram path structure", ""
    fp_hmac_prefix = path_parts[0]
    hashed_path = path_parts[1]
    if len(fp_hmac_prefix) != 16 or len(hashed_path) != 24:
        return False, "Invalid datagram path segment lengths", ""

    fp_from_token = getattr(request, 'bounce_claims', {}).get('fp', '')
    if not fp_from_token:
        return True, "", ""

    full_route_key = _sha512(fp_from_token)
    if not full_route_key.startswith(dg_rk):
        return False, "Route key mismatch with bounce token fingerprint", ""

    expected_prefix = _hmac_sha512(DATAGRAM_SIGNING_KEY, fp_from_token)[:16]
    if not hmac_mod.compare_digest(fp_hmac_prefix, expected_prefix):
        return False, "Fingerprint HMAC prefix mismatch", ""

    matched_route = ""
    for route in ALL_KNOWN_ROUTES:
        candidate = _hmac_sha512(full_route_key, route)[:24]
        if hmac_mod.compare_digest(candidate, hashed_path):
            matched_route = route
            break

    if not matched_route:
        return False, "No known route matches hashed path", ""

    per_route_hs_key = _hmac_sha512(DATAGRAM_SIGNING_KEY, full_route_key + "|" + matched_route)
    # change to datagram once its propogated
    sign_payload = f"romeo-api-b.eidwtimes.xyz/{fp_hmac_prefix}/{hashed_path}|{dg_exp}"
    expected_cookie_value = _hmac_sha512(per_route_hs_key, sign_payload)

    actual_cookie_value = request.cookies.get(dg_cookie_name, "")
    if not actual_cookie_value:
        actual_cookie_value = request.headers.get("X-Datagram-CV", "")
    if not actual_cookie_value:
        return False, f"Datagram cookie '{dg_cookie_name}' not found", ""

    if not hmac_mod.compare_digest(actual_cookie_value, expected_cookie_value):
        return False, "Datagram cookie signature mismatch", ""

    return True, "", matched_route


ALL_KNOWN_ROUTES = [
    "/api/security-data",
    "/api/departure-data",
    "/api/hourly-interval-security-data",
    "/api/hourly-interval-departure-data",
    "/api/feature-requests",
    "/api/acknowledged-feature-requests",
    "/api/active-announcements",
    "/api/range-security-data",
    "/api/irish-time",
    "/api/last-departures",
    "/api/facility-hours",
    "/api/simulate/trition/method-b",
    "/api/simulate/liminal/method-b",
    "/api/simulate/trition/method-d",
    "/api/simulate/liminal/method-d",
    "/api/simulate/trition/method-a",
    "/api/simulate/liminal/method-a",
    "/api/simulate/trition/method-c",
    "/api/simulate/liminal/method-c",
    "/api/range-departure-data",
    "/api/recommendation",
    "/api/processed-security-data",
    "/api/processed-departure-data",
    "/api/chart-data",
    "/api/hourly-detail-stats",
    "/api/projected-hourly-stats",
    "/api/bouncetoken/verify",
    "/api/seo-security-data",
    "/api/current-security-data",
]


UNPROTECTED_PATHS = {
    "/api/bouncetoken/verify",
    "/api/seo-security-data",
    "/api/current-security-data",
    "/api/dgrmV2-fp",
}


@app.before_request
def verify_bounce_token():
    if request.method == "OPTIONS":
        return None

    path_parts = request.path.strip("/").split("/")
    is_datagram = (
        len(path_parts) == 2
        and len(path_parts[0]) == 16
        and len(path_parts[1]) == 24
        and all(c in "0123456789abcdef" for c in path_parts[0])
        and all(c in "0123456789abcdef" for c in path_parts[1])
    )

    if not is_datagram:
        if request.path in UNPROTECTED_PATHS:
            return None
        if not request.path.startswith("/api/"):
            return None
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing bounce token"}), 401
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, BOUNCE_TOKEN_SECRET, algorithms=["HS512"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Bounce token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid bounce token"}), 401

        session_fp = request.headers.get("X-Session-Fingerprint", "")
        token_fp = payload.get("fp", "")
        if not session_fp or session_fp != token_fp:
            logging.warning(f"[BOUNCE] Fingerprint mismatch: header={session_fp[:12] if session_fp else 'MISSING'}... token={token_fp[:12] if token_fp else 'MISSING'}...")
            return jsonify({"error": "Session fingerprint mismatch"}), 403

        request.bounce_claims = payload
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Missing bounce token"}), 401
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, BOUNCE_TOKEN_SECRET, algorithms=["HS512"])
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Bounce token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid bounce token"}), 401

    session_fp = request.headers.get("X-Session-Fingerprint", "")
    token_fp = payload.get("fp", "")
    if not session_fp or session_fp != token_fp:
        logging.warning(f"[BOUNCE] Fingerprint mismatch: header={session_fp[:12] if session_fp else 'MISSING'}... token={token_fp[:12] if token_fp else 'MISSING'}...")
        return jsonify({"error": "Session fingerprint mismatch"}), 403

    request.bounce_claims = payload
    dg_valid, dg_reason, resolved_route = _verify_datagram_headers()
    if not dg_valid:
        logging.warning(f"[DATAGRAM] Verification failed: {dg_reason} | ip={_get_client_ip()}")
        return jsonify({"error": "Datagram verification failed"}), 403

    if not resolved_route:
        return jsonify({"error": "Could not resolve datagram route"}), 403

    g._datagram_resolved_route = resolved_route
    return None

rate_limit_middleware(app)
response_cache_middleware(app)


@app.route('/<fp_prefix>/<hashed_path>', methods=['GET', 'POST', 'OPTIONS'])
def datagram_catchall(fp_prefix, hashed_path):
    if request.method == "OPTIONS":
        return "", 200

    resolved = getattr(g, '_datagram_resolved_route', None)
    if not resolved:
        return jsonify({"error": "No resolved datagram route"}), 403

    handler = _ROUTE_DISPATCH.get(resolved)
    if not handler:
        logging.error(f"[DATAGRAM] No handler for resolved route: {resolved}")
        return jsonify({"error": "Datagram dispatch error"}), 500

    try:
        return handler()
    except Exception as e:
        logging.error(f"[DATAGRAM] Dispatch to {resolved} failed: {e}")
        return jsonify({"error": "Datagram dispatch error"}), 500


@app.route('/api/bouncetoken/verify', methods=['POST'])
def bouncetoken_verify():
    try:
        data = request.get_json()
        recaptcha_token = data.get("recaptchaToken")
        fingerprint = data.get("fingerprint")
        client_ip = _get_client_ip()
        country = _get_client_country()

        logging.info(f"[BOUNCE-VERIFY] Request from ip={client_ip} country={country} fp={fingerprint[:12] if fingerprint else 'None'}... token_present={bool(recaptcha_token)}")

        if not recaptcha_token or not fingerprint:
            logging.warning(f"[BOUNCE-VERIFY] Missing fields: recaptchaToken={bool(recaptcha_token)} fingerprint={bool(fingerprint)}")
            return jsonify({"error": "Missing recaptchaToken or fingerprint"}), 400

        try:
            valid, score = _verify_recaptcha_enterprise(recaptcha_token, "bouncetoken_screen")
            logging.info(f"[BOUNCE-VERIFY] Assessment result: valid={valid} score={score} threshold={RECAPTCHA_SCORE_THRESHOLD}")
        except Exception as e:
            logging.error(f"[BOUNCE-VERIFY] Assessment exception: {type(e).__name__}: {e}", exc_info=True)
            return jsonify({"status": "failure"}), 403

        if not valid:
            logging.warning(f"[BOUNCE-VERIFY] Token not valid | ip={client_ip}")
            return jsonify({"status": "failure"}), 403

        if score >= RECAPTCHA_SCORE_THRESHOLD:
            token = _mint_bounce_token(client_ip, fingerprint, country)
            logging.info(f"[BOUNCE-VERIFY] GRANTED | ip={client_ip} score={score}")
            return jsonify({"status": "granted", "elasticBounceTokenScreen": token})

        logging.info(f"[BOUNCE-VERIFY] Score too low ({score} < {RECAPTCHA_SCORE_THRESHOLD}) | ip={client_ip}")
        return jsonify({"status": "failure"}), 403
    except Exception as e:
        logging.error(f"[BOUNCE-VERIFY] Unhandled exception: {type(e).__name__}: {e}", exc_info=True)
        return jsonify({"status": "failure"}), 403


DATAGRAM_HOST = "romeo-api-b.eidwtimes.xyz"
COOKIE_PREFIXES = [
    "_ga_", "_gid_", "__ut", "_fbp_", "_dc_", "mp_", "ajs_", "_hp2_",
    "__hs", "_ce_", "_pk_", "ss_c", "ln_o", "_tt_", "ab_t", "ck_v",
]


@app.route('/api/dgrmV2-fp', methods=['POST'])
def datagram_mint():
    try:
        data = request.get_json()
        fp = data.get("fp") if data else None
        if not fp or not isinstance(fp, str):
            return jsonify({"error": "missing fp"}), 400

        fp_hmac_prefix = _hmac_sha512(DATAGRAM_SIGNING_KEY, fp)[:16]
        route_key = _sha512(fp)
        exp = int(datetime.now(timezone.utc).timestamp()) + 86400

        routes = {}
        for i, route in enumerate(ALL_KNOWN_ROUTES):
            hashed_path = _hmac_sha512(route_key, route)[:24]
            per_route_hs_key = _hmac_sha512(DATAGRAM_SIGNING_KEY, route_key + "|" + route)
            sign_payload = f"{DATAGRAM_HOST}/{fp_hmac_prefix}/{hashed_path}|{exp}"
            cookie_value = _hmac_sha512(per_route_hs_key, sign_payload)
            prefix_idx = (i + int(hashed_path[:2], 16)) % len(COOKIE_PREFIXES)
            cookie_name = COOKIE_PREFIXES[prefix_idx] + hashed_path[:6]

            routes[route] = {
                "path": hashed_path,
                "cookieName": cookie_name,
                "cookieValue": cookie_value,
                "hsKey": per_route_hs_key[:32],
            }

        return jsonify({
            "host": DATAGRAM_HOST,
            "fpPrefix": fp_hmac_prefix,
            "routes": routes,
            "exp": exp,
            "routeKey": route_key[:32],
        })
    except Exception as e:
        logging.error(f"[DATAGRAM-MINT] Error: {type(e).__name__}: {e}", exc_info=True)
        return jsonify({"error": "internal"}), 500


@app.route('/api/current-security-data', methods=['GET'])
def get_current_security_data():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT t1, t2, last_updated FROM security_times_current WHERE id = 1")
                result = cur.fetchone()
                
                if not result:
                    return jsonify({"error": "No current data found"}), 404
                
                return jsonify(dict(result))
    except Exception as e:
        logging.error(f"Error fetching current security data: {e}")
        return jsonify({"error": str(e)}), 500

def get_security_data():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                seven_days_ago = datetime.now(timezone.utc) - timedelta(days=6)
                
                cur.execute("""
                    SELECT timestamp, t1, t2 
                    FROM security_times 
                    WHERE timestamp >= %s 
                    ORDER BY timestamp ASC
                """, (seven_days_ago,))
                
                data = cur.fetchall()
                
                daily_hourly_data = {}
                for item in data:
                    timestamp = item['timestamp']
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=timezone.utc)
                    
                    local_time = timestamp.astimezone(DUBLIN_TZ)
                    date_key = local_time.strftime('%Y-%m-%d')
                    hour = local_time.hour
                    
                    if date_key not in daily_hourly_data:
                        daily_hourly_data[date_key] = {}
                    if hour not in daily_hourly_data[date_key]:
                        daily_hourly_data[date_key][hour] = []
                    
                    daily_hourly_data[date_key][hour].append({
                        't1': item['t1'],
                        't2': item['t2'],
                        'timestamp': local_time.isoformat(),
                    })
                
                historical_data = []
                for i in range(6, -1, -1):
                    date = datetime.now(DUBLIN_TZ) - timedelta(days=i)
                    date_key = date.strftime('%Y-%m-%d')
                    
                    hourly_data = []
                    day_data = daily_hourly_data.get(date_key, {})
                    
                    for hour in range(24):
                        records = day_data.get(hour, [])
                        valid_t1 = [r['t1'] for r in records if r['t1'] is not None]
                        valid_t2 = [r['t2'] for r in records if r['t2'] is not None]
                        avg_t1 = round(sum(valid_t1) / len(valid_t1)) if valid_t1 else None
                        avg_t2 = round(sum(valid_t2) / len(valid_t2)) if valid_t2 else None
                        latest_ts = records[-1]['timestamp'] if records else None
                        
                        hourly_data.append({
                            'hour': hour,
                            't1': avg_t1,
                            't2': avg_t2,
                            'timestamp': latest_ts,
                            'records': records,
                        })
                    
                    historical_data.append({
                        'date': date_key,
                        'hourlyData': hourly_data
                    })
                
                return jsonify(historical_data)
    except Exception as e:
        logging.error(f"Error fetching security data: {e}")
        return jsonify({"error": str(e)}), 500

def get_departure_data():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        three_days_ago = data.get('threeDaysAgo')
        
        if not terminal_id or not three_days_ago:
            return jsonify({"error": "Missing terminalId or threeDaysAgo"}), 400
        
        terminal_name = f"T{terminal_id}"
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE_TRUNC('hour', scheduled_datetime) as departure_datetime,
                        COUNT(*) as departure_count
                    FROM departures
                    WHERE terminal_name = %s AND scheduled_datetime >= %s
                    GROUP BY DATE_TRUNC('hour', scheduled_datetime)
                    ORDER BY departure_datetime ASC
                """, (terminal_name, three_days_ago))
                
                results = cur.fetchall()
                return jsonify([dict(row) for row in results])
    except Exception as e:
        logging.error(f"Error fetching departure data: {e}")
        return jsonify({"error": str(e)}), 500

def get_hourly_interval_security_data():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        timestamp,
                        t1,
                        t2
                    FROM security_times 
                    WHERE timestamp >= NOW() - INTERVAL '24 hours'
                    ORDER BY timestamp ASC
                """)
                
                results = cur.fetchall()
                rows = []
                for row in results:
                    r = dict(row)
                    ts = r.get('timestamp')
                    if ts:
                        if ts.tzinfo is None:
                            ts = ts.replace(tzinfo=timezone.utc)
                        r['timestamp'] = ts.astimezone(DUBLIN_TZ)
                    rows.append(r)
                return jsonify(rows)
    except Exception as e:
        logging.error(f"Error fetching hourly interval security data: {e}")
        return jsonify({"error": str(e)}), 500

def get_hourly_interval_departure_data():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        
        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400
        
        terminal_name = f"T{terminal_id}"
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT scheduled_datetime
                    FROM departures 
                    WHERE terminal_name = %s AND scheduled_datetime >= NOW() - INTERVAL '3 days'
                    ORDER BY scheduled_datetime ASC
                """, (terminal_name,))
                
                departures = cur.fetchall()
                
                from collections import defaultdict
                
                dep_times = [row['scheduled_datetime'] for row in departures]
                hours_with_deps = set()
                for dt in dep_times:
                    hours_with_deps.add(dt.replace(minute=0, second=0, microsecond=0))
                
                results = []
                for hour_start in sorted(hours_with_deps):
                    for minute in range(60):
                        minute_ts = hour_start + timedelta(minutes=minute)
                        count = 0
                        for dep_dt in dep_times:
                            diff = abs((dep_dt - minute_ts).total_seconds())
                            if diff <= 300:
                                count += 1
                        results.append({
                            'timestamp': minute_ts,
                            'count': count
                        })
                
                return jsonify(results)
    except Exception as e:
        logging.error(f"Error fetching hourly interval departure data: {e}")
        return jsonify({"error": str(e)}), 500

def get_active_announcements():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, message, created_at, expires_at 
                    FROM announcements 
                    WHERE (expires_at IS NULL OR expires_at > NOW()) 
                    AND active = true 
                    ORDER BY created_at DESC
                """)
                
                results = cur.fetchall()
                return jsonify([dict(row) for row in results])
    except Exception as e:
        logging.error(f"Error fetching active announcements: {e}")
        return jsonify({"error": str(e)}), 500


FORECAST_HORIZONS = [
    (60, "1 hour"),
    (120, "2 hours"),
    (180, "3 hours"),
]


def _seo_build_forecasts(terminal_id, now_utc, now_dublin):
    preds = _trition_predict_all()
    if not preds:
        return None

    t_key = f"t{terminal_id}"
    horizon_preds = {}
    for key, val in preds.items():
        if key.startswith(t_key + "_h"):
            h_min = int(key.split("_h")[1].replace("m", ""))
            horizon_preds[h_min] = val

    if not horizon_preds:
        return None

    dep_rows = _fetch_departures_range(terminal_id, now_utc, now_utc + timedelta(hours=4))
    dep_times = []
    for r in dep_rows:
        ts = r['scheduled_datetime']
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        dep_times.append(ts)

    forecasts = []
    for minutes, label in FORECAST_HORIZONS:
        predicted = horizon_preds.get(minutes)
        if predicted is None:
            continue

        horizon_time = now_dublin + timedelta(minutes=minutes)
        horizon_str = horizon_time.strftime('%I:%M %p')
        horizon_utc = now_utc + timedelta(minutes=minutes)
        window_start = horizon_utc - timedelta(minutes=30)
        window_end = horizon_utc + timedelta(minutes=30)
        dep_count = sum(1 for d in dep_times if window_start <= d <= window_end)

        is_spike = False
        if dep_count > 0:
            before_count = sum(1 for d in dep_times
                               if (horizon_utc - timedelta(minutes=90)) <= d < window_start)
            after_count = sum(1 for d in dep_times
                              if window_end < d <= (horizon_utc + timedelta(minutes=90)))
            if dep_count > before_count and dep_count > after_count:
                is_spike = True

        spread = max(1, int(predicted * 0.15))
        forecasts.append({
            "label": label,
            "time": horizon_str,
            "median": round(predicted),
            "p10": max(0, round(predicted) - spread * 2),
            "p90": round(predicted) + spread * 2,
            "departures": dep_count,
            "is_spike": is_spike,
        })

    return forecasts if forecasts else None

@app.route('/api/seo-security-data', methods=['GET'])
def seo_security_data():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT t1, t2, last_updated FROM security_times_current WHERE id = 1")
                result = cur.fetchone()

        if not result:
            t1 = None
            t2 = None
            last_updated = None
        else:
            t1 = result.get('t1')
            t2 = result.get('t2')
            last_updated_raw = result.get('last_updated')
            if last_updated_raw:
                if isinstance(last_updated_raw, str):
                    last_updated = last_updated_raw
                else:
                    if last_updated_raw.tzinfo is None:
                        last_updated_raw = last_updated_raw.replace(tzinfo=timezone.utc)
                    last_updated = last_updated_raw.astimezone(DUBLIN_TZ).isoformat()
            else:
                last_updated = datetime.now(DUBLIN_TZ).isoformat()

        now_dublin = datetime.now(DUBLIN_TZ)
        now_utc = datetime.now(timezone.utc)
        now_iso = now_dublin.isoformat()

        t1_str = f"{t1} minutes" if t1 is not None else "No data"
        t2_str = f"{t2} minutes" if t2 is not None else "No data"

        try:
            t1_forecasts = _seo_build_forecasts(1, now_utc, now_dublin)
        except Exception as e:
            logging.error(f"[SEO] T1 forecast error: {e}")
            t1_forecasts = None
        try:
            t2_forecasts = _seo_build_forecasts(2, now_utc, now_dublin)
        except Exception as e:
            logging.error(f"[SEO] T2 forecast error: {e}")
            t2_forecasts = None

        if t1 is not None and t2 is not None:
            if t1 < t2:
                recommendation = f"Terminal 1 is currently faster at {t1} minutes (T2: {t2} minutes)."
            elif t2 < t1:
                recommendation = f"Terminal 2 is currently faster at {t2} minutes (T1: {t1} minutes)."
            else:
                recommendation = f"Both terminals are equal at {t1} minutes."
        elif t1 is not None:
            recommendation = f"Only Terminal 1 data available: {t1} minutes."
        elif t2 is not None:
            recommendation = f"Only Terminal 2 data available: {t2} minutes."
        else:
            recommendation = "No security time data currently available."

        def _fmt_forecast_row(fc):
            if fc["median"] is None:
                return f"<tr><td>{fc['label']}</td><td>{fc['time']}</td><td>—</td><td>—</td><td>{fc['departures']}</td><td></td></tr>"
            spike_badge = ' <span class="spike">&#9650; departure spike</span>' if fc["is_spike"] else ""
            return (f"<tr><td>{fc['label']}</td><td>{fc['time']}</td>"
                    f"<td>{fc['p10']}–{fc['p90']}m</td>"
                    f"<td><strong>{fc['median']}m</strong></td>"
                    f"<td>{fc['departures']}</td>"
                    f"<td>{spike_badge}</td></tr>")

        def _forecast_text(forecasts, terminal_label):
            if not forecasts:
                return f"No forecast data available for {terminal_label}."
            parts = []
            for fc in forecasts:
                if fc["median"] is not None:
                    spike = " (departure spike expected)" if fc["is_spike"] else ""
                    parts.append(f"In {fc['label']} ({fc['time']}): ~{fc['median']}m (range {fc['p10']}–{fc['p90']}m), {fc['departures']} departures nearby{spike}")
            return f"{terminal_label} forecast: " + ". ".join(parts) + "." if parts else f"No forecast data for {terminal_label}."

        t1_forecast_text = _forecast_text(t1_forecasts, "Terminal 1")
        t2_forecast_text = _forecast_text(t2_forecasts, "Terminal 2")

        def _forecast_table_html(forecasts, terminal_label):
            if not forecasts:
                return f"<p>No forecast data available for {terminal_label}.</p>"
            rows = "".join(_fmt_forecast_row(fc) for fc in forecasts)
            return f"""<table class="forecast-table">
<thead><tr><th>Horizon</th><th>Time</th><th>Range (p10–p90)</th><th>Predicted</th><th>Departures</th><th></th></tr></thead>
<tbody>{rows}</tbody>
</table>"""

        t1_forecast_html = _forecast_table_html(t1_forecasts, "Terminal 1")
        t2_forecast_html = _forecast_table_html(t2_forecasts, "Terminal 2")

        jsonld_faq = json.dumps({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": "What are the current security times at Dublin Airport?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"As of {now_dublin.strftime('%I:%M %p on %B %d, %Y')}, Dublin Airport Terminal 1 (T1) security wait time is {t1_str} and Terminal 2 (T2) is {t2_str}. {recommendation}"
                    }
                },
                {
                    "@type": "Question",
                    "name": "How long is the security queue at Dublin Airport Terminal 1?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"The current security queue wait time at Dublin Airport Terminal 1 is {t1_str} (updated {now_dublin.strftime('%I:%M %p')})."
                    }
                },
                {
                    "@type": "Question",
                    "name": "How long is the security queue at Dublin Airport Terminal 2?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"The current security queue wait time at Dublin Airport Terminal 2 is {t2_str} (updated {now_dublin.strftime('%I:%M %p')})."
                    }
                },
                {
                    "@type": "Question",
                    "name": "Which Dublin Airport terminal has the shortest security queue right now?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": recommendation
                    }
                },
                {
                    "@type": "Question",
                    "name": "Can I use either terminal security at Dublin Airport?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Yes. At Dublin Airport, passengers can go through security at either Terminal 1 or Terminal 2 regardless of which terminal their flight departs from. After clearing security, you can walk to your departure gate in either terminal."
                    }
                },
                {
                    "@type": "Question",
                    "name": "Dublin Airport T1 vs T2 security — which is faster right now?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"Right now at {now_dublin.strftime('%I:%M %p')}: {recommendation} Check eidwtimes.xyz for live updates."
                    }
                },
                {
                    "@type": "Question",
                    "name": "Is Dublin Airport security busy right now?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"As of {now_dublin.strftime('%I:%M %p')}, Terminal 1 security is {t1_str} and Terminal 2 is {t2_str}. Visit eidwtimes.xyz for live updates and historical trends."
                    }
                },
                {
                    "@type": "Question",
                    "name": "How early should I arrive at Dublin Airport?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"Dublin Airport recommends 2 hours for short-haul and 3 hours for long-haul flights. Current security wait: T1 is {t1_str}, T2 is {t2_str}. Check eidwtimes.xyz for live data to plan your arrival."
                    }
                },
                {
                    "@type": "Question",
                    "name": "What time is Dublin Airport security busiest?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Dublin Airport security is typically busiest between 5-8 AM and 2-4 PM. EIDW Times shows 7 days of historical hourly data so you can see exact peak patterns at eidwtimes.xyz."
                    }
                },
                {
                    "@type": "Question",
                    "name": "Dublin Airport security times today?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"Today ({now_dublin.strftime('%A, %B %d')}), Dublin Airport security is currently T1: {t1_str}, T2: {t2_str}. EIDW Times tracks the full 24-hour breakdown at eidwtimes.xyz."
                    }
                },
                {
                    "@type": "Question",
                    "name": "What will Dublin Airport security times be in the next few hours?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"{t1_forecast_text} {t2_forecast_text} Predictions are generated using a machine learning model trained on historical security data. Check eidwtimes.xyz for live forecasts."
                    }
                }
            ]
        })

        jsonld_dataset = json.dumps({
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": "Dublin Airport Live Security Queue Wait Times",
            "description": f"Real-time security queue wait times at Dublin Airport. Terminal 1: {t1_str}, Terminal 2: {t2_str}. Updated {now_dublin.strftime('%I:%M %p %d %b %Y')}.",
            "url": "https://eidwtimes.xyz/",
            "license": "https://creativecommons.org/licenses/by/4.0/",
            "temporalCoverage": f"{now_iso}/...",
            "spatialCoverage": {
                "@type": "Place",
                "name": "Dublin Airport",
                "geo": {
                    "@type": "GeoCoordinates",
                    "latitude": 53.4264,
                    "longitude": -6.2499
                }
            },
            "variableMeasured": [
                {
                    "@type": "PropertyValue",
                    "name": "Terminal 1 Security Wait Time",
                    "unitText": "minutes",
                    "value": t1
                },
                {
                    "@type": "PropertyValue",
                    "name": "Terminal 2 Security Wait Time",
                    "unitText": "minutes",
                    "value": t2
                }
            ],
            "dateModified": last_updated or now_iso
        })

        jsonld_speakable = json.dumps({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "Dublin Airport Security Times — Live T1 & T2 Queue Wait Times",
            "url": "https://eidwtimes.xyz/",
            "speakable": {
                "@type": "SpeakableSpecification",
                "cssSelector": ["#seo-summary", "#seo-t1", "#seo-t2", "#seo-recommendation"]
            },
            "dateModified": last_updated or now_iso
        })

        html = f"""<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dublin Airport Security Times — Live T1 & T2 Queue Wait Times | EIDW Times</title>
<meta name="description" content="Current Dublin Airport security wait times: Terminal 1 is {t1_str}, Terminal 2 is {t2_str}. {recommendation} Updated {now_dublin.strftime('%I:%M %p')}." />
<meta name="keywords" content="Dublin Airport security times, Dublin Airport queue times, Dublin Airport T1, Dublin Airport T2, Dublin Airport wait times, DUB security, EIDW times, Dublin Airport today, Dublin Airport live, Dublin Airport queues, Dublin Airport security queue, Dublin Airport Terminal 1, Dublin Airport Terminal 2, Dublin Airport delays, Dublin Airport tips, Ireland airport security" />
<meta name="author" content="EIDW Times" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
<meta name="googlebot" content="index, follow" />
<link rel="canonical" href="https://eidwtimes.xyz/" />
<link rel="icon" type="image/png" href="https://eidwtimes.xyz/images/favicon.png" />
<link rel="alternate" hreflang="en" href="https://eidwtimes.xyz/" />
<link rel="alternate" hreflang="x-default" href="https://eidwtimes.xyz/" />
<meta name="geo.region" content="IE-D" />
<meta name="geo.placename" content="Dublin, Ireland" />
<meta name="geo.position" content="53.4264;-6.2499" />
<meta name="ICBM" content="53.4264, -6.2499" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://eidwtimes.xyz/" />
<meta property="og:title" content="Dublin Airport Security Times — T1: {t1_str}, T2: {t2_str}" />
<meta property="og:description" content="{recommendation} Live data updated {now_dublin.strftime('%I:%M %p')}." />
<meta property="og:image" content="https://eidwtimes.xyz/images/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name" content="EIDW Times" />
<meta property="og:locale" content="en_IE" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Dublin Airport Security Times — T1: {t1_str}, T2: {t2_str}" />
<meta name="twitter:description" content="{recommendation}" />
<meta name="twitter:image" content="https://eidwtimes.xyz/images/og-image.png" />
<script type="application/ld+json">{jsonld_faq}</script>
<script type="application/ld+json">{jsonld_dataset}</script>
<script type="application/ld+json">{jsonld_speakable}</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6;padding:2rem 1rem}}
main{{max-width:720px;margin:0 auto}}
h1{{font-size:1.75rem;color:#fff;margin-bottom:.5rem}}
h2{{font-size:1.25rem;color:#4ade80;margin:1.5rem 0 .5rem}}
h3{{font-size:1rem;color:#94a3b8;margin:1.25rem 0 .25rem}}
p{{margin-bottom:.5rem;color:#cbd5e1}}
strong{{color:#fff}}
a{{color:#4ade80;text-decoration:underline}}
section{{margin:1.5rem 0;padding:1rem;background:#1e293b;border-radius:.5rem}}
footer{{margin-top:2rem;padding-top:1rem;border-top:1px solid #334155;font-size:.75rem;color:#64748b}}
.hero{{display:flex;gap:1.5rem;margin:1.5rem 0}}
.hero-card{{flex:1;padding:1.25rem;background:#1e293b;border-radius:.75rem;text-align:center}}
.hero-card .time{{font-size:2.5rem;font-weight:700;color:#4ade80}}
.hero-card .label{{font-size:.875rem;color:#94a3b8;margin-top:.25rem}}
.rec{{padding:1rem;background:#164e3a;border-radius:.5rem;margin:1rem 0;font-weight:600;color:#4ade80;text-align:center}}
.forecast-table{{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.875rem}}
.forecast-table th{{text-align:left;padding:.5rem;border-bottom:2px solid #334155;color:#94a3b8;font-weight:500}}
.forecast-table td{{padding:.5rem;border-bottom:1px solid #1e293b;color:#cbd5e1}}
.forecast-table strong{{color:#4ade80}}
.spike{{color:#f59e0b;font-size:.75rem;font-weight:600}}
.forecast-section{{margin:1.5rem 0}}
.forecast-section h3{{color:#4ade80;margin-bottom:.5rem}}
</style>
</head>
<body>
<main>
<h1>Dublin Airport Security Times</h1>
<p id="seo-summary">Live security queue wait times at Dublin Airport (DUB/EIDW) as of {now_dublin.strftime('%I:%M %p on %A, %B %d, %Y')}.</p>

<div class="hero">
<div class="hero-card">
<div class="time" id="seo-t1">{t1_str}</div>
<div class="label">Terminal 1 (T1)</div>
</div>
<div class="hero-card">
<div class="time" id="seo-t2">{t2_str}</div>
<div class="label">Terminal 2 (T2)</div>
</div>
</div>

<div class="rec" id="seo-recommendation">{recommendation}</div>
<p style="text-align:center;font-size:.875rem">You can use either terminal's security regardless of your departure gate. <a href="https://eidwtimes.xyz/">View full live dashboard &rarr;</a></p>

<section class="forecast-section">
<h2>Predicted Security Wait Times &amp; Departures</h2>
<p>Forecasts generated at {now_dublin.strftime('%I:%M %p')} using a machine learning model trained on historical security data. Ranges show estimated confidence bands.</p>

<h3>Terminal 1 (T1) — Forecast</h3>
{t1_forecast_html}

<h3>Terminal 2 (T2) — Forecast</h3>
{t2_forecast_html}

<p style="font-size:.8rem;color:#64748b">&#9650; = departure spike detected (more flights departing in this window than surrounding periods). Spikes typically correlate with longer security queues.</p>
</section>

<section>
<h2>Frequently Asked Questions About Dublin Airport Security</h2>

<h3>What are the current security times at Dublin Airport?</h3>
<p>As of {now_dublin.strftime('%I:%M %p on %B %d, %Y')}, Terminal 1 security is {t1_str} and Terminal 2 is {t2_str}. {recommendation}</p>

<h3>How long is the security queue at Dublin Airport Terminal 1?</h3>
<p>The current security queue wait time at Dublin Airport Terminal 1 is {t1_str} (updated {now_dublin.strftime('%I:%M %p')}).</p>

<h3>How long is the security queue at Dublin Airport Terminal 2?</h3>
<p>The current security queue wait time at Dublin Airport Terminal 2 is {t2_str} (updated {now_dublin.strftime('%I:%M %p')}).</p>

<h3>Which Dublin Airport terminal has the shortest security queue?</h3>
<p>{recommendation}</p>

<h3>Dublin Airport T1 vs T2 — which is faster right now?</h3>
<p>Right now at {now_dublin.strftime('%I:%M %p')}: {recommendation}</p>

<h3>Is Dublin Airport security busy right now?</h3>
<p>As of {now_dublin.strftime('%I:%M %p')}, Terminal 1 security is {t1_str} and Terminal 2 is {t2_str}.</p>

<h3>How early should I arrive at Dublin Airport?</h3>
<p>Dublin Airport recommends arriving 2 hours before short-haul flights and 3 hours before long-haul flights. Current security wait: T1 is {t1_str}, T2 is {t2_str}.</p>

<h3>Can I use either terminal security at Dublin Airport?</h3>
<p>Yes. Passengers can go through security at either Terminal 1 or Terminal 2 regardless of which terminal their flight departs from.</p>

<h3>Can I walk between Terminal 1 and Terminal 2 at Dublin Airport?</h3>
<p>Yes. After clearing security at either terminal, you can walk between Terminal 1 and Terminal 2 to reach your gate.</p>

<h3>What time is Dublin Airport security busiest?</h3>
<p>Dublin Airport security is typically busiest between 5-8 AM for early morning departures and 2-4 PM in the afternoon.</p>

<h3>What are Dublin Airport peak hours?</h3>
<p>Peak hours are typically early morning (5-8 AM), mid-morning (10-11 AM), and mid-afternoon (2-4 PM). Varies by day and season.</p>

<h3>Dublin Airport security times today?</h3>
<p>Today ({now_dublin.strftime('%A, %B %d')}), Dublin Airport security is currently T1: {t1_str}, T2: {t2_str}.</p>

<h3>Dublin Airport security times early morning?</h3>
<p>Early morning (4-7 AM) is one of the busiest periods at Dublin Airport security as passengers arrive for the first wave of departures.</p>

<h3>Dublin Airport security times at 5am?</h3>
<p>5 AM is when Dublin Airport starts getting busy as early morning flights begin departing. Queues can build quickly from this point.</p>

<h3>Is Dublin Airport busy on weekends?</h3>
<p>Dublin Airport can be busy on weekends, especially Friday evenings and Sunday afternoons.</p>

<h3>How long does it take to get through Dublin Airport?</h3>
<p>It depends on security queue length, check-in method, and terminal. Security is usually the biggest variable. Current wait: T1 is {t1_str}, T2 is {t2_str}.</p>

<h3>What is the fastest way through Dublin Airport security?</h3>
<p>Check live queue times at eidwtimes.xyz, use whichever terminal has the shorter queue, have liquids in a clear bag, and remove laptops from bags.</p>

<h3>What are the security rules at Dublin Airport?</h3>
<p>EU aviation security rules apply: liquids in 100ml containers in a clear bag (max 1 litre), laptops and large electronics removed from bags, coats and belts may need removal.</p>

<h3>Dublin Airport security queue prediction?</h3>
<p>EIDW Times uses a machine learning model to predict security wait times. {t1_forecast_text} {t2_forecast_text}</p>

<h3>Dublin Airport security times last 7 days?</h3>
<p>EIDW Times displays a full 7-day history of Dublin Airport security times, broken down by hour for both T1 and T2 at eidwtimes.xyz.</p>

<h3>Is there an app for Dublin Airport security times?</h3>
<p>EIDW Times (eidwtimes.xyz) is a free Progressive Web App you can install from your browser to your home screen. No app store needed.</p>

<h3>Dublin Airport Terminal 1 airlines?</h3>
<p>Terminal 1 is used by most airlines including Ryanair, Lufthansa, Air France, KLM, Emirates, and many others.</p>

<h3>Dublin Airport Terminal 2 airlines?</h3>
<p>Terminal 2 is primarily used by Aer Lingus and some other carriers.</p>

<h3>Dublin Airport US preclearance times?</h3>
<p>US preclearance at Dublin Airport (Terminal 2) adds additional time as you clear US immigration before boarding. Allow extra time on top of regular security.</p>

<h3>Dublin Airport for families — how long should I allow?</h3>
<p>Families should allow at least 2.5 hours for short-haul and 3.5 hours for long-haul flights. Security with children and buggies takes longer.</p>

<h3>What does EIDW stand for?</h3>
<p>EIDW is the ICAO airport code for Dublin Airport. EI = Ireland (Éire), DW = Dublin. The IATA code is DUB.</p>

<h3>Is EIDW Times free?</h3>
<p>Yes, completely free. No subscriptions, accounts, or downloads required. Just visit eidwtimes.xyz.</p>

<h3>Dublin Airport departures today?</h3>
<p>EIDW Times shows real-time departure information for both terminals alongside live security queue times at eidwtimes.xyz.</p>

<h3>Dublin Airport tips?</h3>
<p>Check live security times at eidwtimes.xyz before leaving home. Use whichever terminal has the shorter queue. Have liquids ready. Arrive 2-3 hours early depending on flight type.</p>

<h3>How far in advance can I go through Dublin Airport security?</h3>
<p>You can go through security as soon as you arrive and have your boarding pass. There is no minimum time restriction. Many passengers go through early to enjoy airside shops.</p>

<h3>Dublin Airport live updates?</h3>
<p>EIDW Times provides live updates including real-time security queue wait times, departure information, and projected wait times at eidwtimes.xyz.</p>
</section>

<footer>
<p>Data provided by <a href="https://eidwtimes.xyz/">EIDW Times</a> — live Dublin Airport security queue tracker.</p>
<p>Last updated: {last_updated or now_iso}</p>
</footer>
</main>
</body>
</html>"""

        response = make_response(html)
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        response.headers['Cache-Control'] = 'public, max-age=120, s-maxage=60'
        return response

    except Exception as e:
        logging.error(f"Error generating SEO page: {e}")
        return make_response("Internal Server Error", 500)

def get_range_security_data():
    try:
        data = request.get_json()
        start_iso = data.get('start')
        end_iso = data.get('end')
        if not start_iso or not end_iso:
            return jsonify({"error": "Missing start or end"}), 400

        start_dt = datetime.fromisoformat(start_iso)
        end_dt = datetime.fromisoformat(end_iso)

        earliest_allowed = datetime.now(timezone.utc) - timedelta(days=7)
        if start_dt < earliest_allowed:
            start_dt = earliest_allowed

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT timestamp, t1, t2
                    FROM security_times
                    WHERE timestamp >= %s AND timestamp <= %s
                    ORDER BY timestamp ASC
                """, (start_dt, end_dt))
                results = cur.fetchall()
                rows = []
                for row in results:
                    r = dict(row)
                    ts = r.get('timestamp')
                    if ts:
                        if ts.tzinfo is None:
                            ts = ts.replace(tzinfo=timezone.utc)
                        r['timestamp'] = ts.astimezone(DUBLIN_TZ).isoformat()
                    rows.append(r)
                return jsonify(rows)
    except Exception as e:
        logging.error(f"Error fetching range security data: {e}")
        return jsonify({"error": str(e)}), 500

def get_range_departure_data():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        start_iso = data.get('start')
        end_iso = data.get('end')
        if not terminal_id or not start_iso or not end_iso:
            return jsonify({"error": "Missing terminalId, start, or end"}), 400

        terminal_name = f"T{terminal_id}"
        start_dt = datetime.fromisoformat(start_iso)
        end_dt = datetime.fromisoformat(end_iso)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT scheduled_datetime
                    FROM departures
                    WHERE terminal_name = %s AND scheduled_datetime >= %s AND scheduled_datetime <= %s
                    ORDER BY scheduled_datetime ASC
                """, (terminal_name, start_dt, end_dt))
                departures = cur.fetchall()

                dep_times = [row['scheduled_datetime'] for row in departures]
                hours_with_deps = set()
                for dt in dep_times:
                    hours_with_deps.add(dt.replace(minute=0, second=0, microsecond=0))

                results = []
                for hour_start in sorted(hours_with_deps):
                    for minute in range(60):
                        minute_ts = hour_start + timedelta(minutes=minute)
                        if minute_ts < start_dt or minute_ts > end_dt:
                            continue
                        count = 0
                        for dep_dt in dep_times:
                            diff = abs((dep_dt - minute_ts).total_seconds())
                            if diff <= 300:
                                count += 1
                        results.append({
                            'timestamp': minute_ts.isoformat(),
                            'count': count
                        })

                return jsonify(results)
    except Exception as e:
        logging.error(f"Error fetching range departure data: {e}")
        return jsonify({"error": str(e)}), 500

def get_irish_time():
    now = datetime.now(DUBLIN_TZ)
    return jsonify({"time": now.strftime('%Y-%m-%dT%H:%M:%S.') + f"{now.microsecond // 1000:03d}" + now.strftime('%z')[:3] + ':' + now.strftime('%z')[3:]})


OPENING_SOON_MINUTES = 30
CLOSING_SOON_MINUTES = 30

FACILITY_DEFINITIONS = [
    {"name": "Security", "terminal": 1, "openTime": "03:00", "closeTime": "last-flight", "iconType": "shield"},
    {"name": "Fast Track Security", "terminal": 1, "openTime": "04:00", "closeTime": "21:00", "iconType": "zap"},
    {"name": "Security", "terminal": 2, "openTime": "03:30", "closeTime": "last-flight", "iconType": "shield"},
    {"name": "Fast Track Security", "terminal": 2, "openTime": "04:00", "closeTime": "18:00", "iconType": "zap"},
    {"name": "US Preclearance", "terminal": 2, "openTime": "07:00", "closeTime": "16:30", "iconType": "globe"},
]


def _parse_hhmm(hhmm: str):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _format_duration(total_minutes: int) -> str:
    if total_minutes < 1:
        return "less than a minute"
    h = total_minutes // 60
    m = total_minutes % 60
    if h == 0:
        return f"{m}m"
    if m == 0:
        return f"{h}h"
    return f"{h}h {m}m"


def _compute_status(now_mins: int, open_time: str, close_time: str):
    open_mins = _parse_hhmm(open_time)
    close_mins = _parse_hhmm(close_time)

    if now_mins < open_mins:
        mins_until_open = open_mins - now_mins
        if mins_until_open <= OPENING_SOON_MINUTES:
            return {"status": "opening-soon", "opensIn": _format_duration(mins_until_open)}
        return {"status": "closed", "opensIn": _format_duration(mins_until_open)}

    if open_mins <= now_mins < close_mins:
        mins_until_close = close_mins - now_mins
        if mins_until_close <= CLOSING_SOON_MINUTES:
            return {"status": "closing-soon", "closesIn": _format_duration(mins_until_close)}
        return {"status": "open"}

    return {"status": "closed"}


def _resolve_last_departures():
    try:
        now_dublin = datetime.now(DUBLIN_TZ)
        today_start = now_dublin.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT terminal_name,
                           MAX(scheduled_datetime) as last_departure
                    FROM departures
                    WHERE scheduled_datetime >= %s
                      AND scheduled_datetime < %s
                    GROUP BY terminal_name
                    ORDER BY terminal_name
                """, (today_start, tomorrow_start))
                results = cur.fetchall()
                last_deps = {}
                for row in results:
                    terminal = row['terminal_name']
                    last_dep = row['last_departure']
                    if last_dep:
                        if last_dep.tzinfo is None:
                            last_dep = last_dep.replace(tzinfo=timezone.utc)
                        last_deps[terminal] = last_dep.astimezone(DUBLIN_TZ)
                return last_deps
    except Exception:
        return {}

def get_facility_hours():
    try:
        now_dublin = datetime.now(DUBLIN_TZ)
        now_mins = now_dublin.hour * 60 + now_dublin.minute
        last_deps = _resolve_last_departures()

        facilities = []
        for defn in FACILITY_DEFINITIONS:
            close_time = defn["closeTime"]
            close_display = close_time

            if close_time == "last-flight":
                terminal_key = f"T{defn['terminal']}"
                last_dep_dt = last_deps.get(terminal_key)
                if last_dep_dt:
                    hh = f"{last_dep_dt.hour:02d}"
                    mm = f"{last_dep_dt.minute:02d}"
                    close_time = f"{hh}:{mm}"
                    close_display = f"{hh}:{mm} (last flight)"
                else:
                    close_time = "23:59"
                    close_display = "No flights found"

            status_info = _compute_status(now_mins, defn["openTime"], close_time)

            facilities.append({
                "name": defn["name"],
                "terminal": defn["terminal"],
                "openTime": defn["openTime"],
                "closeTime": defn["closeTime"],
                "closeDisplayText": close_display,
                "iconType": defn["iconType"],
                "status": status_info["status"],
                "opensIn": status_info.get("opensIn"),
                "closesIn": status_info.get("closesIn"),
            })

        irish_time_iso = now_dublin.strftime('%Y-%m-%dT%H:%M:%S.') + \
            f"{now_dublin.microsecond // 1000:03d}" + \
            now_dublin.strftime('%z')[:3] + ':' + now_dublin.strftime('%z')[3:]

        return jsonify({
            "facilities": facilities,
            "irishTime": irish_time_iso,
        })
    except Exception as e:
        logging.error(f"Error fetching facility hours: {e}")
        return jsonify({"error": str(e)}), 500

def get_last_departures():
    try:
        now_dublin = datetime.now(DUBLIN_TZ)
        today_start = now_dublin.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT terminal_name,
                           MAX(scheduled_datetime) as last_departure
                    FROM departures
                    WHERE scheduled_datetime >= %s
                      AND scheduled_datetime < %s
                    GROUP BY terminal_name
                    ORDER BY terminal_name
                """, (today_start, tomorrow_start))

                results = cur.fetchall()

                response = {}
                for row in results:
                    terminal = row['terminal_name']
                    last_dep = row['last_departure']
                    if last_dep:
                        if last_dep.tzinfo is None:
                            last_dep = last_dep.replace(tzinfo=timezone.utc)
                        last_dep_dublin = last_dep.astimezone(DUBLIN_TZ)
                        response[terminal] = last_dep_dublin.isoformat()

                return jsonify(response)
    except Exception as e:
        logging.error(f"Error fetching last departures: {e}")
        return jsonify({"error": str(e)}), 500


def _color_class_for_value(value):
    if value is None:
        return "bg-gray-200"
    if value == 0:
        return "bg-departure-green-dark"
    if value == 1:
        return "bg-departure-green-light"
    if 2 <= value <= 3:
        return "bg-departure-yellow"
    if 4 <= value <= 5:
        return "bg-departure-orange-yellow"
    if 6 <= value <= 10:
        return "bg-departure-orange"
    if 11 <= value <= 20:
        return "bg-departure-red-light"
    if 21 <= value <= 40:
        return "bg-departure-red"
    if 41 <= value <= 60:
        return "bg-departure-red-deep"
    return "bg-black"

def get_recommendation():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT t1, t2, last_updated FROM security_times_current WHERE id = 1")
                current = cur.fetchone()

        if not current:
            return jsonify({"error": "No data"}), 404

        t1 = current.get('t1')
        t2 = current.get('t2')
        last_updated = current.get('last_updated')
        if last_updated and hasattr(last_updated, 'isoformat'):
            if last_updated.tzinfo is None:
                last_updated = last_updated.replace(tzinfo=timezone.utc)
            last_updated = last_updated.isoformat()

        rec = None
        if t1 is not None and t2 is not None:
            if t1 < t2:
                rec = {"id": 1, "time": t1}
            elif t2 < t1:
                rec = {"id": 2, "time": t2}
            else:
                rec = {"id": "either", "time": t1}
        elif t1 is not None:
            rec = {"id": 1, "time": t1}
        elif t2 is not None:
            rec = {"id": 2, "time": t2}

        time_diff_msg = None
        if t1 is not None and t2 is not None and rec and rec["id"] != "either":
            diff = abs(t1 - t2)
            if 0 < diff < 3:
                time_diff_msg = f"But it doesn't really matter because it's only a ~{diff} min difference"

        tip = ""
        if rec:
            if rec["id"] == 1 or rec["id"] == "either":
                tip = "and T1 has the best shops!"
            elif rec["id"] == 2:
                tip = "and T2 is usually less chaotic!"

        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=6)
        global_max = 0
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT GREATEST(
                        COALESCE(MAX(t1), 0),
                        COALESCE(MAX(t2), 0)
                    ) as max_time
                    FROM security_times
                    WHERE timestamp >= %s
                """, (seven_days_ago,))
                row = cur.fetchone()
                if row and row['max_time']:
                    global_max = int(row['max_time'])

        return jsonify({
            "t1": t1,
            "t2": t2,
            "lastUpdated": last_updated,
            "recommended": rec,
            "timeDifferenceMessage": time_diff_msg,
            "additionalTip": tip,
            "globalMaxSecurityTime": global_max,
        })
    except Exception as e:
        logging.error(f"Error in recommendation: {e}")
        return jsonify({"error": str(e)}), 500

def get_processed_security_data():
    try:
        terminal_id = request.args.get('terminalId', type=int)
        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        t_key = f"t{terminal_id}"

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                seven_days_ago = datetime.now(timezone.utc) - timedelta(days=6)
                cur.execute("""
                    SELECT timestamp, t1, t2
                    FROM security_times
                    WHERE timestamp >= %s
                    ORDER BY timestamp ASC
                """, (seven_days_ago,))
                data = cur.fetchall()

        daily_hourly_data = {}
        for item in data:
            timestamp = item['timestamp']
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            local_time = timestamp.astimezone(DUBLIN_TZ)
            date_key = local_time.strftime('%Y-%m-%d')
            hour = local_time.hour
            if date_key not in daily_hourly_data:
                daily_hourly_data[date_key] = {}
            if hour not in daily_hourly_data[date_key]:
                daily_hourly_data[date_key][hour] = []
            daily_hourly_data[date_key][hour].append({
                't1': item['t1'],
                't2': item['t2'],
                'timestamp': local_time.isoformat(),
            })

        now_dublin = datetime.now(DUBLIN_TZ)
        twenty_four_hours_ago = now_dublin - timedelta(hours=24)

        all_data_points = []
        granular_by_hour = {}

        historical_data = []
        for i in range(6, -1, -1):
            d = now_dublin - timedelta(days=i)
            date_key = d.strftime('%Y-%m-%d')
            day_data = daily_hourly_data.get(date_key, {})
            hourly_data = []
            for hour in range(24):
                records = day_data.get(hour, [])
                valid_vals = [r[t_key] for r in records if r[t_key] is not None]
                avg_val = round(sum(valid_vals) / len(valid_vals)) if valid_vals else None
                latest_ts = records[-1]['timestamp'] if records else None
                hourly_data.append({
                    'hour': hour,
                    't1': records[-1]['t1'] if records else None,
                    't2': records[-1]['t2'] if records else None,
                    'avgForTerminal': avg_val,
                    'timestamp': latest_ts,
                })

                for record in records:
                    ts_parsed = datetime.fromisoformat(record['timestamp'])
                    time_val = record[t_key]
                    if time_val is not None:
                        if hour not in granular_by_hour:
                            granular_by_hour[hour] = []
                        granular_by_hour[hour].append({
                            'timestamp': record['timestamp'],
                            'time': time_val,
                        })

                if latest_ts and avg_val is not None:
                    ts_parsed = datetime.fromisoformat(latest_ts)
                    if ts_parsed >= twenty_four_hours_ago and ts_parsed <= now_dublin:
                        all_data_points.append({
                            'hour': hour,
                            't1': records[-1]['t1'] if records else None,
                            't2': records[-1]['t2'] if records else None,
                            'timestamp': latest_ts,
                            'colorClass': _color_class_for_value(avg_val),
                            'displayValue': avg_val,
                        })

            historical_data.append({'date': date_key, 'hourlyData': hourly_data})

        daily_averages = []
        for day in historical_data:
            valid_times = [h['avgForTerminal'] for h in day['hourlyData'] if h['avgForTerminal'] is not None]
            avg = round(sum(valid_times) / len(valid_times)) if valid_times else None
            daily_averages.append({'date': day['date'], 't1Average': avg})

        all_data_points.sort(key=lambda x: x['timestamp'])

        return jsonify({
            'dailyAverages': daily_averages,
            'last24HourData': all_data_points,
            'granularByHour': granular_by_hour,
        })
    except Exception as e:
        logging.error(f"Error in processed-security-data: {e}")
        return jsonify({"error": str(e)}), 500

def get_processed_departure_data():
    try:
        terminal_id = request.args.get('terminalId', type=int)
        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        terminal_name = f"T{terminal_id}"
        now_dublin = datetime.now(DUBLIN_TZ)
        three_days_ago = now_dublin - timedelta(days=3)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE_TRUNC('hour', scheduled_datetime) as departure_datetime,
                        COUNT(*) as departure_count
                    FROM departures
                    WHERE terminal_name = %s AND scheduled_datetime >= %s
                    GROUP BY DATE_TRUNC('hour', scheduled_datetime)
                    ORDER BY departure_datetime ASC
                """, (terminal_name, three_days_ago))
                raw_data = cur.fetchall()

        dates_to_process = []
        for i in range(3):
            d = now_dublin - timedelta(days=i)
            date_key = d.strftime('%Y-%m-%d')
            if i == 0:
                label = "TODAY"
            else:
                label = d.strftime('%a, %b ') + _ordinal(d.day)
                label = label.upper()
            dates_to_process.append((date_key, label))

        processed = []
        for date_key, label in dates_to_process:
            hourly_counts = [0] * 24
            for item in raw_data:
                dt = item['departure_datetime']
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                local_dt = dt.astimezone(DUBLIN_TZ)
                if local_dt.strftime('%Y-%m-%d') == date_key:
                    hourly_counts[local_dt.hour] = int(item['departure_count'])

            hours = []
            for count in hourly_counts:
                hours.append({
                    'value': count,
                    'colorClass': _color_class_for_value(count),
                })

            processed.append({'date': label, 'hours': hours})

        return jsonify({'days': processed})
    except Exception as e:
        logging.error(f"Error in processed-departure-data: {e}")
        return jsonify({"error": str(e)}), 500


def _ordinal(n):
    if 11 <= (n % 100) <= 13:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f"{n}{suffix}"

def get_chart_data():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        start_iso = data.get('start')
        end_iso = data.get('end')
        granularity_minutes = data.get('granularity', 1)

        if not terminal_id or not start_iso or not end_iso:
            return jsonify({"error": "Missing params"}), 400

        t_key = f"t{terminal_id}"
        start_dt = datetime.fromisoformat(start_iso)
        end_dt = datetime.fromisoformat(end_iso)
        now = datetime.now(timezone.utc)
        sec_fetch_end = min(end_dt, now)

        sec_rows = []
        if start_dt < sec_fetch_end:
            sec_rows = _fetch_security_range(terminal_id, start_dt, sec_fetch_end)

        dep_rows = _fetch_departures_range(terminal_id, start_dt, end_dt)

        sec_points = []
        for r in sec_rows:
            ts = r['timestamp']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if r['sec_time'] is not None:
                sec_points.append({'ts': ts.timestamp(), 'value': int(r['sec_time'])})

        dep_by_hour = {}
        for r in dep_rows:
            ts = r['scheduled_datetime']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            hour_key = ts.replace(minute=0, second=0, microsecond=0)
            dep_by_hour[hour_key] = dep_by_hour.get(hour_key, 0) + 1

        dep_points = []
        for hour_key, count in dep_by_hour.items():
            for minute in range(60):
                minute_ts = hour_key + timedelta(minutes=minute)
                if start_dt <= minute_ts <= end_dt:
                    near_count = sum(1 for r in dep_rows
                                     if abs((r['scheduled_datetime'].replace(tzinfo=timezone.utc if r['scheduled_datetime'].tzinfo is None else r['scheduled_datetime'].tzinfo) - minute_ts).total_seconds()) <= 300)
                    if near_count > 0:
                        dep_points.append({'ts': minute_ts.timestamp(), 'value': near_count})

        gran_secs = granularity_minutes * 60
        cursor = start_dt
        buckets = []
        while cursor < end_dt:
            bucket_end = cursor + timedelta(minutes=granularity_minutes)
            cursor_ts = cursor.timestamp()
            bucket_end_ts = bucket_end.timestamp()

            sec_in_bucket = [p['value'] for p in sec_points if cursor_ts <= p['ts'] < bucket_end_ts]
            dep_in_bucket = [p['value'] for p in dep_points if cursor_ts <= p['ts'] < bucket_end_ts]

            sec_avg = round(sum(sec_in_bucket) / len(sec_in_bucket)) if sec_in_bucket else None
            dep_avg = round(sum(dep_in_bucket) / len(dep_in_bucket)) if dep_in_bucket else None

            is_past = cursor <= now
            buckets.append({
                'ts': int(cursor_ts * 1000),
                'security': sec_avg if is_past else None,
                'departures': dep_avg or 0,
            })
            cursor = bucket_end

        return jsonify({'points': buckets})
    except Exception as e:
        logging.error(f"Error in chart-data: {e}")
        return jsonify({"error": str(e)}), 500

def get_hourly_detail_stats():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        current_timestamp = data.get('currentTimestamp')
        prev_timestamp = data.get('prevTimestamp')
        next_timestamp = data.get('nextTimestamp')

        if not terminal_id or not current_timestamp:
            return jsonify({"error": "Missing params"}), 400

        t_key = f"t{terminal_id}"

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT t1, t2 FROM security_times_current WHERE id = 1")
                current_row = cur.fetchone()

        def get_avg_for_timestamp(ts_iso):
            if not ts_iso:
                return None
            ts = datetime.fromisoformat(ts_iso)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=DUBLIN_TZ)
            hour_start = ts.replace(minute=0, second=0, microsecond=0)
            hour_end = hour_start + timedelta(hours=1)
            rows = _fetch_security_for_hour(terminal_id, hour_start, hour_end)
            vals = [r['sec_time'] for r in rows if r['sec_time'] is not None]
            return round(sum(vals) / len(vals)) if vals else None

        current_time = get_avg_for_timestamp(current_timestamp)
        prev_time = get_avg_for_timestamp(prev_timestamp) if prev_timestamp else None
        next_time = get_avg_for_timestamp(next_timestamp) if next_timestamp else None

        change_from_prev = None
        if current_time is not None and prev_time is not None:
            if prev_time == 0 and current_time == 0:
                change_from_prev = "No change from previous point (0m)"
            elif prev_time == 0:
                change_from_prev = f"Increased from 0m to {current_time}m"
            else:
                pct = ((current_time - prev_time) / prev_time) * 100
                direction = "Up" if pct > 0 else "Down"
                change_from_prev = f"{direction} {abs(pct):.0f}% from previous point"
        elif current_time is not None and prev_time is None:
            change_from_prev = "No data for previous point"

        change_to_next = None
        if current_time is not None and next_time is not None:
            if current_time == 0 and next_time == 0:
                change_to_next = "No change to next point (0m)"
            elif current_time == 0:
                change_to_next = f"Increased from 0m to {next_time}m"
            else:
                pct = ((next_time - current_time) / current_time) * 100
                direction = "Up" if pct > 0 else "Down"
                change_to_next = f"{direction} {abs(pct):.0f}% to next point"
        elif current_time is not None and next_time is None:
            change_to_next = "No data for next point"

        ts = datetime.fromisoformat(current_timestamp)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=DUBLIN_TZ)
        hour_start = ts.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)
        granular_rows = _fetch_security_for_hour(terminal_id, hour_start, hour_end)
        valid_times = [r['sec_time'] for r in granular_rows if r['sec_time'] is not None]

        fluctuation_msg = None
        if len(valid_times) > 1:
            min_t = min(valid_times)
            max_t = max(valid_times)
            rng = max_t - min_t
            if min_t == 0 and max_t == 0:
                fluctuation_msg = "No fluctuation (0m)"
            elif min_t == 0:
                fluctuation_msg = f"Fluctuated by {rng}m (from 0m)"
            else:
                pct = (rng / min_t) * 100
                fluctuation_msg = f"Fluctuated by {rng}m ({pct:.0f}%) within the hour"
        elif len(valid_times) == 1:
            fluctuation_msg = f"Only one data point ({valid_times[0]}m)"
        else:
            fluctuation_msg = "No data for fluctuation"

        return jsonify({
            'changeFromPrev': change_from_prev,
            'changeToNext': change_to_next,
            'fluctuationMessage': fluctuation_msg,
        })
    except Exception as e:
        logging.error(f"Error in hourly-detail-stats: {e}")
        return jsonify({"error": str(e)}), 500


def _projected_hourly_stats_trition(terminal_id):
    preds = _trition_predict_all()
    if not preds:
        return jsonify({"stats": None})

    t_key = f"t{terminal_id}"
    h60 = preds.get(f"{t_key}_h60m")
    if h60 is None:
        return jsonify({"stats": None})

    now = datetime.now(DUBLIN_TZ)
    hour_start = now.replace(minute=0, second=0, microsecond=0)
    hour_end = hour_start + timedelta(hours=1)

    rows = _fetch_security_for_hour(terminal_id, hour_start, hour_end)
    observed_values = [r['sec_time'] for r in rows] if rows else []

    last_value = observed_values[-1] if observed_values else h60
    last_minute = now.minute

    future_minutes = list(range(last_minute + 1, 60))
    if not future_minutes:
        return jsonify({"stats": {
            "maxTime": round(last_value),
            "avgTime": round(last_value),
            "peakMinute": last_minute,
            "dataPoints": len(observed_values),
        }})

    projected = []
    current = float(last_value)
    for m in future_minutes:
        drift = (h60 - current) * 0.3
        current = max(0, current + drift)
        projected.append({"minute": m, "value": round(current)})

    all_values = [round(v) for v in observed_values] + [p["value"] for p in projected]
    max_time = max(all_values)
    avg_time = round(sum(all_values) / len(all_values))

    peak_minute = last_minute
    biggest_increase = 0
    for i in range(1, len(projected)):
        inc = projected[i]["value"] - projected[i - 1]["value"]
        if inc > biggest_increase:
            biggest_increase = inc
            peak_minute = projected[i]["minute"]

    return jsonify({
        "stats": {
            "maxTime": max_time,
            "avgTime": avg_time,
            "peakMinute": peak_minute,
            "dataPoints": len(observed_values),
        }
    })

def get_projected_hourly_stats():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        num_sims = data.get('numSims', 500)
        model = data.get('model')

        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        if model == 'trition':
            return _projected_hourly_stats_trition(terminal_id)

        now = datetime.now(DUBLIN_TZ)
        hour_start = now.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)

        rows = _fetch_security_for_hour(terminal_id, hour_start, hour_end)
        if not rows:
            return jsonify({"stats": None})

        observed_values = [r['sec_time'] for r in rows]
        last_row = rows[-1]
        last_ts = last_row['timestamp']
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        last_minute = last_ts.astimezone(DUBLIN_TZ).minute
        last_value = last_row['sec_time']

        paths = _run_multi_path(observed_values, last_value, last_minute, num_sims)
        if not paths or len(paths) == 0:
            return jsonify({"stats": None})

        num_future = len(paths[0])
        if num_future == 0:
            return jsonify({"stats": None})

        medians = []
        for i in range(num_future):
            vals = sorted(p[i]["value"] for p in paths)
            medians.append(vals[len(vals) // 2])

        max_time = max(medians)
        avg_time = round(sum(medians) / len(medians))

        peak_minute = paths[0][0]["minute"] if paths[0] else 0
        biggest_increase = 0
        for i in range(1, len(medians)):
            inc = medians[i] - medians[i - 1]
            if inc > biggest_increase:
                biggest_increase = inc
                peak_minute = paths[0][i]["minute"]

        return jsonify({
            "stats": {
                "maxTime": max_time,
                "avgTime": avg_time,
                "peakMinute": peak_minute,
                "dataPoints": len(observed_values),
            }
        })
    except Exception as e:
        logging.error(f"Error in projected-hourly-stats: {e}")
        return jsonify({"error": str(e)}), 500


def _linear_regression(xs, ys):
    n = len(xs)
    if n < 2:
        return 0.0, 0.0, 0.0
    xs = np.array(xs, dtype=float)
    ys = np.array(ys, dtype=float)
    mx, my = xs.mean(), ys.mean()
    dx = xs - mx
    dy = ys - my
    ssxx = (dx * dx).sum()
    ssyy = (dy * dy).sum()
    ssxy = (dx * dy).sum()
    beta = ssxy / ssxx if ssxx > 0 else 0.0
    alpha = my - beta * mx
    r = ssxy / np.sqrt(ssxx * ssyy) if ssxx > 0 and ssyy > 0 else 0.0
    return alpha, beta, r


def _run_multi_path(observed_values, last_value, last_minute, num_sims=15):
    if not observed_values:
        return []
    obs = np.array(observed_values, dtype=float)
    mean = obs.mean()
    std = obs.std(ddof=1) if len(obs) > 1 else 0.5
    if std == 0:
        std = 0.5

    future_minutes = list(range(last_minute + 1, 60))
    if not future_minutes:
        return []

    n_future = len(future_minutes)
    all_paths = []
    for _ in range(num_sims):
        path = []
        current = float(last_value)
        noise = np.random.randn(n_future)
        for i in range(n_future):
            drift = 0.3 * (mean - current)
            current = current + drift + std * 0.3 * noise[i]
            path.append({"minute": future_minutes[i], "value": max(0, round(current))})
        all_paths.append(path)
    return all_paths


def _run_project(observed_values, last_value, last_minute, num_sims=200):
    paths = _run_multi_path(observed_values, last_value, last_minute, num_sims)
    if not paths:
        return []
    n_future = len(paths[0])
    result = []
    for i in range(n_future):
        vals = sorted(p[i]["value"] for p in paths)
        result.append({"minute": paths[0][i]["minute"], "value": vals[len(vals) // 2]})
    return result


def _run_departure_aware(observed_security, observed_pairs, last_value,
                          future_departures, future_steps, num_sims=200):
    result = {}
    if not observed_security or future_steps <= 0:
        return result

    obs = np.array(observed_security, dtype=float)
    mean = obs.mean()
    base_std = obs.std(ddof=1) if len(obs) > 1 else 0.5
    if base_std == 0:
        base_std = 0.5

    recent_n = min(len(observed_security), 10)
    recent_slice = observed_security[-recent_n:]
    momentum = 0.0
    if len(recent_slice) >= 3:
        xs = list(range(len(recent_slice)))
        _, beta, _ = _linear_regression(xs, recent_slice)
        momentum = beta

    dep_beta = 0.0
    dep_correlation = 0.0
    baseline_dep = 0.0

    if len(observed_pairs) >= 3:
        dep_vals = [p["departures"] for p in observed_pairs]
        sec_vals = [p["security"] for p in observed_pairs]
        _, dep_beta, dep_correlation = _linear_regression(dep_vals, sec_vals)
        dep_correlation = abs(dep_correlation)
        baseline_dep = sum(dep_vals) / len(dep_vals)
    elif observed_pairs:
        baseline_dep = sum(p["departures"] for p in observed_pairs) / len(observed_pairs)
        dep_beta = 0.15
        dep_correlation = 0.3

    dep_by_minute = {}
    for d in future_departures:
        dep_by_minute[d["minuteOffset"]] = d["count"]

    future_dep_values = [d["count"] for d in future_departures]
    avg_future_dep = sum(future_dep_values) / len(future_dep_values) if future_dep_values else baseline_dep
    reference_dep = max(baseline_dep, 0.5)

    corr_scale = 0.3 + 0.7 * dep_correlation

    all_paths = np.empty((num_sims, future_steps))
    noise_matrix = np.random.randn(num_sims, future_steps)

    for sim in range(num_sims):
        current = float(last_value)
        cur_momentum = momentum
        for i in range(future_steps):
            minute_offset = i + 1
            dep_count = dep_by_minute.get(minute_offset, avg_future_dep)
            dep_ratio = min(dep_count / reference_dep, 3.0)
            dep_pressure = (dep_ratio - 1.0) * corr_scale
            mean_rev_drift = 0.20 * (mean - current)
            dep_drift = 0.6 * dep_beta * (dep_count - reference_dep) * corr_scale
            momentum_drift = 0.15 * cur_momentum
            cur_momentum *= 0.97
            total_drift = mean_rev_drift + dep_drift + momentum_drift
            vol_mult = 1.0 + 0.4 * max(dep_pressure, -0.5)
            noise = 0.30 * base_std * vol_mult * noise_matrix[sim, i]
            current = max(0.0, current + total_drift + noise)
            all_paths[sim, i] = round(current)

    for i in range(future_steps):
        col = np.sort(all_paths[:, i])
        result[i + 1] = {
            "p10": int(np.percentile(col, 10)),
            "p25": int(np.percentile(col, 25)),
            "median": int(np.percentile(col, 50)),
            "p75": int(np.percentile(col, 75)),
            "p90": int(np.percentile(col, 90)),
        }

    return result


def _fetch_security_for_hour(terminal_id, hour_start_utc, hour_end_utc):
    t_key = f"t{terminal_id}"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT timestamp, """ + t_key + """ as sec_time
                FROM security_times
                WHERE timestamp >= %s AND timestamp < %s
                  AND """ + t_key + """ IS NOT NULL
                ORDER BY timestamp ASC
            """, (hour_start_utc, hour_end_utc))
            return cur.fetchall()


def _fetch_security_range(terminal_id, start_utc, end_utc):
    t_key = f"t{terminal_id}"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT timestamp, """ + t_key + """ as sec_time
                FROM security_times
                WHERE timestamp >= %s AND timestamp <= %s
                  AND """ + t_key + """ IS NOT NULL
                ORDER BY timestamp ASC
            """, (start_utc, end_utc))
            return cur.fetchall()


def _fetch_departures_range(terminal_id, start_utc, end_utc):
    terminal_name = f"T{terminal_id}"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT scheduled_datetime
                FROM departures
                WHERE terminal_name = %s
                  AND scheduled_datetime >= %s AND scheduled_datetime <= %s
                ORDER BY scheduled_datetime ASC
            """, (terminal_name, start_utc, end_utc))
            return cur.fetchall()

def get_projected_6h():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        now_utc = datetime.now(timezone.utc)
        now_dublin = datetime.now(DUBLIN_TZ)
        lookback = timedelta(hours=6)

        sec_rows = _fetch_security_range(terminal_id, now_utc - lookback, now_utc)
        dep_rows = _fetch_departures_range(terminal_id, now_utc - lookback, now_utc + timedelta(hours=7))

        observed_security = [r['sec_time'] for r in sec_rows if r['sec_time'] is not None]
        last_value = observed_security[-1] if observed_security else None

        if last_value is None or len(observed_security) < 2:
            return jsonify({"hours": []})

        dep_times = []
        for r in dep_rows:
            ts = r['scheduled_datetime']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            dep_times.append(ts)

        observed_pairs = []
        for r in sec_rows:
            ts = r['timestamp']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts > now_utc or r['sec_time'] is None:
                continue
            dep_hour_start = ts.replace(minute=0, second=0, microsecond=0)
            dep_hour_end = dep_hour_start + timedelta(hours=1)
            dep_count = sum(1 for d in dep_times if dep_hour_start <= d < dep_hour_end)
            observed_pairs.append({"security": r['sec_time'], "departures": dep_count})

        future_departures = []
        for dep_ts in dep_times:
            if dep_ts <= now_utc:
                continue
            minute_offset = int((dep_ts - now_utc).total_seconds() / 60)
            if 0 < minute_offset <= 360:
                dep_hour_start = dep_ts.replace(minute=0, second=0, microsecond=0)
                dep_hour_end = dep_hour_start + timedelta(hours=1)
                count = sum(1 for d in dep_times if dep_hour_start <= d < dep_hour_end)
                future_departures.append({"minuteOffset": minute_offset, "count": count})

        bands = _run_departure_aware(
            observed_security, observed_pairs, last_value,
            future_departures, 360, 300
        )

        hours_result = []
        for h in range(6):
            hour_start_min = h * 60 + 1
            hour_end_min = (h + 1) * 60
            hour_time = now_dublin + timedelta(hours=h + 1)
            hour_label = hour_time.strftime('%I %p').lstrip('0')

            minutes_data = []
            medians = []
            for m in range(hour_start_min, hour_end_min + 1):
                band = bands.get(m)
                if band:
                    minutes_data.append({
                        "minute": m - hour_start_min,
                        "median": band["median"],
                        "p10": band["p10"],
                        "p25": band["p25"],
                        "p75": band["p75"],
                        "p90": band["p90"],
                    })
                    medians.append(band["median"])

            avg_median = round(sum(medians) / len(medians)) if medians else None
            hour_utc_start = now_utc + timedelta(hours=h)
            hour_utc_end = now_utc + timedelta(hours=h + 1)
            dep_count = sum(1 for d in dep_times if hour_utc_start <= d < hour_utc_end)

            hours_result.append({
                "hourLabel": hour_label,
                "hourOffset": h + 1,
                "timestamp": hour_time.isoformat(),
                "avgMedian": avg_median,
                "departures": dep_count,
                "minutes": minutes_data,
            })

        return jsonify({"hours": hours_result})
    except Exception as e:
        logging.error(f"Error in projected-6h: {e}")
        return jsonify({"error": str(e)}), 500

def simulate_liminal_method_b():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        num_sims = 15

        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        now = datetime.now(DUBLIN_TZ)
        hour_start = now.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)

        rows = _fetch_security_for_hour(terminal_id, hour_start, hour_end)
        if not rows:
            return jsonify({"paths": []})

        observed_values = [r['sec_time'] for r in rows]
        last_row = rows[-1]
        last_ts = last_row['timestamp']
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        last_minute = last_ts.astimezone(DUBLIN_TZ).minute
        last_value = last_row['sec_time']

        paths = _run_multi_path(observed_values, last_value, last_minute, num_sims)
        return jsonify({"paths": paths, "dataPoints": len(observed_values)})
    except Exception as e:
        logging.error(f"Error in liminal/method-b: {e}")
        return jsonify({"error": str(e)}), 500

def simulate_liminal_method_d():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        hour_timestamp = data.get('hourTimestamp')
        num_sims = 200

        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        if hour_timestamp:
            ref_time = datetime.fromisoformat(hour_timestamp)
            if ref_time.tzinfo is None:
                ref_time = ref_time.replace(tzinfo=DUBLIN_TZ)
        else:
            ref_time = datetime.now(DUBLIN_TZ)

        hour_start = ref_time.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)
        current_minute = ref_time.minute

        rows = _fetch_security_for_hour(terminal_id, hour_start, hour_end)
        if not rows:
            return jsonify({"projected": []})

        observed = []
        for r in rows:
            ts = r['timestamp']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            m = ts.astimezone(DUBLIN_TZ).minute
            if m <= current_minute:
                observed.append((m, r['sec_time']))

        if not observed:
            return jsonify({"projected": []})

        observed.sort(key=lambda x: x[0])
        observed_values = [v for _, v in observed]
        last_minute = observed[-1][0]
        last_value = observed[-1][1]

        projected = _run_project(observed_values, last_value, last_minute, num_sims)
        return jsonify({"projected": projected})
    except Exception as e:
        logging.error(f"Error in liminal/method-a: {e}")
        return jsonify({"error": str(e)}), 500

def simulate_liminal_method_a():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        start_iso = data.get('start')
        end_iso = data.get('end')
        selected_timeframe = data.get('selectedTimeframe', 1440)
        num_sims = 200

        if not terminal_id or not start_iso or not end_iso:
            return jsonify({"error": "Missing terminalId, start, or end"}), 400

        start_dt = datetime.fromisoformat(start_iso)
        end_dt = datetime.fromisoformat(end_iso)
        now = datetime.now(timezone.utc)

        sec_rows = _fetch_security_range(terminal_id, start_dt, min(end_dt, now))
        dep_rows = _fetch_departures_range(terminal_id, start_dt, end_dt)

        past_sec = []
        for r in sec_rows:
            ts = r['timestamp']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts <= now:
                past_sec.append({"ts": ts, "value": r['sec_time']})

        dep_times = []
        for r in dep_rows:
            ts = r['scheduled_datetime']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            dep_times.append(ts)

        observed_security = [p["value"] for p in past_sec]
        last_value = observed_security[-1] if observed_security else None

        if last_value is None or len(observed_security) < 2:
            return jsonify({"bands": {}})

        observed_pairs = []
        for sec_point in past_sec:
            best_dep_count = 0
            best_dist = float('inf')
            for dep_ts in dep_times:
                if dep_ts > now:
                    continue
                dist = abs((dep_ts - sec_point["ts"]).total_seconds())
                if dist < best_dist and dist <= 120:
                    best_dist = dist
                    dep_hour_start = dep_ts.replace(minute=0, second=0, microsecond=0)
                    dep_hour_end = dep_hour_start + timedelta(hours=1)
                    best_dep_count = sum(1 for d in dep_times if dep_hour_start <= d < dep_hour_end)
            observed_pairs.append({
                "security": sec_point["value"],
                "departures": best_dep_count,
            })

        future_departures = []
        future_dep_times = [d for d in dep_times if d > now]
        for dep_ts in future_dep_times:
            minute_offset = int((dep_ts - now).total_seconds() / 60)
            if 0 < minute_offset <= 1440:
                dep_hour_start = dep_ts.replace(minute=0, second=0, microsecond=0)
                dep_hour_end = dep_hour_start + timedelta(hours=1)
                count = sum(1 for d in dep_times if dep_hour_start <= d < dep_hour_end)
                future_departures.append({"minuteOffset": minute_offset, "count": count})

        future_minutes = int((end_dt - now).total_seconds() / 60)
        future_minutes = max(0, min(future_minutes, 1440))
        effective_steps = min(future_minutes, selected_timeframe)

        if effective_steps <= 0:
            return jsonify({"bands": {}})

        bands = _run_departure_aware(
            observed_security, observed_pairs, last_value,
            future_departures, effective_steps, num_sims
        )

        bands_str_keys = {str(k): v for k, v in bands.items()}
        return jsonify({"bands": bands_str_keys})
    except Exception as e:
        logging.error(f"Error in liminal/method-a: {e}")
        return jsonify({"error": str(e)}), 500


import pandas as pd
import xgboost as xgb

_TRITION_MODEL_KEYS = [
    "t1_h60m", "t1_h120m", "t1_h180m",
    "t2_h60m", "t2_h120m", "t2_h180m",
]
_TRITION_BAND_MINUTES = 5
_TRITION_LOOKBACK_HOURS = 24
_TRITION_BAND_COUNT = (_TRITION_LOOKBACK_HOURS * 60) // _TRITION_BAND_MINUTES
_trition_models = None
_trition_meta = None


def _trition_load_models():
    global _trition_models, _trition_meta
    if _trition_models is not None:
        return _trition_models, _trition_meta

    model_dir = os.environ.get("MODEL_CACHE_DIR", "/app/models")

    with open(os.path.join(model_dir, "model_meta.json")) as f:
        _trition_meta = json.load(f)

    _trition_models = {}
    for key in _TRITION_MODEL_KEYS:
        booster = xgb.Booster()
        booster.load_model(os.path.join(model_dir, f"{key}.json"))
        _trition_models[key] = booster

    logging.info(f"[trition] loaded {len(_trition_models)} models, {len(_trition_meta['feature_cols'])} features")
    return _trition_models, _trition_meta


def _trition_fetch_banded():
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_TRITION_LOOKBACK_HOURS + 1)
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT timestamp, t1, t2 FROM security_times WHERE timestamp >= %s ORDER BY timestamp ASC",
                (cutoff,),
            )
            rows = cur.fetchall()

    if not rows:
        return None

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)
    df["band_ts"] = df["timestamp"].dt.floor(f"{_TRITION_BAND_MINUTES}min")
    banded = (
        df.groupby("band_ts")
        .agg({"t1": "mean", "t2": "mean"})
        .sort_index()
        .reset_index()
    )
    banded["hour"] = banded["band_ts"].dt.hour
    banded["minute"] = banded["band_ts"].dt.minute
    banded = banded.drop(columns=["band_ts"]).reset_index(drop=True)
    return banded


def _trition_build_features(df, meta):
    bc = _TRITION_BAND_COUNT
    t1_lags = pd.concat(
        {f"t1_lag_{lag}": df["t1"].shift(lag) for lag in range(1, bc + 1)},
        axis=1,
    )
    t2_lags = pd.concat(
        {f"t2_lag_{lag}": df["t2"].shift(lag) for lag in range(1, bc + 1)},
        axis=1,
    )
    lag_cols_t1 = list(t1_lags.columns)
    lag_cols_t2 = list(t2_lags.columns)

    df = pd.concat([df, t1_lags, t2_lags], axis=1)
    df = df.dropna().reset_index(drop=True)

    if len(df) == 0:
        return None

    latest = df.iloc[[-1]].copy()
    hour_sin = np.sin(2 * np.pi * latest["hour"] / 24.0)
    hour_cos = np.cos(2 * np.pi * latest["hour"] / 24.0)
    min_sin = np.sin(2 * np.pi * latest["minute"] / 60.0)
    min_cos = np.cos(2 * np.pi * latest["minute"] / 60.0)

    feature_cols = ["t1", "t2", "hour", "minute"] + lag_cols_t1 + lag_cols_t2
    X = latest[feature_cols].copy()
    X["hour_sin"] = hour_sin.values
    X["hour_cos"] = hour_cos.values
    X["min_sin"] = min_sin.values
    X["min_cos"] = min_cos.values
    X = X[meta["feature_cols"]]
    return xgb.DMatrix(X)


def _trition_predict_all():
    models, meta = _trition_load_models()
    df = _trition_fetch_banded()
    if df is None or len(df) == 0:
        return None
    dmatrix = _trition_build_features(df.copy(), meta)
    if dmatrix is None:
        return None
    results = {}
    for key, booster in models.items():
        pred = booster.predict(dmatrix)
        results[key] = round(float(pred[0]), 1)
    return results

def simulate_trition_method_a():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        start_iso = data.get('start')
        end_iso = data.get('end')
        selected_timeframe = data.get('selectedTimeframe', 1440)

        if not terminal_id or not start_iso or not end_iso:
            return jsonify({"error": "Missing terminalId, start, or end"}), 400

        preds = _trition_predict_all()
        if not preds:
            return jsonify({"bands": {}})

        now = datetime.now(timezone.utc)
        end_dt = datetime.fromisoformat(end_iso)
        future_minutes = int((end_dt - now).total_seconds() / 60)
        future_minutes = max(0, min(future_minutes, 1440))
        effective_steps = min(future_minutes, selected_timeframe)

        if effective_steps <= 0:
            return jsonify({"bands": {}})

        t_key = f"t{terminal_id}"
        horizon_preds = {}
        for key, val in preds.items():
            if key.startswith(t_key + "_h"):
                h_min = int(key.split("_h")[1].replace("m", ""))
                horizon_preds[h_min] = val

        if not horizon_preds:
            return jsonify({"bands": {}})

        sorted_horizons = sorted(horizon_preds.keys())
        bands = {}
        for minute in range(1, effective_steps + 1):
            interp_val = None
            if minute <= sorted_horizons[0]:
                current_val = preds.get(f"{t_key}_h{sorted_horizons[0]}m")
                sec_rows = _fetch_security_range(terminal_id, now - timedelta(minutes=5), now)
                last_obs = sec_rows[-1]['sec_time'] if sec_rows else current_val
                frac = minute / sorted_horizons[0]
                interp_val = last_obs + frac * (horizon_preds[sorted_horizons[0]] - last_obs)
            elif minute >= sorted_horizons[-1]:
                interp_val = horizon_preds[sorted_horizons[-1]]
            else:
                for i in range(len(sorted_horizons) - 1):
                    if sorted_horizons[i] <= minute <= sorted_horizons[i + 1]:
                        lo, hi = sorted_horizons[i], sorted_horizons[i + 1]
                        frac = (minute - lo) / (hi - lo)
                        interp_val = horizon_preds[lo] + frac * (horizon_preds[hi] - horizon_preds[lo])
                        break

            if interp_val is not None:
                v = max(0, round(interp_val))
                spread = max(1, int(v * 0.15))
                bands[str(minute)] = {
                    "p10": max(0, v - spread * 2),
                    "p25": max(0, v - spread),
                    "median": v,
                    "p75": v + spread,
                    "p90": v + spread * 2,
                }

        return jsonify({"bands": bands})
    except Exception as e:
        logging.error(f"Error in trition/method-a: {e}")
        return jsonify({"error": str(e)}), 500

def simulate_trition_method_b():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')

        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        preds = _trition_predict_all()
        if not preds:
            return jsonify({"paths": []})

        now = datetime.now(DUBLIN_TZ)
        last_minute = now.minute
        t_key = f"t{terminal_id}"

        sec_rows = _fetch_security_for_hour(terminal_id,
            now.replace(minute=0, second=0, microsecond=0),
            now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
        observed_values = [r['sec_time'] for r in sec_rows] if sec_rows else []
        last_value = observed_values[-1] if observed_values else None

        h60_pred = preds.get(f"{t_key}_h60m")
        if last_value is None or h60_pred is None:
            return jsonify({"paths": [], "dataPoints": len(observed_values)})

        future_minutes = list(range(last_minute + 1, 60))
        if not future_minutes:
            return jsonify({"paths": [], "dataPoints": len(observed_values)})

        paths = []
        for _ in range(15):
            path = []
            current = float(last_value)
            target = h60_pred
            remaining = len(future_minutes)
            for idx, m in enumerate(future_minutes):
                frac = (idx + 1) / remaining
                drift = (target - current) * 0.3
                noise = np.random.randn() * 0.5
                current = max(0, current + drift + noise)
                path.append({"minute": m, "value": max(0, round(current))})
            paths.append(path)

        return jsonify({"paths": paths, "dataPoints": len(observed_values)})
    except Exception as e:
        logging.error(f"Error in trition/method-b: {e}")
        return jsonify({"error": str(e)}), 500

def simulate_trition_method_d():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        hour_timestamp = data.get('hourTimestamp')

        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        preds = _trition_predict_all()
        if not preds:
            return jsonify({"projected": []})

        if hour_timestamp:
            ref_time = datetime.fromisoformat(hour_timestamp)
            if ref_time.tzinfo is None:
                ref_time = ref_time.replace(tzinfo=DUBLIN_TZ)
        else:
            ref_time = datetime.now(DUBLIN_TZ)

        current_minute = ref_time.minute
        t_key = f"t{terminal_id}"

        sec_rows = _fetch_security_for_hour(terminal_id,
            ref_time.replace(minute=0, second=0, microsecond=0),
            ref_time.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))

        observed = []
        for r in sec_rows:
            ts = r['timestamp']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            m = ts.astimezone(DUBLIN_TZ).minute
            if m <= current_minute:
                observed.append((m, r['sec_time']))

        if not observed:
            return jsonify({"projected": []})

        observed.sort(key=lambda x: x[0])
        last_value = observed[-1][1]
        last_minute = observed[-1][0]

        h60_pred = preds.get(f"{t_key}_h60m")
        if h60_pred is None:
            return jsonify({"projected": []})

        future_minutes = list(range(last_minute + 1, 60))
        if not future_minutes:
            return jsonify({"projected": []})

        projected = []
        current = float(last_value)
        remaining = len(future_minutes)
        for idx, m in enumerate(future_minutes):
            frac = (idx + 1) / remaining
            drift = (h60_pred - current) * 0.3
            current = max(0, current + drift)
            projected.append({"minute": m, "value": max(0, round(current))})

        return jsonify({"projected": projected})
    except Exception as e:
        logging.error(f"Error in trition/method-d: {e}")
        return jsonify({"error": str(e)}), 500

def simulate_trition_method_c():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400

        preds = _trition_predict_all()
        if not preds:
            return jsonify({"hours": []})

        now_utc = datetime.now(timezone.utc)
        now_dublin = datetime.now(DUBLIN_TZ)
        t_key = f"t{terminal_id}"

        horizon_preds = {}
        for key, val in preds.items():
            if key.startswith(t_key + "_h"):
                h_min = int(key.split("_h")[1].replace("m", ""))
                horizon_preds[h_min] = val

        if not horizon_preds:
            return jsonify({"hours": []})

        sec_rows = _fetch_security_range(terminal_id, now_utc - timedelta(minutes=5), now_utc)
        last_obs = sec_rows[-1]['sec_time'] if sec_rows else horizon_preds.get(60, 5)

        dep_rows = _fetch_departures_range(terminal_id, now_utc, now_utc + timedelta(hours=7))
        dep_times = []
        for r in dep_rows:
            ts = r['scheduled_datetime']
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            dep_times.append(ts)

        sorted_horizons = sorted(horizon_preds.keys())

        hours_result = []
        for h in range(6):
            hour_start_min = h * 60 + 1
            hour_end_min = (h + 1) * 60
            hour_time = now_dublin + timedelta(hours=h + 1)
            hour_label = hour_time.strftime('%I %p').lstrip('0')

            minutes_data = []
            medians = []
            for m in range(hour_start_min, hour_end_min + 1):
                interp_val = None
                if m <= sorted_horizons[0]:
                    frac = m / sorted_horizons[0]
                    interp_val = last_obs + frac * (horizon_preds[sorted_horizons[0]] - last_obs)
                elif m >= sorted_horizons[-1]:
                    interp_val = horizon_preds[sorted_horizons[-1]]
                else:
                    for i in range(len(sorted_horizons) - 1):
                        if sorted_horizons[i] <= m <= sorted_horizons[i + 1]:
                            lo, hi = sorted_horizons[i], sorted_horizons[i + 1]
                            frac = (m - lo) / (hi - lo)
                            interp_val = horizon_preds[lo] + frac * (horizon_preds[hi] - horizon_preds[lo])
                            break

                if interp_val is not None:
                    v = max(0, round(interp_val))
                    spread = max(1, int(v * 0.12))
                    minutes_data.append({
                        "minute": m - hour_start_min,
                        "median": v,
                        "p10": max(0, v - spread * 2),
                        "p25": max(0, v - spread),
                        "p75": v + spread,
                        "p90": v + spread * 2,
                    })
                    medians.append(v)

            avg_median = round(sum(medians) / len(medians)) if medians else None
            hour_utc_start = now_utc + timedelta(hours=h)
            hour_utc_end = now_utc + timedelta(hours=h + 1)
            dep_count = sum(1 for d in dep_times if hour_utc_start <= d < hour_utc_end)

            hours_result.append({
                "hourLabel": hour_label,
                "hourOffset": h + 1,
                "timestamp": hour_time.isoformat(),
                "avgMedian": avg_median,
                "departures": dep_count,
                "minutes": minutes_data,
            })

        return jsonify({"hours": hours_result})
    except Exception as e:
        logging.error(f"Error in trition/method-c: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
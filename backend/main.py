import os
import json
import logging
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from zoneinfo import ZoneInfo
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from google.cloud import recaptchaenterprise_v1
from google.cloud.recaptchaenterprise_v1 import Assessment

app = Flask(__name__)
CORS(app)

# Force all datetime/date/Decimal objects to serialize properly in JSON
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

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

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

@app.route('/api/security-data', methods=['GET'])
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
                
                # Group ALL records by date -> hour -> list of records
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
                        # For the summary t1/t2, use the average of non-null values
                        valid_t1 = [r['t1'] for r in records if r['t1'] is not None]
                        valid_t2 = [r['t2'] for r in records if r['t2'] is not None]
                        avg_t1 = round(sum(valid_t1) / len(valid_t1)) if valid_t1 else None
                        avg_t2 = round(sum(valid_t2) / len(valid_t2)) if valid_t2 else None
                        # Use the latest timestamp for the tile
                        latest_ts = records[-1]['timestamp'] if records else None
                        
                        hourly_data.append({
                            'hour': hour,
                            't1': avg_t1,
                            't2': avg_t2,
                            'timestamp': latest_ts,
                            'records': records,  # ALL per-poll records for this hour
                        })
                    
                    historical_data.append({
                        'date': date_key,
                        'hourlyData': hourly_data
                    })
                
                return jsonify(historical_data)
    except Exception as e:
        logging.error(f"Error fetching security data: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/departure-data', methods=['POST'])
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

@app.route('/api/hourly-interval-security-data', methods=['GET'])
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
                # Convert timestamps to Dublin local time so frontend grouping by hour matches the hourly tiles
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

@app.route('/api/hourly-interval-departure-data', methods=['POST'])
def get_hourly_interval_departure_data():
    try:
        data = request.get_json()
        terminal_id = data.get('terminalId')
        
        if not terminal_id:
            return jsonify({"error": "Missing terminalId"}), 400
        
        terminal_name = f"T{terminal_id}"
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get all departure times for this terminal in the last 3 days
                cur.execute("""
                    SELECT scheduled_datetime
                    FROM departures 
                    WHERE terminal_name = %s AND scheduled_datetime >= NOW() - INTERVAL '3 days'
                    ORDER BY scheduled_datetime ASC
                """, (terminal_name,))
                
                departures = cur.fetchall()
                
                # Build minute-by-minute data: for each hour that has departures,
                # generate 60 minute slots. Count = number of flights within ±5 min of that slot.
                from collections import defaultdict
                
                # Group departure times by hour bucket
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
                            if diff <= 300:  # 5 minutes = 300 seconds
                                count += 1
                        results.append({
                            'timestamp': minute_ts,
                            'count': count
                        })
                
                return jsonify(results)
    except Exception as e:
        logging.error(f"Error fetching hourly interval departure data: {e}")
        return jsonify({"error": str(e)}), 500

GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID')
RECAPTCHA_SITE_KEY = os.environ.get('RECAPTCHA_SITE_KEY')
RECAPTCHA_ACTION = os.environ.get('RECAPTCHA_ACTION', 'submit_feature_request')

def verify_recaptcha(token):
    if not GCP_PROJECT_ID or not RECAPTCHA_SITE_KEY:
        raise ValueError("GCP_PROJECT_ID or RECAPTCHA_SITE_KEY not configured")

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

    if not response.token_properties.valid:
        logging.warning(f"reCAPTCHA token invalid: {response.token_properties.invalid_reason}")
        return False

    if response.token_properties.action != RECAPTCHA_ACTION:
        logging.warning(f"reCAPTCHA action mismatch: expected {RECAPTCHA_ACTION}, got {response.token_properties.action}")
        return False

    score = response.risk_analysis.score
    logging.info(f"reCAPTCHA Enterprise score: {score}")
    return score >= 0.5

@app.route('/api/feature-requests', methods=['POST'])
def submit_feature_request():
    try:
        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        details = data.get('details')
        recaptcha_token = data.get('recaptchaToken')
        
        if not details:
            return jsonify({"error": "Feature details are required"}), 400
        
        if not recaptcha_token:
            return jsonify({"error": "reCAPTCHA token is required"}), 400
        
        if not verify_recaptcha(recaptcha_token):
            return jsonify({"error": "reCAPTCHA verification failed. Please try again."}), 403
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO feature_requests (name, email, details, created_at) 
                    VALUES (%s, %s, %s, %s)
                """, (name, email, details, datetime.now(timezone.utc)))
                
                conn.commit()
                return jsonify({"message": "Feature request submitted successfully"})
    except Exception as e:
        logging.error(f"Error submitting feature request: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/acknowledged-feature-requests', methods=['GET'])
def get_acknowledged_feature_requests():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, name, email, details, created_at, acknowledged_at 
                    FROM feature_requests 
                    WHERE acknowledged_at IS NOT NULL 
                    ORDER BY acknowledged_at DESC
                """)
                
                results = cur.fetchall()
                return jsonify([dict(row) for row in results])
    except Exception as e:
        logging.error(f"Error fetching acknowledged feature requests: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/active-announcements', methods=['GET'])
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


@app.route('/api/seo-security-data', methods=['GET'])
def seo_security_data():
    """
    Returns a fully-rendered HTML page with current Dublin Airport security times
    embedded in structured data (JSON-LD). Designed for Googlebot and other crawlers
    to power featured snippets, rich results, and AI overviews.
    """
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
        now_iso = now_dublin.isoformat()

        t1_str = f"{t1} minutes" if t1 is not None else "No data"
        t2_str = f"{t2} minutes" if t2 is not None else "No data"

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

        # Build JSON-LD structured data
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
<p>EIDW Times uses Monte Carlo simulations to project future security queue wait times based on current and historical data.</p>

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
import os
import json
import logging
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.environ.get('DATABASE_URL')

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
                
                daily_hourly_data = {}
                for item in data:
                    timestamp = item['timestamp']
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=timezone.utc)
                    
                    local_time = timestamp + timedelta(hours=1)
                    date_key = local_time.strftime('%Y-%m-%d')
                    hour = local_time.hour
                    
                    if date_key not in daily_hourly_data:
                        daily_hourly_data[date_key] = {}
                    
                    if hour not in daily_hourly_data[date_key] or timestamp > daily_hourly_data[date_key][hour]['original_timestamp']:
                        daily_hourly_data[date_key][hour] = {
                            't1': item['t1'],
                            't2': item['t2'],
                            'timestamp': local_time.isoformat(),
                            'original_timestamp': timestamp
                        }
                
                historical_data = []
                for i in range(6, -1, -1):
                    date = datetime.now(timezone.utc) - timedelta(days=i)
                    date_key = date.strftime('%Y-%m-%d')
                    
                    hourly_data = []
                    day_data = daily_hourly_data.get(date_key, {})
                    
                    for hour in range(24):
                        record = day_data.get(hour)
                        hourly_data.append({
                            'hour': hour,
                            't1': record['t1'] if record else None,
                            't2': record['t2'] if record else None,
                            'timestamp': record['timestamp'] if record else None
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
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT departure_datetime, departure_count 
                    FROM departures 
                    WHERE terminal_id = %s AND departure_datetime >= %s 
                    ORDER BY departure_datetime ASC
                """, (terminal_id, three_days_ago))
                
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
                        DATE_TRUNC('hour', timestamp + INTERVAL '1 hour') as hour_bucket,
                        AVG(t1) as avg_t1,
                        AVG(t2) as avg_t2,
                        COUNT(*) as count
                    FROM security_times 
                    WHERE timestamp >= NOW() - INTERVAL '24 hours'
                    GROUP BY hour_bucket 
                    ORDER BY hour_bucket ASC
                """)
                
                results = cur.fetchall()
                return jsonify([dict(row) for row in results])
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
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        DATE_TRUNC('hour', departure_datetime) as hour_bucket,
                        SUM(departure_count) as total_departures
                    FROM departures 
                    WHERE terminal_id = %s AND departure_datetime >= NOW() - INTERVAL '24 hours'
                    GROUP BY hour_bucket 
                    ORDER BY hour_bucket ASC
                """, (terminal_id,))
                
                results = cur.fetchall()
                return jsonify([dict(row) for row in results])
    except Exception as e:
        logging.error(f"Error fetching hourly interval departure data: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/feature-requests', methods=['POST'])
def submit_feature_request():
    try:
        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        details = data.get('details')
        
        if not details:
            return jsonify({"error": "Feature details are required"}), 400
        
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
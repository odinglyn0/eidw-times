import os
import json
import time
import logging
import requests
import psycopg2
from datetime import datetime, timezone
from google.cloud import logging as cloud_logging

cloud_logging.Client().setup_logging()
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')
API_URL = "https://api.dublinairport.com/dap/get-security-times"

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def fetch_security_data():
    try:
        response = requests.get(API_URL, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch security data: {e}")
        return None

def parse_security_value(value_str):
    if not value_str or value_str.strip() == "":
        return None
    try:
        return int(value_str.replace("=", "").strip())
    except ValueError:
        return None

def store_security_data(data):
    if not data:
        return
    
    t1_value = parse_security_value(data.get("T1"))
    t2_value = parse_security_value(data.get("T2"))
    timestamp = datetime.now(timezone.utc)
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO security_times (timestamp, t1, t2) 
                    VALUES (%s, %s, %s)
                """, (timestamp, t1_value, t2_value))
                
                cur.execute("""
                    INSERT INTO security_times_current (id, t1, t2, last_updated) 
                    VALUES (1, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET 
                    t1 = EXCLUDED.t1, 
                    t2 = EXCLUDED.t2, 
                    last_updated = EXCLUDED.last_updated
                """, (t1_value, t2_value, timestamp))
                
                conn.commit()
                logger.info(f"Stored security data: T1={t1_value}, T2={t2_value}")
    except Exception as e:
        logger.error(f"Failed to store security data: {e}")

def main():
    data = fetch_security_data()
    store_security_data(data)
    return {"status": "success"}

if __name__ == "__main__":
    main()
import os
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

def parse_security_value(value_str):
    if not value_str or value_str.strip() == "":
        logger.warning(f"Empty or missing security value: repr={repr(value_str)}")
        return None
    try:
        result = int(value_str.replace("=", "").strip())
        return result
    except ValueError:
        logger.warning(f"Could not parse security value: repr={repr(value_str)}")
        return None

def main():
    try:
        response = requests.get(API_URL, timeout=10)
        response.raise_for_status()
        data = response.json()
        logger.info(f"Raw API response: {data}")
    except Exception as e:
        logger.error(f"Failed to fetch security data: {e}")
        return

    t1 = parse_security_value(data.get("T1"))
    t2 = parse_security_value(data.get("T2"))
    now = datetime.now(timezone.utc)

    if t1 is None and t2 is None:
        logger.warning(f"Both T1 and T2 are None, skipping DB write. Raw data: {data}")
        return

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO security_times (timestamp, t1, t2) VALUES (%s, %s, %s)",
                    (now, t1, t2),
                )

                if t1 is not None and t2 is not None:
                    cur.execute("""
                        INSERT INTO security_times_current (id, t1, t2, last_updated)
                        VALUES (1, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                        t1 = EXCLUDED.t1, t2 = EXCLUDED.t2, last_updated = EXCLUDED.last_updated
                    """, (t1, t2, now))
                elif t1 is not None:
                    cur.execute("""
                        UPDATE security_times_current SET t1 = %s, last_updated = %s WHERE id = 1
                    """, (t1, now))
                    logger.warning(f"T2 was None, only updating T1={t1}")
                else:
                    cur.execute("""
                        UPDATE security_times_current SET t2 = %s, last_updated = %s WHERE id = 1
                    """, (t2, now))
                    logger.warning(f"T1 was None, only updating T2={t2}")

                conn.commit()
                logger.info(f"Stored security data: T1={t1}, T2={t2}")
    except Exception as e:
        logger.error(f"Failed to store security data: {e}")

if __name__ == "__main__":
    main()
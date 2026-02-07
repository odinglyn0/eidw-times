import os
import logging
import requests
import psycopg2
from datetime import datetime, timezone
from google.cloud import logging as cloud_logging

cloud_logging.Client().setup_logging()
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')
API_URL = "https://api.dublinairport.com/dap/flight-listing/departures"

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def main():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        response = requests.get(API_URL, params={"date": today, "limit": 1000}, timeout=15)
        response.raise_for_status()
        flights = response.json().get("content", [])
    except Exception as e:
        logger.error(f"Failed to fetch departure data: {e}")
        return

    if not flights:
        logger.info("No departure data returned")
        return

    now = datetime.now(timezone.utc)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for f in flights:
                    cur.execute("""
                        INSERT INTO departures (
                            internal_flight_id, flight_identity, carrier_code, carrier_name,
                            scheduled_datetime, estimated_datetime, status, status_message,
                            terminal_name, destination, gate, checkin_zone, checkin_desk_range,
                            is_delayed, last_updated, polled_at
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (internal_flight_id) DO UPDATE SET
                            estimated_datetime = EXCLUDED.estimated_datetime,
                            status = EXCLUDED.status,
                            status_message = EXCLUDED.status_message,
                            gate = EXCLUDED.gate,
                            is_delayed = EXCLUDED.is_delayed,
                            last_updated = EXCLUDED.last_updated,
                            polled_at = EXCLUDED.polled_at
                    """, (
                        f.get("internalFlightId"),
                        f.get("flightIdentity"),
                        f.get("carrierCode"),
                        f.get("carrierName"),
                        f.get("scheduledDateTime"),
                        f.get("estimatedDateTime"),
                        f.get("status"),
                        f.get("statusMessage"),
                        f.get("terminalName"),
                        f.get("destinationAirportName"),
                        f.get("gate"),
                        f.get("checkinZone"),
                        f.get("checkinDeskRange"),
                        f.get("isDelayed", False),
                        f.get("lastUpdated"),
                        now,
                    ))
                conn.commit()
                logger.info(f"Stored {len(flights)} departure records")
    except Exception as e:
        logger.error(f"Failed to store departure data: {e}")

if __name__ == "__main__":
    main()
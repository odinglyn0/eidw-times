import os
import json
import logging
import psycopg2
from datetime import datetime, timezone

import scrapy
from scrapy.crawler import CrawlerProcess

from google.cloud import logging as cloud_logging

cloud_logging.Client().setup_logging()
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')
API_URL = "https://api.dublinairport.com/dap/flight-listing/departures"


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def store_departures(flights):
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


class DeparturesSpider(scrapy.Spider):
    name = "departures_spider"
    custom_settings = {
        "TWISTED_REACTOR": "twisted.internet.asyncioreactor.AsyncioSelectorReactor",
        "USER_AGENT": None,
        "DOWNLOAD_HANDLERS": {
            "http": "scrapy_impersonate.ImpersonateDownloadHandler",
            "https": "scrapy_impersonate.ImpersonateDownloadHandler",
        },
        "DOWNLOADER_MIDDLEWARES": {
            "scrapy_impersonate.RandomBrowserMiddleware": 1000,
        },
        "REQUEST_FINGERPRINTER_IMPLEMENTATION": "2.7",
        "LOG_LEVEL": "WARNING",
    }

    def start_requests(self):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        url = f"{API_URL}?date={today}&limit=1000"
        yield scrapy.Request(url, callback=self.parse)

    def parse(self, response):
        logger.info(f"Response status: {response.status}")
        logger.info(f"Response headers: {dict(response.headers)}")
        try:
            data = json.loads(response.text)
            logger.info(f"Raw API response keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse API response: {e}, body={response.text[:500]}")
            return

        flights = data.get("content", []) if isinstance(data, dict) else []
        logger.info(f"Got {len(flights)} flights from API")
        store_departures(flights)


if __name__ == "__main__":
    process = CrawlerProcess()
    process.crawl(DeparturesSpider)
    process.start()

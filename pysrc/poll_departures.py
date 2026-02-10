import os
import json
import logging
import psycopg2
from datetime import datetime, timezone, timedelta

import scrapy
from scrapy.crawler import CrawlerProcess

from google.cloud import logging as cloud_logging

cloud_logging.Client().setup_logging()
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')
API_URL = "https://api.dublinairport.com/dap/flight-listing/departures"
SCRAPE_DAYS_AHEAD = 2


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
                            checkin_zone = EXCLUDED.checkin_zone,
                            checkin_desk_range = EXCLUDED.checkin_desk_range,
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
    max_retries = 5
    retry_delay = 0.75
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
        "DEFAULT_REQUEST_HEADERS": {
            "Origin": "https://www.dublinairport.com",
            "Referer": "https://www.dublinairport.com/",
        },
        "DOWNLOAD_TIMEOUT": 3,
        "RETRY_TIMES": 5,
        "RETRY_HTTP_CODES": [500, 502, 503, 504, 408, 429],
        "DOWNLOAD_DELAY": 0.75,
        "REQUEST_FINGERPRINTER_IMPLEMENTATION": "2.7",
        "LOG_LEVEL": "WARNING",
    }

    def start_requests(self):
        today = datetime.now(timezone.utc)
        for day_offset in range(SCRAPE_DAYS_AHEAD + 1):
            target_date = (today + timedelta(days=day_offset)).strftime("%Y-%m-%d")
            url = f"{API_URL}?date={target_date}&limit=1000"
            yield scrapy.Request(
                url,
                callback=self.parse,
                meta={"retry_count": 0, "target_date": target_date, "request_url": url},
                dont_filter=True,
            )

    def parse(self, response):
        retry_count = response.meta.get("retry_count", 0)
        target_date = response.meta.get("target_date")
        request_url = response.meta.get("request_url")
        logger.info(f"[{target_date}] Response status: {response.status} (attempt {retry_count + 1})")
        logger.info(f"[{target_date}] Response headers: {dict(response.headers)}")
        try:
            data = json.loads(response.text)
            logger.info(f"[{target_date}] Raw API response keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
        except json.JSONDecodeError as e:
            logger.error(f"[{target_date}] Failed to parse API response: {e}, body={response.text[:500]}")
            if retry_count < self.max_retries:
                logger.warning(f"[{target_date}] Retrying due to JSON parse failure (attempt {retry_count + 1}/{self.max_retries})")
                import time
                time.sleep(self.retry_delay)
                yield scrapy.Request(
                    request_url,
                    callback=self.parse,
                    meta={"retry_count": retry_count + 1, "target_date": target_date, "request_url": request_url},
                    dont_filter=True,
                )
            return

        flights = data.get("content", []) if isinstance(data, dict) else []

        if not flights and retry_count < self.max_retries:
            logger.warning(f"[{target_date}] Empty flights list, retrying (attempt {retry_count + 1}/{self.max_retries}). Raw data keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
            import time
            time.sleep(self.retry_delay)
            yield scrapy.Request(
                request_url,
                callback=self.parse,
                meta={"retry_count": retry_count + 1, "target_date": target_date, "request_url": request_url},
                dont_filter=True,
            )
            return

        logger.info(f"[{target_date}] Got {len(flights)} flights from API")
        store_departures(flights)


if __name__ == "__main__":
    process = CrawlerProcess()
    process.crawl(DeparturesSpider)
    process.start()

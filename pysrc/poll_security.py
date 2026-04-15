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

DATABASE_URL = os.environ.get("DATABASE_URL")
API_URL = os.environ.get("SECURITY_API_URL", "https://www.dublinairport.com/upi/SecurityTimes/GetTimes")


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


def store_security_data(t1, t2):
    now = datetime.now(timezone.utc)

    if t1 is None and t2 is None:
        logger.warning("Both T1 and T2 are None, skipping DB write.")
        return

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO security_times (timestamp, t1, t2) VALUES (%s, %s, %s)",
                    (now, t1, t2),
                )

                if t1 is not None and t2 is not None:
                    cur.execute(
                        """
                        INSERT INTO security_times_current (id, t1, t2, last_updated)
                        VALUES (1, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                        t1 = EXCLUDED.t1, t2 = EXCLUDED.t2, last_updated = EXCLUDED.last_updated
                    """,
                        (t1, t2, now),
                    )
                elif t1 is not None:
                    cur.execute(
                        """
                        UPDATE security_times_current SET t1 = %s, last_updated = %s WHERE id = 1
                    """,
                        (t1, now),
                    )
                    logger.warning(f"T2 was None, only updating T1={t1}")
                else:
                    cur.execute(
                        """
                        UPDATE security_times_current SET t2 = %s, last_updated = %s WHERE id = 1
                    """,
                        (t2, now),
                    )
                    logger.warning(f"T1 was None, only updating T2={t2}")

                conn.commit()
                logger.info(f"Stored security data: T1={t1}, T2={t2}")
    except Exception as e:
        logger.error(f"Failed to store security data: {e}")


class SecuritySpider(scrapy.Spider):
    name = "security_spider"
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
        yield scrapy.Request(
            API_URL, callback=self.parse, meta={"retry_count": 0}, dont_filter=True
        )

    def parse(self, response):
        retry_count = response.meta.get("retry_count", 0)
        logger.info(f"Response status: {response.status} (attempt {retry_count + 1})")
        logger.info(f"Response headers: {dict(response.headers)}")
        try:
            data = json.loads(response.text)
            logger.info(f"Raw API response: {data}")
        except json.JSONDecodeError as e:
            logger.error(
                f"Failed to parse API response: {e}, body={response.text[:500]}"
            )
            if retry_count < self.max_retries:
                logger.warning(
                    f"Retrying due to JSON parse failure (attempt {retry_count + 1}/{self.max_retries})"
                )
                import time

                time.sleep(self.retry_delay)
                yield scrapy.Request(
                    API_URL,
                    callback=self.parse,
                    meta={"retry_count": retry_count + 1},
                    dont_filter=True,
                )
            return

        t1 = parse_security_value(data.get("T1"))
        t2 = parse_security_value(data.get("T2"))

        if t1 is None and t2 is None and retry_count < self.max_retries:
            logger.warning(
                f"Both T1 and T2 are None, retrying (attempt {retry_count + 1}/{self.max_retries}). Raw data: {data}"
            )
            import time

            time.sleep(self.retry_delay)
            yield scrapy.Request(
                API_URL,
                callback=self.parse,
                meta={"retry_count": retry_count + 1},
                dont_filter=True,
            )
            return

        store_security_data(t1, t2)


if __name__ == "__main__":
    process = CrawlerProcess()
    process.crawl(SecuritySpider)
    process.start()

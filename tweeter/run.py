import os
import sys
import asyncio
import logging
import tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import bs4
import httpx
import psycopg2
from psycopg2.extras import RealDictCursor
from twikit import Client
from x_client_transaction import ClientTransaction as XClientTransaction
from x_client_transaction.utils import generate_headers, get_ondemand_file_url

from viz import plot_security_times
from text import generate_tweet

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
COOKIES_PATH = os.environ.get("TWITTER_COOKIES_PATH", "/app/cookies.json")


def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def fetch_current_times(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT t1, t2 FROM security_times_current WHERE id = 1")
        row = cur.fetchone()
    if not row or row["t1"] is None or row["t2"] is None:
        raise RuntimeError("No current security times available")
    return int(row["t1"]), int(row["t2"])


def fetch_one_hour_ago_times(conn):
    target = datetime.now(timezone.utc) - timedelta(hours=1)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t1, t2, timestamp
            FROM security_times
            WHERE timestamp <= %s
            ORDER BY timestamp DESC
            LIMIT 1
            """,
            (target,),
        )
        row = cur.fetchone()
    if not row:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT t1, t2, timestamp
                FROM security_times
                WHERE timestamp >= %s
                ORDER BY timestamp ASC
                LIMIT 1
                """,
                (target,),
            )
            row = cur.fetchone()
    if not row or row["t1"] is None or row["t2"] is None:
        raise RuntimeError("No security times found near 1 hour ago")
    log.info("Using historical row from %s for 1-hour-ago data", row["timestamp"])
    return int(row["t1"]), int(row["t2"])


def fetch_predictions(conn):
    now = datetime.now(timezone.utc)
    targets = {
        "1h": now + timedelta(hours=1),
        "2h": now + timedelta(hours=2),
        "3h": now + timedelta(hours=3),
    }

    results = {}
    for label, target_time in targets.items():
        for terminal in (1, 2):
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT predicted_wait, target_hour
                    FROM predictions
                    WHERE terminal = %s
                    ORDER BY ABS(EXTRACT(EPOCH FROM (target_hour - %s))) ASC
                    LIMIT 1
                    """,
                    (terminal, target_time),
                )
                row = cur.fetchone()
            if not row:
                raise RuntimeError(f"No prediction found for T{terminal} near {label}")
            results[f"t{terminal}_{label}"] = round(row["predicted_wait"])

    return results


async def _build_transaction_generator():
    async with httpx.AsyncClient(headers=generate_headers()) as session:
        home_page = await session.get("https://x.com")
        home_page_response = bs4.BeautifulSoup(home_page.content, "html.parser")
        ondemand_url = get_ondemand_file_url(response=home_page_response)
        ondemand_file = await session.get(ondemand_url)
        ondemand_text = ondemand_file.text
    return XClientTransaction(
        home_page_response=home_page_response,
        ondemand_file_response=ondemand_text,
    )


async def send_tweet(tweet_text, image_bytes):
    client = Client("en-US")

    if not os.path.exists(COOKIES_PATH):
        raise RuntimeError(f"Cookies file not found at {COOKIES_PATH}")

    client.load_cookies(COOKIES_PATH)

    log.info("Building X-Client-Transaction-Id generator")
    xct = await _build_transaction_generator()

    async def _noop_init(*args, **kwargs):
        pass

    def _generate_tid(**kwargs):
        method = kwargs.get("method", "GET")
        path = kwargs.get("path", "/")
        return xct.generate_transaction_id(method=method, path=path)

    client.client_transaction.init = _noop_init
    client.client_transaction.generate_transaction_id = _generate_tid

    log.info("Loaded cookies from %s", COOKIES_PATH)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(image_bytes)
        tmp_path = f.name

    try:
        media_id = await client.upload_media(tmp_path)
        await client.create_tweet(text=tweet_text, media_ids=[media_id])
        log.info("Tweet posted successfully")
    finally:
        os.unlink(tmp_path)


def main():
    log.info("Starting tweeter run")

    conn = get_db_connection()
    try:
        t1_now, t2_now = fetch_current_times(conn)
        log.info("Current times — T1: %d, T2: %d", t1_now, t2_now)

        t1_last_hour, t2_last_hour = fetch_one_hour_ago_times(conn)
        log.info("1hr ago times — T1: %d, T2: %d", t1_last_hour, t2_last_hour)

        preds = fetch_predictions(conn)
        log.info("Predictions — %s", preds)
    finally:
        conn.close()

    t1_next_hour = preds["t1_1h"]
    t1_in_2_hours = preds["t1_2h"]
    t1_in_3_hours = preds["t1_3h"]
    t2_next_hour = preds["t2_1h"]
    t2_in_2_hours = preds["t2_2h"]
    t2_in_3_hours = preds["t2_3h"]

    tweet_text = generate_tweet(
        t1_last_hour,
        t1_now,
        t1_next_hour,
        t1_in_2_hours,
        t1_in_3_hours,
        t2_last_hour,
        t2_now,
        t2_next_hour,
        t2_in_2_hours,
        t2_in_3_hours,
    )
    log.info("Generated tweet (%d chars): %s", len(tweet_text), tweet_text)

    image_bytes = plot_security_times(
        t1_last_hour,
        t1_now,
        t1_next_hour,
        t1_in_2_hours,
        t1_in_3_hours,
        t2_last_hour,
        t2_now,
        t2_next_hour,
        t2_in_2_hours,
        t2_in_3_hours,
    )
    log.info("Generated image (%d bytes)", len(image_bytes))

    asyncio.run(send_tweet(tweet_text, image_bytes))
    log.info("Tweeter run complete")


if __name__ == "__main__":
    main()

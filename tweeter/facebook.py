import os
import time
import logging

import httpx

log = logging.getLogger(__name__)

GRAPH_API_VERSION = os.environ.get("FACEBOOK_GRAPH_API_VERSION", "v21.0")


def is_facebook_configured():
    return bool(
        os.environ.get("FACEBOOK_PAGE_ID")
        and os.environ.get("FACEBOOK_PAGE_ACCESS_TOKEN")
    )


def post_to_facebook(message, image_bytes):
    page_id = os.environ.get("FACEBOOK_PAGE_ID")
    access_token = os.environ.get("FACEBOOK_PAGE_ACCESS_TOKEN")

    if not page_id or not access_token:
        raise RuntimeError(
            "Facebook not configured: set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN"
        )

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{page_id}/photos"

    last_error = None
    for attempt in range(3):
        try:
            response = httpx.post(
                url,
                data={"message": message, "access_token": access_token},
                files={"source": ("chart.png", image_bytes, "image/png")},
                timeout=60.0,
            )
        except httpx.HTTPError as e:
            last_error = e
            log.warning(
                "Facebook request error on attempt %d: %s", attempt + 1, e
            )
            time.sleep(5 * (attempt + 1))
            continue

        if response.status_code == 200:
            payload = response.json()
            post_id = payload.get("post_id") or payload.get("id")
            log.info("Posted to Facebook successfully (id: %s)", post_id)
            return post_id

        if response.status_code >= 500 and attempt < 2:
            log.warning(
                "Facebook %d on attempt %d, retrying",
                response.status_code,
                attempt + 1,
            )
            time.sleep(5 * (attempt + 1))
            continue

        raise RuntimeError(
            f"Facebook API error {response.status_code}: {response.text}"
        )

    raise RuntimeError(f"Facebook request failed after retries: {last_error}")

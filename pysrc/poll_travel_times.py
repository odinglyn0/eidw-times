import os
import json
import logging
import time
import psycopg2
import requests
from datetime import datetime, timezone, timedelta

from google.cloud import logging as cloud_logging

cloud_logging.Client().setup_logging()
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

TERMINAL_DESTINATIONS = {
    "Terminal 1": {"latitude": 53.42728, "longitude": -6.24357},
    "Terminal 2": {"latitude": 53.42513, "longitude": -6.25200},
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_starting_points():
    path = os.path.join(SCRIPT_DIR, "starting-points.json")
    with open(path, "r") as f:
        data = json.load(f)
    points = []
    for category, locations in data.items():
        for loc in locations:
            points.append({"name": loc["name"], "category": category})
    return points


def geocode_place(name):
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    resp = requests.get(url, params={"address": f"{name}, Ireland", "key": GOOGLE_MAPS_API_KEY}, timeout=10)
    data = resp.json()
    if data.get("status") == "OK" and data.get("results"):
        result = data["results"][0]
        loc = result["geometry"]["location"]
        return {
            "latitude": loc["lat"],
            "longitude": loc["lng"],
            "place_id": result.get("place_id"),
            "formatted_address": result.get("formatted_address"),
            "types": result.get("types", []),
        }
    logger.warning(f"Geocode failed for {name}: {data.get('status')}")
    return None


def compute_route(origin_lat, origin_lng, dest_lat, dest_lng, departure_time_str):
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "routes.duration,routes.staticDuration,routes.distanceMeters,"
            "routes.polyline,routes.description,routes.warnings,routes.routeLabels,"
            "routes.routeToken,routes.legs,routes.travelAdvisory,routes.viewport,"
            "routes.localizedValues,routes.optimizedIntermediateWaypointIndex,"
            "geocodingResults"
        ),
    }
    body = {
        "origin": {
            "location": {
                "latLng": {"latitude": origin_lat, "longitude": origin_lng}
            }
        },
        "destination": {
            "location": {
                "latLng": {"latitude": dest_lat, "longitude": dest_lng}
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
        "departureTime": departure_time_str,
        "computeAlternativeRoutes": False,
        "extraComputations": ["TRAFFIC_ON_POLYLINE", "FUEL_CONSUMPTION", "TOLLS"],
        "routeModifiers": {
            "avoidTolls": False,
            "avoidHighways": False,
            "avoidFerries": False,
        },
    }
    resp = requests.post(ROUTES_API_URL, headers=headers, json=body, timeout=30)
    if resp.status_code != 200:
        logger.error(f"Routes API error {resp.status_code}: {resp.text[:500]}")
        return None, resp.json() if resp.text else None
    return resp.json(), resp.json()


def parse_duration(d):
    if not d:
        return None, None
    secs = int(d.rstrip("s")) if isinstance(d, str) else None
    if secs is not None:
        mins = secs // 60
        text = f"{mins} min" if mins > 0 else f"{secs} sec"
        return secs, text
    return None, None


def extract_route_data(route_response, raw_json):
    if not route_response or "routes" not in route_response or not route_response["routes"]:
        return None
    route = route_response["routes"][0]
    duration_secs, duration_text = parse_duration(route.get("duration"))
    static_secs, static_text = parse_duration(route.get("staticDuration"))
    delay_secs = None
    delay_ratio = None
    if duration_secs is not None and static_secs is not None and static_secs > 0:
        delay_secs = duration_secs - static_secs
        delay_ratio = round(duration_secs / static_secs, 4)
    legs = route.get("legs", [])
    leg = legs[0] if legs else {}
    leg_steps = leg.get("steps", [])
    steps_data = []
    for s in leg_steps:
        steps_data.append({
            "distanceMeters": s.get("distanceMeters"),
            "staticDuration": s.get("staticDuration"),
            "polyline": s.get("polyline", {}).get("encodedPolyline"),
            "startLocation": s.get("startLocation"),
            "endLocation": s.get("endLocation"),
            "navigationInstruction": s.get("navigationInstruction"),
            "travelAdvisory": s.get("localizedValues") or s.get("travelAdvisory"),
        })
    travel_advisory = route.get("travelAdvisory", {})
    speed_intervals = travel_advisory.get("speedReadingIntervals", [])
    viewport = route.get("viewport", {})
    low = viewport.get("low", {})
    high = viewport.get("high", {})
    geocoding = route_response.get("geocodingResults", {})
    geo_origin = geocoding.get("origin", {})
    geo_dest = geocoding.get("destination", {})
    localized = route.get("localizedValues", {})
    fuel = travel_advisory.get("fuelConsumptionMicroliters")
    toll_info = travel_advisory.get("tollInfo")
    traffic_condition = None
    traffic_speed = None
    if delay_ratio is not None:
        if delay_ratio <= 1.05:
            traffic_condition = "FREE_FLOW"
            traffic_speed = "NORMAL"
        elif delay_ratio <= 1.25:
            traffic_condition = "LIGHT"
            traffic_speed = "SLOW"
        elif delay_ratio <= 1.5:
            traffic_condition = "MODERATE"
            traffic_speed = "TRAFFIC_JAM"
        elif delay_ratio <= 2.0:
            traffic_condition = "HEAVY"
            traffic_speed = "VERY_SLOW"
        else:
            traffic_condition = "SEVERE"
            traffic_speed = "STOPPED"
    return {
        "duration_seconds": duration_secs,
        "duration_text": duration_text,
        "duration_in_traffic_seconds": duration_secs,
        "duration_in_traffic_text": duration_text,
        "static_duration_seconds": static_secs,
        "static_duration_text": static_text,
        "delay_seconds": delay_secs,
        "delay_ratio": delay_ratio,
        "distance_meters": route.get("distanceMeters"),
        "distance_text": f"{round(route.get('distanceMeters', 0) / 1000, 1)} km" if route.get("distanceMeters") else None,
        "travel_advisory_speed_reading_intervals": json.dumps(speed_intervals) if speed_intervals else None,
        "route_polyline": route.get("polyline", {}).get("encodedPolyline"),
        "route_description": route.get("description"),
        "route_token": route.get("routeToken"),
        "route_legs_count": len(legs),
        "route_leg_start_address": leg.get("startLocation", {}).get("latLng", {}),
        "route_leg_end_address": leg.get("endLocation", {}).get("latLng", {}),
        "route_leg_steps_count": len(leg_steps),
        "route_leg_steps": json.dumps(steps_data) if steps_data else None,
        "route_travel_advisory": json.dumps(travel_advisory) if travel_advisory else None,
        "route_viewport_low_lat": low.get("latitude"),
        "route_viewport_low_lng": low.get("longitude"),
        "route_viewport_high_lat": high.get("latitude"),
        "route_viewport_high_lng": high.get("longitude"),
        "geocoded_origin_place_id": geo_origin.get("geocoderPlaceId"),
        "geocoded_origin_formatted_address": geo_origin.get("formattedAddress"),
        "geocoded_origin_types": json.dumps(geo_origin.get("type", [])) if geo_origin.get("type") else None,
        "geocoded_destination_place_id": geo_dest.get("geocoderPlaceId"),
        "geocoded_destination_formatted_address": geo_dest.get("formattedAddress"),
        "geocoded_destination_types": json.dumps(geo_dest.get("type", [])) if geo_dest.get("type") else None,
        "traffic_condition": traffic_condition,
        "traffic_speed_category": traffic_speed,
        "route_warnings": json.dumps(route.get("warnings", [])) if route.get("warnings") else None,
        "route_labels": json.dumps(route.get("routeLabels", [])) if route.get("routeLabels") else None,
        "fuel_consumption_microliters": fuel,
        "toll_info": json.dumps(toll_info) if toll_info else None,
        "optimized_intermediate_waypoint_index": json.dumps(route.get("optimizedIntermediateWaypointIndex")) if route.get("optimizedIntermediateWaypointIndex") else None,
        "localized_values": json.dumps(localized) if localized else None,
        "response_raw_json": json.dumps(raw_json),
    }


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def store_row(row):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO travel_times (
                        polled_at, origin_name, origin_category, destination_terminal,
                        origin_latitude, origin_longitude, destination_latitude, destination_longitude,
                        duration_seconds, duration_text, duration_in_traffic_seconds, duration_in_traffic_text,
                        static_duration_seconds, static_duration_text, delay_seconds, delay_ratio,
                        distance_meters, distance_text, travel_advisory_speed_reading_intervals,
                        route_polyline, route_description, route_token, route_legs_count,
                        route_leg_start_address, route_leg_end_address, route_leg_steps_count,
                        route_leg_steps, route_travel_advisory,
                        route_viewport_low_lat, route_viewport_low_lng,
                        route_viewport_high_lat, route_viewport_high_lng,
                        geocoded_origin_place_id, geocoded_origin_formatted_address, geocoded_origin_types,
                        geocoded_destination_place_id, geocoded_destination_formatted_address, geocoded_destination_types,
                        traffic_condition, traffic_speed_category, route_warnings, route_labels,
                        fuel_consumption_microliters, toll_info, optimized_intermediate_waypoint_index,
                        localized_values, request_departure_time, response_raw_json
                    ) VALUES (
                        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                    )
                """, (
                    row["polled_at"], row["origin_name"], row["origin_category"], row["destination_terminal"],
                    row["origin_latitude"], row["origin_longitude"], row["destination_latitude"], row["destination_longitude"],
                    row["duration_seconds"], row["duration_text"], row["duration_in_traffic_seconds"], row["duration_in_traffic_text"],
                    row["static_duration_seconds"], row["static_duration_text"], row["delay_seconds"], row["delay_ratio"],
                    row["distance_meters"], row["distance_text"], row["travel_advisory_speed_reading_intervals"],
                    row["route_polyline"], row["route_description"], row["route_token"], row["route_legs_count"],
                    json.dumps(row["route_leg_start_address"]) if row["route_leg_start_address"] else None,
                    json.dumps(row["route_leg_end_address"]) if row["route_leg_end_address"] else None,
                    row["route_leg_steps_count"],
                    row["route_leg_steps"], row["route_travel_advisory"],
                    row["route_viewport_low_lat"], row["route_viewport_low_lng"],
                    row["route_viewport_high_lat"], row["route_viewport_high_lng"],
                    row["geocoded_origin_place_id"], row["geocoded_origin_formatted_address"], row["geocoded_origin_types"],
                    row["geocoded_destination_place_id"], row["geocoded_destination_formatted_address"], row["geocoded_destination_types"],
                    row["traffic_condition"], row["traffic_speed_category"], row["route_warnings"], row["route_labels"],
                    row["fuel_consumption_microliters"], row["toll_info"], row["optimized_intermediate_waypoint_index"],
                    row["localized_values"], row["request_departure_time"], row["response_raw_json"],
                ))
                conn.commit()
    except Exception as e:
        logger.error(f"DB insert failed for {row.get('origin_name')} -> {row.get('destination_terminal')}: {e}")


def run():
    if not GOOGLE_MAPS_API_KEY:
        logger.error("GOOGLE_MAPS_API_KEY not set")
        return
    if not DATABASE_URL:
        logger.error("DATABASE_URL not set")
        return

    points = load_starting_points()
    logger.info(f"Loaded {len(points)} starting points")
    now = datetime.now(timezone.utc)
    departure_time_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    geocode_cache = {}
    total = 0
    errors = 0

    for point in points:
        name = point["name"]
        category = point["category"]

        if name not in geocode_cache:
            geo = geocode_place(name)
            geocode_cache[name] = geo
            time.sleep(0.05)
        else:
            geo = geocode_cache[name]

        if not geo:
            logger.warning(f"Skipping {name} - geocode failed")
            errors += 1
            continue

        for terminal_name, terminal_coords in TERMINAL_DESTINATIONS.items():
            route_departure = (datetime.now(timezone.utc) + timedelta(seconds=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
            route_response, raw_json = compute_route(
                geo["latitude"], geo["longitude"],
                terminal_coords["latitude"], terminal_coords["longitude"],
                route_departure,
            )

            if not route_response:
                logger.warning(f"Route API failed for {name} -> {terminal_name}")
                errors += 1
                continue

            extracted = extract_route_data(route_response, raw_json)
            if not extracted:
                logger.warning(f"No route data for {name} -> {terminal_name}")
                errors += 1
                continue

            row = {
                "polled_at": now,
                "origin_name": name,
                "origin_category": category,
                "destination_terminal": terminal_name,
                "origin_latitude": geo["latitude"],
                "origin_longitude": geo["longitude"],
                "destination_latitude": terminal_coords["latitude"],
                "destination_longitude": terminal_coords["longitude"],
                "request_departure_time": datetime.now(timezone.utc),
                **extracted,
            }

            store_row(row)
            total += 1
            time.sleep(0.05)

    logger.info(f"Done. Stored {total} travel time rows, {errors} errors")


if __name__ == "__main__":
    run()

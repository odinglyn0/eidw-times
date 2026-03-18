import argparse
import hashlib
import math
import os
import sys
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor
import pyarrow as pa
import pyarrow.parquet as pq


def parse_args():
    parser = argparse.ArgumentParser(
        description="Pull security_times + departure data to parquet files"
    )
    parser.add_argument(
        "--start",
        required=True,
        help="Range start, ISO format e.g. 2025-01-01T00:00:00",
    )
    parser.add_argument(
        "--end", required=True, help="Range end, ISO format e.g. 2025-02-01T00:00:00"
    )
    parser.add_argument(
        "--output-dir", default="./output", help="Directory for parquet output"
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Postgres connection string (fallback: DATABASE_URL env)",
    )
    parser.add_argument(
        "--date-blind",
        action="store_true",
        help="Strip date from timestamp, keep only hour:minute:second.millisecond",
    )
    parser.add_argument(
        "--batch-size", type=int, default=25000, help="Rows per parquet file"
    )
    return parser.parse_args()


def get_connection(database_url):
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        print(
            "ERROR: No database URL provided. Use --database-url or set DATABASE_URL env var.",
            file=sys.stderr,
        )
        sys.exit(1)
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def fetch_rows(conn, start, end):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, timestamp, t1, t2 FROM security_times WHERE timestamp >= %s AND timestamp < %s ORDER BY timestamp ASC",
            (start, end),
        )
        return cur.fetchall()


def fetch_departures(conn, start, end):
    padded_start = start - timedelta(hours=3)
    padded_end = end + timedelta(hours=3)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT internal_flight_id, scheduled_datetime, terminal_name, "
            "flight_identity, carrier_code, destination, status, is_delayed "
            "FROM departures "
            "WHERE scheduled_datetime >= %s AND scheduled_datetime < %s "
            "ORDER BY scheduled_datetime ASC",
            (padded_start, padded_end),
        )
        return cur.fetchall()


def build_security_table_normal(rows):
    ids = []
    timestamps = []
    t1s = []
    t2s = []
    for r in rows:
        ids.append(r["id"])
        timestamps.append(r["timestamp"])
        t1s.append(r["t1"])
        t2s.append(r["t2"])
    return pa.table(
        {
            "id": pa.array(ids, type=pa.int64()),
            "timestamp": pa.array(timestamps, type=pa.timestamp("ms", tz="UTC")),
            "t1": pa.array(t1s, type=pa.int32()),
            "t2": pa.array(t2s, type=pa.int32()),
        }
    )


def build_security_table_date_blind(rows):
    id_md5s = []
    hours = []
    minutes = []
    seconds = []
    milliseconds = []
    t1s = []
    t2s = []
    for r in rows:
        id_md5s.append(hashlib.md5(str(r["id"]).encode()).hexdigest())
        ts = r["timestamp"]
        hours.append(ts.hour)
        minutes.append(ts.minute)
        seconds.append(ts.second)
        milliseconds.append(ts.microsecond // 1000)
        t1s.append(r["t1"])
        t2s.append(r["t2"])
    return pa.table(
        {
            "id_md5": pa.array(id_md5s, type=pa.string()),
            "hour": pa.array(hours, type=pa.int8()),
            "minute": pa.array(minutes, type=pa.int8()),
            "second": pa.array(seconds, type=pa.int8()),
            "millisecond": pa.array(milliseconds, type=pa.int16()),
            "t1": pa.array(t1s, type=pa.int32()),
            "t2": pa.array(t2s, type=pa.int32()),
        }
    )


def build_departures_table_normal(departures):
    flight_ids = []
    timestamps = []
    terminals = []
    flights = []
    carriers = []
    destinations = []
    statuses = []
    delayed = []
    for d in departures:
        flight_ids.append(d["internal_flight_id"] or "")
        timestamps.append(d["scheduled_datetime"])
        terminals.append(d["terminal_name"] or "")
        flights.append(d["flight_identity"] or "")
        carriers.append(d["carrier_code"] or "")
        destinations.append(d["destination"] or "")
        statuses.append(d["status"] if d["status"] is not None else -1)
        delayed.append(d.get("is_delayed", False) or False)
    return pa.table(
        {
            "internal_flight_id": pa.array(flight_ids, type=pa.string()),
            "scheduled_datetime": pa.array(
                timestamps, type=pa.timestamp("ms", tz="UTC")
            ),
            "terminal_name": pa.array(terminals, type=pa.string()),
            "flight_identity": pa.array(flights, type=pa.string()),
            "carrier_code": pa.array(carriers, type=pa.string()),
            "destination": pa.array(destinations, type=pa.string()),
            "status": pa.array(statuses, type=pa.int32()),
            "is_delayed": pa.array(delayed, type=pa.bool_()),
        }
    )


def build_departures_table_date_blind(departures):
    id_md5s = []
    hours = []
    minutes = []
    terminals = []
    flights = []
    carriers = []
    destinations = []
    statuses = []
    delayed = []
    for d in departures:
        id_md5s.append(
            hashlib.md5(str(d["internal_flight_id"] or "").encode()).hexdigest()
        )
        ts = d["scheduled_datetime"]
        hours.append(ts.hour)
        minutes.append(ts.minute)
        terminals.append(d["terminal_name"] or "")
        flights.append(d["flight_identity"] or "")
        carriers.append(d["carrier_code"] or "")
        destinations.append(d["destination"] or "")
        statuses.append(d["status"] if d["status"] is not None else -1)
        delayed.append(d.get("is_delayed", False) or False)
    return pa.table(
        {
            "id_md5": pa.array(id_md5s, type=pa.string()),
            "hour": pa.array(hours, type=pa.int8()),
            "minute": pa.array(minutes, type=pa.int8()),
            "terminal_name": pa.array(terminals, type=pa.string()),
            "flight_identity": pa.array(flights, type=pa.string()),
            "carrier_code": pa.array(carriers, type=pa.string()),
            "destination": pa.array(destinations, type=pa.string()),
            "status": pa.array(statuses, type=pa.int32()),
            "is_delayed": pa.array(delayed, type=pa.bool_()),
        }
    )


def write_batches(table, output_dir, batch_size, prefix):
    os.makedirs(output_dir, exist_ok=True)
    total = table.num_rows
    num_batches = math.ceil(total / batch_size)
    for i in range(num_batches):
        start_idx = i * batch_size
        end_idx = min(start_idx + batch_size, total)
        batch = table.slice(start_idx, end_idx - start_idx)
        path = os.path.join(output_dir, f"{prefix}_{i:04d}.parquet")
        pq.write_table(batch, path)
        print(f"Wrote {batch.num_rows} rows -> {path}")


def main():
    args = parse_args()
    start_dt = datetime.fromisoformat(args.start)
    end_dt = datetime.fromisoformat(args.end)

    conn = get_connection(args.database_url)
    try:
        rows = fetch_rows(conn, start_dt, end_dt)
        departures = fetch_departures(conn, start_dt, end_dt)
    finally:
        conn.close()

    if not rows:
        print("No security rows found for the given range.")
        sys.exit(0)

    print(f"Fetched {len(rows)} security rows, {len(departures)} departure rows")

    if args.date_blind:
        sec_table = build_security_table_date_blind(rows)
        sec_prefix = "security_times_dateblind"
        dep_table = build_departures_table_date_blind(departures)
        dep_prefix = "departures_dateblind"
    else:
        sec_table = build_security_table_normal(rows)
        sec_prefix = "security_times"
        dep_table = build_departures_table_normal(departures)
        dep_prefix = "departures"

    write_batches(sec_table, args.output_dir, args.batch_size, sec_prefix)

    if departures:
        write_batches(dep_table, args.output_dir, args.batch_size, dep_prefix)
    else:
        print("No departure rows to write.")

    print("Done.")


if __name__ == "__main__":
    main()

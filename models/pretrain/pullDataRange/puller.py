import argparse
import hashlib
import math
import os
import sys
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor
import pyarrow as pa
import pyarrow.parquet as pq


def parse_args():
    parser = argparse.ArgumentParser(description="Pull security_times data to parquet files")
    parser.add_argument("--start", required=True, help="Range start, ISO format e.g. 2025-01-01T00:00:00")
    parser.add_argument("--end", required=True, help="Range end, ISO format e.g. 2025-02-01T00:00:00")
    parser.add_argument("--output-dir", default="./output", help="Directory for parquet output")
    parser.add_argument("--database-url", default=None, help="Postgres connection string (fallback: DATABASE_URL env)")
    parser.add_argument("--date-blind", action="store_true", help="Strip date from timestamp, keep only hour:minute:second.millisecond, use md5(id) as key")
    parser.add_argument("--batch-size", type=int, default=25000, help="Rows per parquet file")
    return parser.parse_args()


def get_connection(database_url):
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: No database URL provided. Use --database-url or set DATABASE_URL env var.", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def fetch_rows(conn, start, end):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, timestamp, t1, t2 FROM security_times WHERE timestamp >= %s AND timestamp < %s ORDER BY timestamp ASC",
            (start, end),
        )
        return cur.fetchall()


def build_table_normal(rows):
    ids = []
    timestamps = []
    t1s = []
    t2s = []
    for r in rows:
        ids.append(r["id"])
        timestamps.append(r["timestamp"])
        t1s.append(r["t1"])
        t2s.append(r["t2"])
    return pa.table({
        "id": pa.array(ids, type=pa.int64()),
        "timestamp": pa.array(timestamps, type=pa.timestamp("ms", tz="UTC")),
        "t1": pa.array(t1s, type=pa.int32()),
        "t2": pa.array(t2s, type=pa.int32()),
    })


def build_table_date_blind(rows):
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
    return pa.table({
        "id_md5": pa.array(id_md5s, type=pa.string()),
        "hour": pa.array(hours, type=pa.int8()),
        "minute": pa.array(minutes, type=pa.int8()),
        "second": pa.array(seconds, type=pa.int8()),
        "millisecond": pa.array(milliseconds, type=pa.int16()),
        "t1": pa.array(t1s, type=pa.int32()),
        "t2": pa.array(t2s, type=pa.int32()),
    })


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
    finally:
        conn.close()

    if not rows:
        print("No rows found for the given range.")
        sys.exit(0)

    print(f"Fetched {len(rows)} rows")

    if args.date_blind:
        table = build_table_date_blind(rows)
        prefix = "security_times_dateblind"
    else:
        table = build_table_normal(rows)
        prefix = "security_times"

    write_batches(table, args.output_dir, args.batch_size, prefix)
    print("Done.")


if __name__ == "__main__":
    main()

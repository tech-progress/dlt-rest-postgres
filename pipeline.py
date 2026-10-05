import argparse
import hashlib
import json
import os
import re
from urllib.parse import urlparse

import dlt
import psycopg2
from dlt.destinations import postgres
from dlt.sources.rest_api import rest_api_source


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"{name} must be configured")
    return value


def identity(name, default):
    value = os.environ.get(name, default)
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", value):
        raise ValueError(f"{name} must be a lowercase SQL-safe identifier")
    return value


def configuration():
    base_url = required("SOURCE_BASE_URL")
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("SOURCE_BASE_URL must be an HTTP(S) URL without embedded credentials")
    if parsed.scheme != "https" and os.environ.get("ALLOW_INSECURE_SOURCE", "false") != "true":
        raise ValueError("Use HTTPS; ALLOW_INSECURE_SOURCE=true is for the local fixture only")
    endpoint = os.environ.get("SOURCE_ENDPOINT", "orders")
    if endpoint.startswith(("/", "//")) or ":" in endpoint or ".." in endpoint:
        raise ValueError("SOURCE_ENDPOINT must be a relative path below SOURCE_BASE_URL")
    initial_cursor = int(os.environ.get("SOURCE_INITIAL_CURSOR", "0"))
    lookback = int(os.environ.get("SOURCE_LOOKBACK_SECONDS", "3600"))
    page_size = int(os.environ.get("SOURCE_PAGE_SIZE", "50"))
    if initial_cursor < 0 or lookback < 0 or not 1 <= page_size <= 1000:
        raise ValueError("Cursor/lookback must be nonnegative; page size must be 1..1000")
    source_config = {
        "client": {
            "base_url": base_url.rstrip("/") + "/",
            "auth": {"type": "bearer", "token": required("SOURCE_API_TOKEN")},
            "paginator": {"type": "page_number", "base_page": 1, "total_path": "total_pages"},
        },
        "resources": [{
            "name": "orders",
            "primary_key": "id",
            "write_disposition": "merge",
            "columns": {
                "id": {"data_type": "bigint", "nullable": False},
                "updated_at": {"data_type": "bigint", "nullable": False},
                "amount_cents": {"data_type": "bigint", "nullable": False},
            },
            "endpoint": {
                "path": endpoint,
                "data_selector": "data",
                "params": {"page_size": page_size},
                "incremental": {
                    "cursor_path": "updated_at",
                    "initial_value": initial_cursor,
                    "lag": lookback,
                    "start_param": "updated_since",
                },
            },
        }],
    }
    credentials = {
        "host": required("PGHOST"),
        "port": int(os.environ.get("PGPORT", "5432")),
        "database": required("PGDATABASE"),
        "username": required("PGUSER"),
        "password": required("PGPASSWORD"),
        "connect_timeout": 10,
    }
    return source_config, credentials


def run(stage="run"):
    source_config, credentials = configuration()
    pipeline_name = identity("PIPELINE_NAME", "rest_orders")
    dataset_name = identity("DATASET_NAME", "rest_warehouse")
    sslmode = os.environ.get("PGSSLMODE", "prefer")
    if sslmode not in ("prefer", "require", "verify-ca", "verify-full", "disable"):
        raise ValueError("Unsupported PGSSLMODE")
    os.environ["PGSSLMODE"] = sslmode
    lock_key = int.from_bytes(hashlib.sha256(f"{pipeline_name}:{dataset_name}".encode()).digest()[:8], "big", signed=True)
    with psycopg2.connect(
        host=credentials["host"], port=credentials["port"], dbname=credentials["database"],
        user=credentials["username"], password=credentials["password"], connect_timeout=10, sslmode=sslmode,
    ) as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (lock_key,))
            if not cursor.fetchone()[0]:
                raise RuntimeError("Another loader holds the pipeline/dataset advisory lock")
            pipeline = dlt.pipeline(
                pipeline_name=pipeline_name,
                dataset_name=dataset_name,
                destination=postgres(credentials=credentials),
                pipelines_dir=os.environ.get("PIPELINES_DIR", "/tmp/dlt-pipelines"),
                progress="log",
            )
            if stage == "load-pending":
                result = pipeline.load()
            else:
                pipeline.sync_destination()
                source = rest_api_source(source_config, name="orders_api")
                if stage == "extract-only":
                    pipeline.extract(source)
                    pipeline.normalize()
                    result = None
                else:
                    result = pipeline.run(source)
            if result:
                result.raise_on_failed_jobs()
            cursor.execute("SELECT pg_advisory_unlock(%s)", (lock_key,))
    print(json.dumps({"status": "ok", "stage": stage, "pipeline": pipeline_name, "dataset": dataset_name}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("run", "extract-only", "load-pending"), default="run")
    run(parser.parse_args().stage)

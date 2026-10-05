import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

import psycopg2


def request(path, method="GET", authenticated=True):
    headers = {"Authorization": "Bearer " + os.environ["SOURCE_API_TOKEN"]} if authenticated else {}
    with urllib.request.urlopen(urllib.request.Request(os.environ["SOURCE_BASE_URL"].rstrip("/") + path,
                                                      headers=headers, method=method), timeout=10) as response:
        return json.load(response)


def connection():
    return psycopg2.connect(host=os.environ["PGHOST"], dbname=os.environ["PGDATABASE"],
                            user=os.environ["PGUSER"], password=os.environ["PGPASSWORD"], connect_timeout=10)


def fresh_run(stage="run", directory=None):
    environment = dict(os.environ, PIPELINES_DIR=directory or tempfile.mkdtemp(prefix="dlt-smoke-"))
    subprocess.run(["python", "pipeline.py", "--stage", stage], env=environment, check=True, timeout=180)
    if directory is None:
        shutil.rmtree(environment["PIPELINES_DIR"])


def assert_rows(count, updated_amount):
    with connection() as database, database.cursor() as cursor:
        cursor.execute("SELECT count(*), count(DISTINCT id) FROM rest_warehouse.orders")
        assert cursor.fetchone() == (count, count), "Duplicate or missing rows"
        cursor.execute("SELECT amount_cents FROM rest_warehouse.orders WHERE id=1")
        assert cursor.fetchone()[0] == updated_amount, "Update not merged"
        cursor.execute("SELECT count(*) FROM rest_warehouse._dlt_pipeline_state")
        assert cursor.fetchone()[0] >= 1, "Destination state not persisted"


def main():
    with connection() as database, database.cursor() as cursor:
        cursor.execute("SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname=current_user")
        assert cursor.fetchone() == ('dlt_loader', False, False, False, False)
    for statement in ("CREATE TABLE public.forbidden_table (id integer)", "CREATE SCHEMA forbidden_schema", "CREATE ROLE forbidden_role"):
        with connection() as database, database.cursor() as cursor:
            try:
                cursor.execute(statement)
                raise AssertionError('Loader unexpectedly has administrative/out-of-schema privileges')
            except psycopg2.errors.InsufficientPrivilege:
                database.rollback()
    print('PASS: nonsuperuser, no role/database/replication privileges, public-schema and unrelated-schema writes denied')
    try:
        request("/orders", authenticated=False)
        raise AssertionError("Fixture accepted anonymous API access")
    except urllib.error.HTTPError as error:
        assert error.code == 401
    fresh_run()
    assert_rows(100, 100)
    pages = request("/stats")["requests"]
    assert {entry["page"] for entry in pages if entry["phase"] == 1} >= {1, 2}
    fresh_run()
    assert_rows(100, 100)
    request("/phase/2", method="POST")
    scratch = tempfile.mkdtemp(prefix="dlt-interrupt-")
    process = None
    blocker = connection()
    try:
        fresh_run("extract-only", scratch)
        with blocker.cursor() as cursor:
            cursor.execute("LOCK TABLE rest_warehouse.orders IN ACCESS EXCLUSIVE MODE")
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen(["python", "pipeline.py", "--stage", "load-pending"],
                                       env=dict(os.environ, PIPELINES_DIR=scratch), stdout=log, stderr=log)
            deadline = time.monotonic() + 60
            blocked = False
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    log.seek(0)
                    raise AssertionError("Load exited before interruption:\n" + log.read().decode())
                with connection() as database, database.cursor() as cursor:
                    cursor.execute("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid <> pg_backend_pid()")
                    blocked = cursor.fetchone()[0] > 0
                if blocked:
                    break
                time.sleep(0.25)
            assert blocked, "No actively blocked destination load within 60 seconds"
            process.kill()
            process.wait(timeout=10)
    finally:
        if process and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        blocker.rollback()
        blocker.close()
        shutil.rmtree(scratch)
    before_retry = len(request("/stats")["requests"])
    fresh_run()
    assert_rows(101, 99900)
    retried = request("/stats")["requests"][before_retry:]
    assert retried and retried[0]["since"] == 1727740800 - 3600, "An incomplete load advanced the restored destination cursor"
    fresh_run()
    assert_rows(101, 99900)
    restored = [entry["since"] for entry in request("/stats")["requests"] if entry["phase"] == 2]
    assert restored and all(value > 0 for value in restored), "Cursor not restored after scratch deletion"
    with connection() as database, database.cursor() as cursor:
        cursor.execute(Path("sql/reconciliation.sql").read_text())
        completed, newest = cursor.fetchone()
        assert completed >= 1 and newest is not None, "Reconciliation SQL did not identify completed loads"
    print("PASS: two pages; 100 rows; replay; interrupted SQL load; scratch deletion; restored cursor; 101 unique correct rows; reconciliation SQL")


if __name__ == "__main__":
    main()

#!/bin/sh
set -eu
: "${DLT_LOADER_PASSWORD:?Generate a separate ingestion role password}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set loader_password="$DLT_LOADER_PASSWORD" <<'SQL'
CREATE ROLE dlt_loader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'loader_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON DATABASE warehouse FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE warehouse TO dlt_loader;
CREATE SCHEMA rest_warehouse AUTHORIZATION dlt_loader;
CREATE SCHEMA rest_warehouse_staging AUTHORIZATION dlt_loader;
SQL

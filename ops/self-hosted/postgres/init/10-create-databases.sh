#!/bin/sh
# Creates the per-app databases inside the shared Postgres on first start.
# Runs once, when the data volume is empty.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    SELECT 'CREATE DATABASE docmost'   WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'docmost')\gexec
    SELECT 'CREATE DATABASE hoppscotch' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hoppscotch')\gexec
SQL

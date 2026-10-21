#!/bin/sh
# Applies db/migrations/*.sql in filename order, once each.
# Plain psql on purpose: no migration framework to explain.
set -eu

psql -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

for f in /migrations/*.sql; do
  name=$(basename "$f")
  applied=$(psql -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$name'")
  if [ "$applied" = "1" ]; then
    echo "skip  $name"
    continue
  fi
  echo "apply $name"
  # Each file and its bookkeeping row commit together.
  psql -v ON_ERROR_STOP=1 --single-transaction \
    -f "$f" \
    -c "INSERT INTO schema_migrations (filename) VALUES ('$name')"
done

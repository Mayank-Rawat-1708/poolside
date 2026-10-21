#!/usr/bin/env bash
# Snapshot of Postgres sessions for the app database, grouped by state.
# The tell for this incident: many 'idle in transaction' sessions whose
# last query finished long ago (fast SQL, transaction still open).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose exec -T postgres psql -U "${POSTGRES_USER:-poolside}" -d "${POSTGRES_DB:-poolside}" -P pager=off <<'SQL'
\echo '== sessions by state'
SELECT coalesce(state, 'unknown')                         AS state,
       count(*)                                           AS sessions,
       round(extract(epoch FROM max(now() - state_change))::numeric, 2) AS longest_in_state_s,
       round(extract(epoch FROM max(now() - xact_start))::numeric, 2)   AS oldest_xact_s
FROM pg_stat_activity
WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()
GROUP BY 1 ORDER BY 2 DESC;

\echo '== oldest open transactions (last statement each ran)'
SELECT pid, application_name, state,
       round(extract(epoch FROM now() - xact_start)::numeric, 2)   AS xact_age_s,
       round(extract(epoch FROM now() - state_change)::numeric, 2) AS in_state_s,
       left(regexp_replace(query, '\s+', ' ', 'g'), 60)             AS last_query
FROM pg_stat_activity
WHERE datname = current_database() AND xact_start IS NOT NULL AND pid <> pg_backend_pid()
ORDER BY xact_start LIMIT 10;
SQL

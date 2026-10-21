#!/usr/bin/env bash
# Runs every scenario against both strategies and saves raw outputs under
# docs/evidence/runs/<strategy>/, then takes screenshots during a separate
# spike per strategy. Takes ~13 minutes. Requires `make up`.
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${ADMIN_TOKEN:-local-dev-admin-token}"
AUTH=(-H "authorization: Bearer $TOKEN" -H "content-type: application/json")
OUT=docs/evidence/runs

strategy() { curl -sf -XPUT localhost:3000/admin/strategy "${AUTH[@]}" -d "{\"strategy\":\"$1\"}" >/dev/null; }
downstream() { curl -sf -XPUT localhost:4001/admin/latency "${AUTH[@]}" -d "$1" >/dev/null; }
k6() { # k6 <strategy> <script> ; k6 exits non-zero when thresholds fail, which is expected for hold
  docker compose run --rm -e RESULTS_DIR="/results/runs/$1" -e SUMMARY_NAME="$2" k6 run --quiet "/load/$2.js" \
    > "$OUT/$1/$2.stdout.txt" 2>&1 || true
}
# Captures DB, metrics and container state while the spike is at its peak.
# Text only: rendering browsers here would steal CPU from the API on a laptop
# and perturb the very run being measured.
snapshot() {
  local dir="$OUT/$1"
  sleep 30
  scripts/pg-activity.sh > "$dir/pg-activity-during-spike.txt" 2>&1 || true
  curl -s localhost:3000/admin/db-sessions "${AUTH[@]}" > "$dir/db-sessions-during-spike.json" || true
  node scripts/prom-snapshot.mjs > "$dir/prometheus-during-spike.txt" 2>&1 || true
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' > "$dir/docker-stats-during-spike.txt" || true
}

for s in hold release; do
  mkdir -p "$OUT/$s"
  echo "== $s"
  strategy "$s"
  downstream '{"latencyMs":50,"jitterMs":20,"errorRate":0}'
  # Warm up (JIT, pool connections) so the first scenario isn't penalised by a cold process.
  for _ in $(seq 1 30); do curl -s -o /dev/null -XPOST localhost:3000/orders -H 'content-type: application/json' -d '{"customerId":"warmup","amountCents":100}'; done
  sleep 5
  echo "   baseline";        k6 "$s" baseline
  downstream '{"latencyMs":1500,"jitterMs":500,"errorRate":0}'
  echo "   spike (slow provider)"
  snapshot "$s" &
  k6 "$s" spike
  wait
  downstream '{"latencyMs":50,"jitterMs":20,"errorRate":0}'
  sleep 20 # let rate() windows drain between scenarios
  echo "   slow-downstream"; k6 "$s" slow-downstream
  sleep 20
done

# Screenshots come from a separate, unmeasured spike per strategy (see snapshot()).
for s in hold release; do
  echo "== screenshots ($s)"
  strategy "$s"
  downstream '{"latencyMs":1500,"jitterMs":500,"errorRate":0}'
  docker compose run --rm -e RESULTS_DIR=/results/tmp k6 run --quiet /load/spike.js > /dev/null 2>&1 &
  sleep 35
  node scripts/screenshots.mjs docs/evidence/screenshots "$s-spike-" > /dev/null 2>&1 || true
  wait
  downstream '{"latencyMs":50,"jitterMs":20,"errorRate":0}'
  sleep 20
done

strategy hold
downstream '{"latencyMs":50,"jitterMs":20,"errorRate":0}'
node scripts/before-after.mjs "$OUT" > docs/evidence/before-after.md
cat docs/evidence/before-after.md

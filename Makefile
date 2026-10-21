# PoolSide demo targets. Run `make help` for a list.
SHELL := /bin/bash
.DEFAULT_GOAL := help

# Load .env (created from .env.example on first `make up`) so targets see ADMIN_TOKEN etc.
-include .env
export

ADMIN_TOKEN ?= local-dev-admin-token
DOWNSTREAM  ?= http://localhost:4001
API         ?= http://localhost:3000
AUTH        := -H "authorization: Bearer $(ADMIN_TOKEN)" -H "content-type: application/json"

# Latency used by `make break`: slow enough to pin a 10-connection pool under modest load.
BREAK_LATENCY_MS ?= 1500
BREAK_JITTER_MS  ?= 500

.PHONY: help up down logs ps break hold strategy reset psql check pg-activity load-baseline load-spike load-slow

help: ## Show targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.env:
	cp .env.example .env

up: .env ## Build and start the whole stack
	docker compose up --build -d
	@echo "API         $(API)"
	@echo "Grafana     http://localhost:3001"
	@echo "Prometheus  http://localhost:9090"
	@echo "Jaeger      http://localhost:16686"

down: ## Stop the stack and delete volumes
	docker compose down -v --remove-orphans

logs: ## Tail api + downstream logs
	docker compose logs -f api downstream

ps: ## Show container status
	docker compose ps

break: ## Make the payments provider slow (1.5s ± 0.5s)
	@curl -sf -XPUT $(DOWNSTREAM)/admin/latency $(AUTH) \
	  -d '{"latencyMs":$(BREAK_LATENCY_MS),"jitterMs":$(BREAK_JITTER_MS)}' && echo

hold: ## Switch POST /orders to TX_STRATEGY=hold (the original flow)
	@curl -sf -XPUT $(API)/admin/strategy $(AUTH) -d '{"strategy":"hold"}' && echo

strategy: ## Show the active TX strategy
	@curl -sf $(API)/admin/strategy $(AUTH) && echo

reset: ## Restore normal downstream behaviour
	@curl -sf -XPUT $(DOWNSTREAM)/admin/latency $(AUTH) \
	  -d '{"latencyMs":50,"jitterMs":20,"errorRate":0}' && echo

pg-activity: ## Snapshot pg_stat_activity grouped by state
	@scripts/pg-activity.sh

psql: ## Open psql against the compose database
	docker compose exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

K6 := mkdir -p docs/evidence/tmp && docker compose run --rm k6 run --quiet

load-baseline: ## k6: light steady load (5 rps, 30s)
	$(K6) /load/baseline.js

load-spike: ## k6: burst 10 -> 40 rps
	$(K6) /load/spike.js

load-slow: ## k6: 15 rps while the provider is slow (sets latency itself)
	$(K6) /load/slow-downstream.js

check: ## Lint, typecheck and unit tests
	npm run check

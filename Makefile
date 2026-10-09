# Roboverse X — organiser shortcuts. Targets for later phases are included now so the interface is stable.
SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: up public down logs ps build-runner build-lab test backup reset-event dev-data

up: build-runner
	$(COMPOSE) up -d --build

public: build-runner
	$(COMPOSE) --profile public up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

build-runner:
	$(COMPOSE) --profile build-only build runner-image

build-lab:
	$(COMPOSE) --profile build-only build lab-image

dev-data:
	$(COMPOSE) up -d db redis

test:
	python -m pytest -q packages/rvx-sim
	@if [ -d apps/api/tests ]; then cd apps/api && python -m pytest -q; fi
	cd apps/web && npm test --if-present

backup:
	@mkdir -p backups
	$(COMPOSE) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" "$$POSTGRES_DB"' | gzip > backups/rvx-$$(date +%Y%m%d-%H%M%S).sql.gz
	@ls -lh backups | tail -1

reset-event:
	@read -p "Type RESET to truncate submissions, progress and audit log (teams and tasks are kept): " c; \
	if [ "$$c" = "RESET" ]; then \
	  $(COMPOSE) exec -T db sh -c 'psql -U "$$POSTGRES_USER" "$$POSTGRES_DB" -c "truncate submissions, task_progress, audit_log restart identity cascade"'; \
	else echo "Aborted."; fi

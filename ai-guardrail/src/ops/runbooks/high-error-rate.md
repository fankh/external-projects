# High Error Rate Runbook
## When: Prometheus alert `ServiceDown` or error rate spike
1. Check Grafana service-health dashboard: `:3001/d/kyra-service-health`
2. Identify which service: look at HTTP 5xx rate panel
3. Check logs: `docker logs --since 10m kyra-<service> 2>&1 | grep -i error | tail -20`
4. Common causes:
   - DB connection exhausted: restart service (`docker compose restart <service>`)
   - OOM: check `docker stats` → increase memory limit in compose
   - Dependency down: check downstream service health
5. If persistent: check Postgres connections `SELECT count(*) FROM pg_stat_activity;`

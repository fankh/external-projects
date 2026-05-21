# Service Restart Runbook
## When: a service container is down or unhealthy
1. Check status: `docker compose ps | grep <service>`
2. View logs: `docker logs --tail 50 kyra-<service>`
3. Restart: `docker compose restart <service>`
4. Verify: wait 60s (90s for gateway with OTel agent), then `docker compose ps`
5. If still unhealthy: `docker compose up -d --force-recreate <service>`
6. If build needed: `docker compose build <service> && docker compose up -d <service>`

# KYRA AI Guardrail - Quick Start

## Access

| What | URL | Credentials |
|---|---|---|
| App | https://kyra-guardrail-dev.seekerslab.com/ | admin@seekerslab.com / xmUoX0OA5XvSH4csBJbw |
| Grafana | http://127.0.0.1:3001 (SSH tunnel) | admin / (see .env GRAFANA_PASSWORD) |
| Prometheus | http://127.0.0.1:9090 (SSH tunnel) | - |

## Common commands

```bash
ssh -p 5022 khchoi@172.16.200.201
cd ~/kyra
docker compose ps                          # all containers
docker logs --tail 50 kyra-<service>       # view logs
docker compose restart <service>           # restart
docker compose build <svc> && docker compose up -d <svc>  # rebuild
docker exec kyra-backup /ops/backup.sh     # manual backup
bash ops/restore.sh /data/backups/postgres/daily/YYYY-MM-DD.sql.gz  # restore
```

## Activate AI

```bash
bash ops/activate/set-llm-keys.sh sk-your-openai-key
bash ops/activate/set-slack-webhook.sh https://hooks.slack.com/services/...
bash ops/activate/set-cohere-key.sh your-cohere-key
bash ops/activate/set-pagerduty-key.sh your-pd-service-key
```

## Credentials (save securely)

```
POSTGRES_PASSWORD=47a3d22a9a8a1b25024f93156b040b15
REDIS_PASSWORD=cc69056cf39b30746f99e9dfb9eabe61
JWT_SECRET=9fd09718340b6dc8ace93dfa120bf2602fa9ae7eaf2fd1d4622a97f5f8d6387c
MINIO_ACCESS_KEY=eHdqQ4yBpLjKPX0sop55
MINIO_SECRET_KEY=7EyECyNbC18v4TmccBiWJamOsvx2EC08ro00vGZm
GRAFANA_PASSWORD=tsSAdvIFp0UombR@
```

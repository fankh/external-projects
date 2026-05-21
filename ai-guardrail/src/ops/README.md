# KYRA Backup / Restore Runbook

## What gets backed up

| Asset | Method | Retention |
|---|---|---|
| Postgres (kyra DB) | `pg_dump` | 7 daily, 4 weekly, 3 monthly |
| MinIO `kyra-documents` bucket | `mc mirror` | 7 daily |
| Redis | (not backed up — session-only, rebuildable) | — |
| Milvus vectors | (not backed up in this pass — use `milvus backup` tool in a follow-up) | — |

## Where it lives

Host path: `/data/backups/` (bind-mounted into `kyra-backup` container at `/backups`)

```
/data/backups/
├── backup.log
├── postgres/
│   ├── daily/YYYY-MM-DD.sql.gz
│   ├── weekly/YYYY-WW.sql.gz        # Sunday only
│   └── monthly/YYYY-MM.sql.gz       # 1st of month only
└── minio/
    └── YYYY-MM-DD/                  # directory mirror
```

## Schedule

Daily at **03:00 UTC**, via `crond` inside the `kyra-backup` container.

- Retention sweep: files older than their tier threshold (`find -mtime +N -delete`)
- Log: `/data/backups/backup.log` (follow with `docker logs -f kyra-backup`)

## Run a backup on-demand

```bash
docker exec kyra-backup /ops/backup.sh
```

## Restore

**⚠ This overwrites the live DB.** Best during a maintenance window.

```bash
cd ~/kyra
bash ops/restore.sh /data/backups/postgres/daily/2026-04-15.sql.gz
```

The script:
1. Prompts for confirmation (`YES`)
2. Stops all app services (keeps infra containers up)
3. Streams the gzipped dump into `kyra-postgres` via `psql`
4. Restarts the app tier

## Verify a backup file

```bash
# Integrity
gunzip -t /data/backups/postgres/daily/2026-04-15.sql.gz

# Peek
zcat /data/backups/postgres/daily/2026-04-15.sql.gz | head -50

# Row-count sanity
zcat /data/backups/postgres/daily/2026-04-15.sql.gz | grep -c "^INSERT"
```

## Disaster recovery — RTO / RPO

- **RPO** (max data loss): 24h (next backup cycle) — tighten by lowering cron to hourly.
- **RTO** (time to restore):
  - Small DB (<100MB): ~2 min restore + ~2 min service restart → **~5 min total**
  - Large DB (10GB+): depends on disk I/O; typically 5–15 min + service restart
- Off-site: **NOT** automated in this pass. To ship backups off-host, add an `aws s3 cp` or `rclone` step to `backup.sh` and set appropriate credentials in the backup container env.

## Scale-up when ready

- Postgres PITR via `wal-g` or `pgbackrest` for sub-hour RPO
- Point `backup.sh` `aws s3 cp` call to an off-region bucket
- Add encryption at rest: `gpg --encrypt` in the pipeline before upload
- Milvus snapshots via `milvus-backup` CLI in a parallel scheduler

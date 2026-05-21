# Backup & Restore Runbook
## Daily backup: runs automatically at 03:00 UTC
## Manual backup:
```bash
docker exec kyra-backup /ops/backup.sh
```
## Restore:
```bash
cd ~/kyra && bash ops/restore.sh /data/backups/postgres/daily/YYYY-MM-DD.sql.gz
```
## Verify backup integrity:
```bash
gunzip -t /data/backups/postgres/daily/YYYY-MM-DD.sql.gz
```
## Off-site: set AWS_BACKUP_BUCKET in .env, backups auto-push to S3

#!/bin/bash
set -euo pipefail

# KYRA Admin Console - Database Backup Script
# Performs automated PostgreSQL backups with compression and retention

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DOCKER_COMPOSE_FILE="${DOCKER_COMPOSE_FILE:-docker-compose.production.yml}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="$BACKUP_DIR/backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗ $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

# Check if Docker Compose is running
check_docker_compose() {
    if ! docker-compose -f "$DOCKER_COMPOSE_FILE" ps postgres | grep -q "Up"; then
        error "PostgreSQL container is not running"
    fi
    log "PostgreSQL container is running"
}

# Get database credentials from environment
get_db_credentials() {
    DB_USER=$(grep "DB_USER=" "$ENV_FILE" | cut -d'=' -f2)
    DB_NAME=$(grep "DB_NAME=" "$ENV_FILE" | cut -d'=' -f2)

    if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
        error "Could not read database credentials from environment"
    fi

    log "Database credentials loaded: user=$DB_USER, database=$DB_NAME"
}

# Perform database backup
perform_backup() {
    log "Starting database backup..."
    log "Backup file: $BACKUP_FILE"

    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec postgres pg_dump \
        -U "$DB_USER" "$DB_NAME" 2>> "$LOG_FILE" | gzip > "$BACKUP_FILE"; then
        success "Database backup completed"

        # Display backup size
        local size=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup size: $size"
    else
        error "Database backup failed"
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."

    if gzip -t "$BACKUP_FILE" 2>> "$LOG_FILE"; then
        success "Backup integrity verified"
    else
        error "Backup integrity check failed"
    fi
}

# Clean up old backups based on retention policy
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    local deleted=0
    while IFS= read -r backup_file; do
        if [ -n "$backup_file" ]; then
            rm -f "$backup_file"
            log "Deleted: $(basename "$backup_file")"
            ((deleted++))
        fi
    done < <(find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS)

    if [ $deleted -gt 0 ]; then
        log "Deleted $deleted old backup(s)"
    else
        log "No old backups to delete"
    fi
}

# Generate backup summary
generate_summary() {
    log ""
    log "========================================="
    log "Backup Summary"
    log "========================================="

    local total_backups=$(find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -type f | wc -l)
    local total_size=$(du -sh "$BACKUP_DIR" | cut -f1)

    log "Total backups: $total_backups"
    log "Total size: $total_size"
    log "Latest backup: $(basename "$BACKUP_FILE")"
    log "Backup date: $TIMESTAMP"
    log ""
}

# Test restore (optional, for verification)
test_restore() {
    if [ "${TEST_RESTORE:-false}" != "true" ]; then
        return
    fi

    log "Testing restore functionality..."
    log "Note: This will not modify production data"

    # This is a dry-run test - just verify the backup can be read
    if gzip -cd "$BACKUP_FILE" | head -100 | grep -q "PostgreSQL"; then
        success "Restore test successful - backup appears valid"
    else
        error "Restore test failed - backup may be corrupted"
    fi
}

# Send notification (optional)
send_notification() {
    if [ -z "${BACKUP_NOTIFY_EMAIL:-}" ]; then
        return
    fi

    local status="SUCCESS"
    if [ $? -ne 0 ]; then
        status="FAILED"
    fi

    log "Sending notification to $BACKUP_NOTIFY_EMAIL..."

    # Example using mail command (requires mailutils)
    if command -v mail &> /dev/null; then
        mail -s "KYRA Backup $status - $TIMESTAMP" "$BACKUP_NOTIFY_EMAIL" << EOF
Backup $status

Timestamp: $TIMESTAMP
Backup file: $(basename "$BACKUP_FILE")
Backup size: $(du -h "$BACKUP_FILE" | cut -f1)
Location: $BACKUP_FILE

For more details, check: $LOG_FILE
EOF
        success "Notification sent"
    fi
}

# Main execution
main() {
    log "========================================="
    log "Database Backup Started"
    log "========================================="

    # Load environment
    if [ -f ".env.production" ]; then
        export $(grep -v '^#' ".env.production" | xargs)
        ENV_FILE=".env.production"
    elif [ -f ".env" ]; then
        export $(grep -v '^#' ".env" | xargs)
        ENV_FILE=".env"
    else
        error "No .env file found"
    fi

    check_docker_compose
    get_db_credentials
    perform_backup
    verify_backup
    cleanup_old_backups
    test_restore
    generate_summary
    send_notification

    success "Backup completed successfully"
}

# Handle errors
trap 'error "Backup failed with exit code $?"' EXIT

main

# Reset trap
trap - EXIT

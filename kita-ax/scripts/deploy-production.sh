#!/bin/bash
set -euo pipefail

# KYRA Admin Console - Production Deployment Script
# This script automates the deployment process with safety checks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"
LOG_FILE="deployment.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗ $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}" | tee -a "$LOG_FILE"
}

# Pre-deployment checks
preflight_checks() {
    log "Running preflight checks..."

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi
    success "Docker is installed"

    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi
    success "Docker Compose is installed"

    # Check if .env.production exists
    if [ ! -f "$ENV_FILE" ]; then
        error ".env.production file not found. Copy from .env.example and configure."
    fi
    success ".env.production exists"

    # Check if SSL certificates exist
    if [ ! -f "nginx/ssl/cert.pem" ] || [ ! -f "nginx/ssl/key.pem" ]; then
        warning "SSL certificates not found in nginx/ssl/. HTTPS will not work."
    else
        success "SSL certificates found"
    fi

    # Check if docker-compose file exists
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        error "$DOCKER_COMPOSE_FILE not found"
    fi
    success "Docker Compose file found"

    # Check disk space (minimum 5GB)
    available_space=$(df . | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 5242880 ]; then
        warning "Low disk space: less than 5GB available"
    else
        success "Sufficient disk space available"
    fi
}

# Backup current state
backup_state() {
    log "Creating deployment backup..."
    backup_dir="backups/deployment_$TIMESTAMP"
    mkdir -p "$backup_dir"

    # Save docker state
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps > "$backup_dir/docker_state.txt" 2>&1 || true

    # Save current images
    docker images | grep kyra > "$backup_dir/images.txt" 2>&1 || true

    success "Deployment backup created at $backup_dir"
}

# Build Docker image
build_image() {
    log "Building Docker image..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache || error "Docker build failed"
    success "Docker image built successfully"
}

# Pull base images
pull_images() {
    log "Pulling latest base images..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" pull || error "Docker pull failed"
    success "Base images pulled successfully"
}

# Stop running services
stop_services() {
    log "Stopping services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down || warning "Could not stop services"
    sleep 5
    success "Services stopped"
}

# Start services
start_services() {
    log "Starting services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d || error "Failed to start services"
    success "Services started"
}

# Wait for services to be healthy
wait_for_health() {
    log "Waiting for services to become healthy..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T app curl -f http://localhost:3000/health &> /dev/null; then
            success "Application health check passed"
            return 0
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    error "Services failed to become healthy within timeout"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T app npm run db:sync || error "Database migration failed"
    success "Database migrations completed"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."

    # Check container status
    local containers=$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q | wc -l)
    if [ "$containers" -lt 3 ]; then
        error "Not all containers are running"
    fi
    success "All containers are running"

    # Check application health
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T app curl -f http://localhost:3000/health &> /dev/null; then
        success "Application is healthy"
    else
        error "Application health check failed"
    fi

    # Check database connectivity
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T app node -e "require('./src/config/database').sequelize.authenticate()" &> /dev/null; then
        success "Database connectivity verified"
    else
        error "Database connection failed"
    fi
}

# Display logs
show_logs() {
    log "Recent deployment logs:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" logs --tail=20
}

# Rollback on error
rollback() {
    error "Deployment failed. Rolling back..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    git reset --hard HEAD
    docker-compose -f "$DOCKER_COMPOSE_FILE" build
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    warning "Rollback completed. Please review and investigate the error."
    exit 1
}

# Main deployment workflow
main() {
    log "========================================="
    log "KYRA Admin Console - Production Deployment"
    log "========================================="
    log "Timestamp: $TIMESTAMP"
    log "Environment: $ENV_FILE"

    # Trap errors and run rollback
    trap rollback ERR

    # Run deployment steps
    preflight_checks
    backup_state
    pull_images
    build_image
    stop_services
    start_services
    wait_for_health
    run_migrations
    verify_deployment
    show_logs

    log ""
    log "========================================="
    success "Deployment completed successfully!"
    log "========================================="
    log ""
    log "Next steps:"
    log "1. Verify application at https://your-domain.com"
    log "2. Review logs: docker-compose -f $DOCKER_COMPOSE_FILE logs"
    log "3. Monitor performance: docker stats"
    log ""
}

# Check for dry-run flag
if [ "${1:-}" == "--dry-run" ]; then
    log "Running in dry-run mode (no changes will be made)"
    preflight_checks
    exit 0
fi

# Run main deployment
main "$@"

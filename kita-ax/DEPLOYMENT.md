# KYRA Admin Console - Production Deployment Guide

## Overview

This document provides comprehensive instructions for deploying KYRA Admin Console to production environments. The deployment uses Docker, Docker Compose, and Nginx with SSL/TLS encryption.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 1.29+
- Linux server (Ubuntu 20.04+ recommended)
- Domain name with DNS management
- SSL/TLS certificate (Let's Encrypt recommended)
- PostgreSQL 13+ (managed separately or use RDS)
- Redis 6+ (managed separately or containerized)

## Security Considerations

### Before Deployment

1. **Generate Secure Secrets**
   ```bash
   # Generate strong random secrets
   openssl rand -base64 32  # SESSION_SECRET
   openssl rand -base64 32  # JWT_SECRET
   openssl rand -base64 32  # CSRF_SECRET
   openssl rand -base64 32  # REDIS_PASSWORD
   openssl rand -base64 32  # DB_PASSWORD
   ```

2. **SSL/TLS Certificate Setup**
   - Use Let's Encrypt for free certificates
   - Place certificates in `nginx/ssl/`
   - Required files: `cert.pem`, `key.pem`, `chain.pem`

3. **Environment Variables**
   - Never commit `.env.production` to git
   - Use secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Rotate secrets regularly

### Network Security

1. **Firewall Rules**
   ```
   - Allow: 80 (HTTP - for Let's Encrypt renewal)
   - Allow: 443 (HTTPS - production traffic)
   - Deny: All other ports
   - Internal: PostgreSQL (5432), Redis (6379) on private network
   ```

2. **Database Security**
   - Use SSL/TLS for database connections
   - Restrict database access to app servers only
   - Enable strong password authentication
   - Regular backups with encryption

3. **Redis Security**
   - Enable authentication with strong password
   - Use TLS for Redis connections
   - Restrict network access to app servers only

## Deployment Steps

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Create application directory
sudo mkdir -p /opt/kyra-admin
cd /opt/kyra-admin
```

### 2. Configure Environment

```bash
# Copy production environment template
cp .env.production .env

# Edit configuration with your values
nano .env

# Required changes:
# - HOSTNAME: Your domain name
# - DB_* : Database credentials
# - REDIS_PASSWORD: Strong random password
# - SESSION_SECRET, JWT_SECRET, CSRF_SECRET: Generated secrets
# - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: OAuth credentials
# - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET: OAuth credentials
```

### 3. SSL/TLS Certificate Setup

#### Using Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot certonly --standalone -d kyra-admin.example.com -d api.kyra-admin.example.com

# Copy certificates to nginx/ssl
sudo cp /etc/letsencrypt/live/kyra-admin.example.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/kyra-admin.example.com/privkey.pem nginx/ssl/key.pem
sudo cp /etc/letsencrypt/live/kyra-admin.example.com/chain.pem nginx/ssl/chain.pem

# Set proper permissions
sudo chown -R $USER:$USER nginx/ssl/
chmod 600 nginx/ssl/key.pem
chmod 644 nginx/ssl/cert.pem
```

#### Auto-renewal Setup

```bash
# Create renewal script
sudo tee /etc/cron.weekly/certbot-renew << EOF
#!/bin/bash
certbot renew --quiet
cp /etc/letsencrypt/live/kyra-admin.example.com/fullchain.pem /opt/kyra-admin/nginx/ssl/cert.pem
cp /etc/letsencrypt/live/kyra-admin.example.com/privkey.pem /opt/kyra-admin/nginx/ssl/key.pem
docker-compose -f docker-compose.production.yml exec -T nginx nginx -s reload
EOF

sudo chmod +x /etc/cron.weekly/certbot-renew
```

### 4. Database Setup

#### Using Managed PostgreSQL (AWS RDS, Google Cloud SQL, etc.)

```bash
# Update .env with database connection details
DB_HOST=your-database.rds.amazonaws.com
DB_PORT=5432
DB_NAME=kyra_admin
DB_USER=kyra_admin
DB_PASSWORD=your-secure-password
DB_SSL=true
```

#### Using Docker PostgreSQL

PostgreSQL is included in `docker-compose.production.yml`

### 5. Deploy Application

```bash
# Build Docker image
docker-compose -f docker-compose.production.yml build

# Pull latest images
docker-compose -f docker-compose.production.yml pull

# Start services
docker-compose -f docker-compose.production.yml up -d

# Verify all services are running
docker-compose -f docker-compose.production.yml ps

# Check health
curl https://kyra-admin.example.com/health
```

### 6. Initialize Database

```bash
# Run database migrations
docker-compose -f docker-compose.production.yml exec app npm run db:sync

# Seed initial data (optional)
docker-compose -f docker-compose.production.yml exec app npm run db:seed
```

## Monitoring & Logging

### Logs

```bash
# Application logs
docker-compose -f docker-compose.production.yml logs -f app

# Nginx logs
docker-compose -f docker-compose.production.yml logs -f nginx

# Database logs
docker-compose -f docker-compose.production.yml logs -f postgres

# All logs
docker-compose -f docker-compose.production.yml logs -f
```

### Health Checks

```bash
# Application health
curl https://kyra-admin.example.com/health

# Container health
docker-compose -f docker-compose.production.yml ps

# Check specific service
docker inspect kyra-admin-prod | grep -A 20 '"Health"'
```

### Metrics (if enabled)

```bash
# Access metrics on port 9090
curl http://localhost:9090/metrics
```

## Backup & Disaster Recovery

### Database Backup

```bash
# Manual backup
docker-compose -f docker-compose.production.yml exec postgres pg_dump -U kyra_admin kyra_admin > backup.sql

# Automated daily backup (cron)
0 2 * * * docker-compose -f /opt/kyra-admin/docker-compose.production.yml exec postgres pg_dump -U kyra_admin kyra_admin | gzip > /opt/kyra-admin/backups/db_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz
```

### Backup Retention

```bash
# Keep last 30 days of backups
find /opt/kyra-admin/backups -name "db_*.sql.gz" -mtime +30 -delete
```

### Database Restore

```bash
# Restore from backup
docker-compose -f docker-compose.production.yml exec -T postgres psql -U kyra_admin kyra_admin < backup.sql
```

## Scaling

### Horizontal Scaling

Update `docker-compose.production.yml`:

```yaml
services:
  app:
    deploy:
      replicas: 3  # Scale to 3 instances
```

Then:

```bash
docker-compose -f docker-compose.production.yml up -d
```

### Load Balancing

Nginx handles load balancing across multiple app instances automatically via the upstream configuration.

## Updates & Upgrades

### Application Update

```bash
# Pull latest code
git pull origin main

# Build new image
docker-compose -f docker-compose.production.yml build --no-cache

# Rolling update (no downtime)
docker-compose -f docker-compose.production.yml up -d
```

### Dependency Updates

```bash
# Update base images
docker-compose -f docker-compose.production.yml pull

# Rebuild with latest dependencies
docker-compose -f docker-compose.production.yml build --no-cache

# Redeploy
docker-compose -f docker-compose.production.yml up -d
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.production.yml logs app

# Common issues:
# - Environment variables not set
# - Database connection failed
# - Port already in use
```

### Database Connection Issues

```bash
# Test database connection
docker-compose -f docker-compose.production.yml exec app node -e "
  const db = require('./src/config/database');
  db.sequelize.authenticate().then(() => {
    console.log('Database connection OK');
    process.exit(0);
  }).catch(e => {
    console.error('Database error:', e.message);
    process.exit(1);
  });
"
```

### SSL/TLS Issues

```bash
# Check certificate validity
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Check expiration
openssl x509 -enddate -noout -in nginx/ssl/cert.pem
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Monitor application performance
docker-compose -f docker-compose.production.yml exec app node -e "
  const os = require('os');
  console.log('Memory:', os.freemem() / 1024 / 1024, 'MB free');
  console.log('CPU:', os.cpus()[0].model);
"
```

## Rollback Procedure

```bash
# If deployment fails, rollback to previous version
docker-compose -f docker-compose.production.yml down
git reset --hard HEAD~1
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d
```

## Maintenance

### Regular Tasks

- **Weekly**: Review logs, check disk usage
- **Monthly**: Update dependencies, review security logs
- **Quarterly**: Security audit, penetration testing
- **Annually**: Major version upgrades, disaster recovery drill

### Downtime Maintenance

```bash
# For maintenance requiring downtime:
docker-compose -f docker-compose.production.yml down
# ... perform maintenance ...
docker-compose -f docker-compose.production.yml up -d
```

## Support & Documentation

- Issues: [GitHub Issues](https://github.com/yourusername/kyra-admin-console/issues)
- Documentation: See [README.md](README.md)
- API Docs: Available at `https://kyra-admin.example.com/api/docs`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-29 | Initial production deployment guide |

---

**Last Updated**: May 29, 2026
**Maintained By**: SeekersLab
**License**: MIT

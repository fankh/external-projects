# KYRA Admin Console - Production Deployment Guide

Welcome to the KYRA Admin Console production deployment documentation. This guide covers all aspects of deploying and maintaining the application in a production environment.

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.production .env
nano .env  # Edit with your values

# 2. Ensure SSL certificates are in place
ls -la nginx/ssl/cert.pem nginx/ssl/key.pem

# 3. Deploy
./scripts/deploy-production.sh

# 4. Verify
curl https://your-domain.com/health
```

## Documentation

### Deployment
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment instructions
  - Prerequisites
  - Security setup
  - Step-by-step deployment
  - SSL/TLS configuration
  - Database setup
  - Monitoring and logging
  - Backup and recovery
  - Scaling
  - Troubleshooting

### Checklists
- **[PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)** - Pre and post-deployment checklist
  - Pre-deployment tasks
  - Day-before checklist
  - Deployment day checklist
  - Post-deployment verification
  - Success criteria
  - Rollback procedure

### Configuration Files
- **`.env.production`** - Production environment variables
  - Never commit to git
  - Store securely (AWS Secrets Manager, HashiCorp Vault, etc.)
  
- **`docker-compose.production.yml`** - Production Docker Compose configuration
  - Database with resource limits
  - Redis with persistence
  - Node.js app with replicas
  - Nginx reverse proxy
  
- **`nginx/nginx.production.conf`** - Production-grade Nginx configuration
  - SSL/TLS setup
  - Security headers
  - Rate limiting
  - Caching
  - Load balancing
  - Logging

### Deployment Scripts
- **`scripts/deploy-production.sh`** - Automated deployment
  ```bash
  ./scripts/deploy-production.sh --dry-run  # Test deployment
  ./scripts/deploy-production.sh            # Actual deployment
  ```
  
- **`scripts/backup-database.sh`** - Automated database backups
  ```bash
  ./scripts/backup-database.sh              # Create backup
  # Schedule with cron:
  # 0 2 * * * /opt/kyra-admin/scripts/backup-database.sh
  ```

## Key Features

### Security
- **HTTPS/TLS** - Modern SSL/TLS configuration
- **Security Headers** - HSTS, CSP, X-Frame-Options, etc.
- **Rate Limiting** - Protects against abuse
- **CORS** - Configured for production
- **CSRF Protection** - Token-based validation
- **Database SSL** - Encrypted connections
- **Non-root User** - Runs as nodejs user for security

### Reliability
- **Health Checks** - Automated health monitoring
- **Automatic Restart** - Failed containers restart automatically
- **Database Backups** - Automated daily backups
- **Failover Support** - Multi-replica setup
- **Graceful Shutdown** - Clean service termination
- **Load Balancing** - Nginx upstream with multiple replicas

### Performance
- **Gzip Compression** - Reduces response size
- **HTTP/2** - Faster protocol
- **Caching** - Static asset and response caching
- **Connection Pooling** - Optimized database connections
- **Resource Limits** - Controlled container resources
- **Multi-process** - Worker pool optimization

### Monitoring
- **Structured Logging** - JSON logs for easy parsing
- **Access Logs** - Detailed request logging
- **Error Logs** - Comprehensive error tracking
- **Health Endpoints** - Monitoring-friendly
- **Docker Stats** - Container resource monitoring
- **Custom Metrics** - Application metrics (if enabled)

## Environment Variables

### Essential
```
NODE_ENV=production
HOSTNAME=your-domain.com
PORT=3000
```

### Database
```
DB_HOST=postgres-prod.internal
DB_PORT=5432
DB_NAME=kyra_admin
DB_USER=kyra_admin
DB_PASSWORD=<secure-password>
DB_SSL=true
```

### Cache
```
REDIS_HOST=redis-prod.internal
REDIS_PORT=6379
REDIS_PASSWORD=<secure-password>
```

### Security
```
SESSION_SECRET=<random-32-char-base64>
JWT_SECRET=<random-32-char-base64>
CSRF_SECRET=<random-32-char-base64>
```

### OAuth
```
GOOGLE_CLIENT_ID=<your-id>
GOOGLE_CLIENT_SECRET=<your-secret>
GITHUB_CLIENT_ID=<your-id>
GITHUB_CLIENT_SECRET=<your-secret>
```

## Deployment Workflow

### Pre-Deployment
1. Update code and test thoroughly
2. Prepare environment configuration
3. Obtain SSL/TLS certificates
4. Notify stakeholders
5. Schedule maintenance window

### Deployment
1. Run `scripts/deploy-production.sh --dry-run`
2. Address any issues
3. Run `scripts/deploy-production.sh`
4. Monitor logs during startup
5. Verify health checks passing
6. Test core functionality

### Post-Deployment
1. Monitor for errors (first 24 hours)
2. Verify backups working
3. Test monitoring alerts
4. Document any issues
5. Plan follow-up improvements

## Monitoring & Maintenance

### Daily
```bash
# Check logs
docker-compose -f docker-compose.production.yml logs --tail=100

# Check container status
docker-compose -f docker-compose.production.yml ps

# Monitor resources
docker stats
```

### Weekly
```bash
# Verify backups
ls -lah backups/

# Check certificate expiration
openssl x509 -enddate -noout -in nginx/ssl/cert.pem

# Review access logs
tail -f /var/log/nginx/access.log
```

### Monthly
```bash
# Test backup restoration
docker-compose -f docker-compose.production.yml exec postgres psql -U kyra_admin kyra_admin < backup.sql

# Update dependencies
docker-compose -f docker-compose.production.yml build --no-cache

# Review performance metrics
docker stats --no-stream
```

## Troubleshooting

### Application won't start
```bash
# Check logs
docker-compose -f docker-compose.production.yml logs app

# Verify database connection
docker-compose -f docker-compose.production.yml exec app npm run db:sync

# Check environment variables
docker-compose -f docker-compose.production.yml config
```

### High memory usage
```bash
# Check container memory limits
docker inspect kyra-admin-prod | grep -A 5 '"Memory"'

# Monitor real-time usage
docker stats --no-stream

# Restart service to free memory
docker-compose -f docker-compose.production.yml restart app
```

### SSL/TLS issues
```bash
# Verify certificate
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Check certificate chain
openssl verify -CAfile nginx/ssl/chain.pem nginx/ssl/cert.pem

# Reload Nginx
docker-compose -f docker-compose.production.yml exec nginx nginx -s reload
```

## Scaling

### Horizontal Scaling
```yaml
# In docker-compose.production.yml
services:
  app:
    deploy:
      replicas: 3  # Change from 2 to 3+
```

Then:
```bash
docker-compose -f docker-compose.production.yml up -d
```

### Vertical Scaling
Increase resource limits in `docker-compose.production.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 2G
```

## Backup & Recovery

### Automatic Backups
```bash
# Schedule daily backup at 2 AM
echo "0 2 * * * /opt/kyra-admin/scripts/backup-database.sh" | crontab -
```

### Manual Backup
```bash
./scripts/backup-database.sh
```

### Restore from Backup
```bash
docker-compose -f docker-compose.production.yml exec postgres psql -U kyra_admin kyra_admin < backup.sql
```

## Updates & Upgrades

```bash
# Pull latest code
git pull origin main

# Update and deploy
./scripts/deploy-production.sh

# For zero-downtime updates (2+ replicas)
# Docker Compose automatically handles rolling updates
```

## Support & Incident Response

### Incident Severity Levels

**Critical** (P1)
- Application down completely
- Data loss or corruption
- Security breach
- Response: Immediate escalation

**High** (P2)
- Major feature broken
- Significant performance degradation
- Response: 15 minutes

**Medium** (P3)
- Minor feature broken
- Minor performance issue
- Response: 1 hour

**Low** (P4)
- Cosmetic issues
- Non-essential feature broken
- Response: Next business day

### Rollback Procedure
```bash
# If critical issues detected:
./scripts/rollback-production.sh

# Manual rollback:
git reset --hard HEAD~1
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d
```

## Additional Resources

- [Complete Deployment Guide](DEPLOYMENT.md)
- [Deployment Checklist](PRODUCTION_CHECKLIST.md)
- [API Documentation](https://your-domain.com/api/docs)
- [GitHub Repository](https://github.com/yourusername/kyra-admin-console)

## Contact & Support

For questions or issues with production deployment:

- **Documentation**: See DEPLOYMENT.md
- **Issues**: File an issue on GitHub
- **Email**: support@example.com
- **Slack**: #kyra-support

---

**Last Updated**: May 29, 2026
**Version**: 1.0.0
**Maintainer**: SeekersLab

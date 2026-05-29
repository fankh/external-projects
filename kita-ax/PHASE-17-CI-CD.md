# Phase 17: CI/CD Pipeline & GitHub Actions

## Overview

Phase 17 implements a comprehensive CI/CD pipeline using GitHub Actions with:
- **Automated Testing** - Unit and integration tests on every push
- **Code Quality** - Linting, formatting, and security scanning
- **Docker Build** - Automated image building and pushing
- **Deployment** - Automatic deployment to staging and production
- **Health Checks** - Post-deployment verification
- **Notifications** - Slack alerts on deployment status

## Architecture

```
┌─────────────┐
│ Push/PR     │
└──────┬──────┘
       │
       ├─→ Tests (parallel)
       │   ├─ Lint
       │   ├─ Unit Tests
       │   └─ Integration Tests
       │
       ├─→ Security Scan
       │   ├─ npm audit
       │   └─ Snyk
       │
       └─→ Docker Build (main only)
           │
           ├─→ Build & Push
           └─→ Trivy Scan
               │
               └─→ Deploy (main only)
                   ├─ Staging
                   └─ Production (tagged)
```

## Workflows

### 1. Test Workflow (.github/workflows/test.yml)

Runs on every push and pull request to main/develop.

**Jobs:**

**Lint & Format**
- ESLint checking
- Code formatting verification
- Configuration validation

```bash
npm run lint
npm run format:check
```

**Unit Tests**
- Test isolation with mocks
- Coverage reporting
- Upload to Codecov

```bash
npm run test:unit
```

**Integration Tests**
- PostgreSQL service
- Redis service
- Database migrations
- API testing

```bash
npm run test:integration
```

**Security Scan**
- npm audit for vulnerabilities
- Snyk scanning
- Dependency checking

**Coverage Report**
- Aggregated coverage metrics
- Codecov integration
- Coverage history tracking

### 2. Docker Build Workflow (.github/workflows/docker.yml)

Builds and pushes Docker images on main branch.

**Steps:**

1. **Setup Buildx** - Enable BuildKit features
2. **Login** - Authenticate with GitHub Container Registry
3. **Extract Metadata** - Generate tags and labels
4. **Build & Push** - Multi-stage Docker build
5. **Security Scan** - Trivy vulnerability scanning

**Tags Generated:**
- `latest` - latest main branch
- `main-<sha>` - commit hash
- `v1.0.0` - semantic version tags
- `v1.0` - major.minor version

**Registry:** GitHub Container Registry (ghcr.io)

### 3. Deploy Workflow (.github/workflows/deploy.yml)

Deploys to staging on main push, production on tags.

**Staging Deployment:**
- Automatic on main branch push
- SSH deployment to staging server
- Database migrations
- Health check verification

**Production Deployment:**
- Manual trigger or on version tags
- Environment approval required
- Health check with 30s timeout
- Slack notifications
- Deployment tracking

## GitHub Secrets Required

Add these secrets to repository settings:

### Staging Secrets
```
STAGING_DEPLOY_KEY      # SSH private key
STAGING_DEPLOY_HOST     # Server hostname
STAGING_DEPLOY_USER     # SSH username
```

### Production Secrets
```
PROD_DEPLOY_KEY         # SSH private key
PROD_DEPLOY_HOST        # Server hostname
PROD_DEPLOY_USER        # SSH username
```

### Integration Secrets
```
SLACK_WEBHOOK           # Slack webhook URL
SNYK_TOKEN             # Snyk security token
```

## Docker Setup

### Dockerfile Structure

```dockerfile
# Build stage
FROM node:22-alpine AS builder
- Install dependencies
- Build application

# Runtime stage
FROM node:22-alpine
- Copy built artifacts
- Non-root user
- Health check
- Start application
```

**Features:**
- Multi-stage build for smaller images
- Alpine Linux for minimal size
- Non-root user for security
- Health check endpoint
- Proper signal handling with dumb-init

### Build & Push

```bash
# Build locally
docker build -t kyra-console:latest .

# Test locally
docker run -p 3000:3000 kyra-console:latest

# Push to registry
docker push ghcr.io/seekerslab/kyra-console:latest
```

## Local Development

### Using Docker Compose

Start all services locally:

```bash
docker-compose up
```

**Services:**
- `app` - Express application (port 3000, 8443)
- `postgres` - PostgreSQL database (port 5432)
- `redis` - Redis cache (port 6379)
- `pgadmin` - Database admin (port 5050)

### Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f app

# View last 100 lines
docker-compose logs --tail=100 app
```

### Database Management

```bash
# Run migrations
docker-compose exec app npm run db:migrate

# Seed database
docker-compose exec app npm run db:seed

# Access PostgreSQL
docker-compose exec postgres psql -U kyra kyra_dev
```

### Stopping Services

```bash
# Stop all
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Stop and rebuild
docker-compose down && docker-compose up --build
```

## Environment Variables

### Development (.env.local)

```env
NODE_ENV=development
DATABASE_URL=postgres://kyra:password@postgres:5432/kyra_dev
REDIS_URL=redis://redis:6379/0
LOG_LEVEL=debug
PROTOCOL=https
HOSTNAME=127.0.0.1
PORT=3000
```

### Staging

Set in deployment script or environment:

```env
NODE_ENV=staging
DATABASE_URL=postgres://...
REDIS_URL=redis://...
LOG_LEVEL=info
SENTRY_DSN=https://...
```

### Production

Set in deployment script or environment:

```env
NODE_ENV=production
DATABASE_URL=postgres://...
REDIS_URL=redis://...
LOG_LEVEL=warn
SENTRY_DSN=https://...
APP_VERSION=1.0.0
```

## Triggering Workflows

### Automatic Triggers

**Tests:**
- Every push to main, develop
- Every pull request to main, develop

**Docker Build:**
- Every push to main
- Every version tag (v*.*.*)

**Staging Deploy:**
- Every push to main

**Production Deploy:**
- Manual workflow dispatch
- Version tag push (v*.*.*)

### Manual Triggers

```bash
# Trigger via GitHub CLI
gh workflow run deploy.yml \
  -f environment=staging

gh workflow run deploy.yml \
  -f environment=production
```

## Monitoring

### GitHub Actions Dashboard

View workflow runs:
1. Repository → Actions tab
2. Select workflow (Tests, Docker Build, Deploy)
3. View logs and status

### Deployments

Track deployments:
1. Repository → Deployments tab
2. View staging and production history
3. Rollback if needed

### Slack Notifications

Production deployments send to Slack:

```
Production Deployment ✅ Success
Commit: abc123def456
Author: john.developer
```

## Troubleshooting

### Test Failures

Check workflow logs:
```bash
# View test output
gh run view <run-id> --log

# Re-run failed jobs
gh run rerun <run-id> --failed
```

### Docker Build Failures

Common issues:
- **Port conflicts** - Change exposed ports
- **Build context** - Verify Dockerfile path
- **Dependencies** - Check npm install logs

### Deployment Failures

Check deployment logs:
```bash
# View deployment status
gh deployment list

# View deployment logs
gh api repos/{owner}/{repo}/deployments/{id}/statuses
```

### SSH Connection Issues

Test SSH access:
```bash
ssh -i deploy_key user@host "echo OK"
```

## Best Practices

### 1. Semantic Versioning

Use semantic versioning for releases:

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

Triggers automatic production deployment.

### 2. Branch Protection

Protect main branch:
- Require status checks to pass
- Require code reviews (≥1 approvals)
- Dismiss stale reviews
- Require branches to be up to date

### 3. Deployment Approvals

Production deployments require approval:
- Environment → Deployment branches
- Add required reviewers
- 1-2 person approval

### 4. Monitoring

Monitor deployments:
- Slack notifications
- Health checks post-deploy
- Error tracking with Sentry
- Log aggregation (ELK, Datadog)

### 5. Rollback Strategy

Quick rollback:
```bash
# Revert to previous version
git revert <commit-hash>
git push origin main

# Or redeploy previous version
gh run rerun <previous-workflow-id>
```

## Performance Optimization

### Build Cache

GitHub Actions uses cache:
- npm dependencies cached
- Docker layer cache
- Reuse across runs

Clear cache if needed:
```bash
gh actions-cache delete "{cache-key}"
```

### Parallel Jobs

Workflows run jobs in parallel:
- Lint, unit tests, integration tests simultaneously
- Reduces total CI time
- Faster feedback

### Docker Build Speed

Optimize Dockerfile:
- Use Alpine Linux base
- Multi-stage builds
- Minimize layers
- Cache dependencies early

## Security Considerations

### 1. Secrets Management

- Store secrets in GitHub
- Never commit .env files
- Rotate SSH keys regularly
- Use personal access tokens for API access

### 2. Dependency Scanning

- npm audit built-in
- Snyk for advanced scanning
- Dependabot for auto-updates
- GitHub security advisories

### 3. Container Security

- Trivy scanning for vulnerabilities
- Non-root user in Docker
- Minimal base images
- Regular updates

### 4. Access Control

- Restrict deployment approvals
- SSH key per environment
- IP whitelist if possible
- Audit deployment logs

## Next Steps

**Phase 18** - Database Migrations System
- Migration management
- Schema versioning
- Rollback procedures
- Testing migrations

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)
- [Best Practices for CI/CD](https://www.gitops.tech/)
- [Docker Security Best Practices](https://docs.docker.com/develop/dev-best-practices/)

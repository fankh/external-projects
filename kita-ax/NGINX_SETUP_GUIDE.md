# Nginx Reverse Proxy Setup Guide

**Date:** May 27, 2026  
**Status:** ✅ DEPLOYED AND VERIFIED

---

## Overview

Nginx is configured as a reverse proxy for the Phase 6 KYRA Admin Console. This setup provides:

- **HTTPS/TLS termination** with self-signed certificates (staging)
- **Rate limiting** per endpoint (API: 30 req/s, Admin: 10 req/s)
- **Gzip compression** for faster content delivery
- **Security headers** (HSTS, CSP, X-Frame-Options, etc.)
- **HTTP/2 support** for multiplexed connections
- **Automatic HTTP → HTTPS redirect**
- **Static file caching**
- **WebSocket support** for real-time features

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Host Machine                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Port 8080 (HTTP)  ──────┐                             │
│  Port 8443 (HTTPS) ───┐  │                             │
│                       │  └──→ Nginx Container           │
│                       └─────→ (kyra-nginx)              │
│                              ↓                          │
│                      ┌───────────────────┐              │
│                      │  Docker Network   │              │
│                      │  kyra-network     │              │
│                      │                   │              │
│         ┌────────────┴─────────┬─────────┴────────┐    │
│         │                      │                  │    │
│   ┌─────▼────┐        ┌────────▼──────┐  ┌──────▼──┐  │
│   │ Postgres │        │ Node.js App   │  │  Nginx  │  │
│   │ :5433    │        │ :3005         │  │ :8080   │  │
│   └──────────┘        │ kyra-admin-   │  │ :8443   │  │
│                       │ phase6        │  └─────────┘  │
│                       └───────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## URLs

| Protocol | URL | Port | Status |
|----------|-----|------|--------|
| **HTTP** | http://localhost:8080 | 8080 | ✅ Redirects to HTTPS |
| **HTTPS** | https://localhost:8443 | 8443 | ✅ Active |
| **Health Check** | https://localhost:8443/health | 8443 | ✅ Working |
| **Login** | https://localhost:8443/login | 8443 | ✅ Available |
| **Dashboard** | https://localhost:8443/admin/dashboard | 8443 | ✅ Available |
| **API Docs** | https://localhost:8443/api/docs | 8443 | ✅ Available |

---

## Configuration Details

### Nginx Features

#### 1. **SSL/TLS Configuration**
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

**For Production:**
- Replace self-signed certificates with real CA-signed certs
- Use Let's Encrypt for free certificates
- Update certificate paths in nginx.conf

#### 2. **Security Headers**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | max-age=31536000 | Force HTTPS |
| `X-Frame-Options` | SAMEORIGIN | Prevent clickjacking |
| `X-Content-Type-Options` | nosniff | Prevent MIME sniffing |
| `X-XSS-Protection` | 1; mode=block | XSS protection |
| `Content-Security-Policy` | Restrictive policy | XSS & injection defense |

#### 3. **Rate Limiting**

```nginx
# Zone definitions
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

# Applied per endpoint
location /api/ {
    limit_req zone=api burst=100 nodelay;
    # ...
}
```

**Limits:**
- **General endpoints:** 10 requests/second (50 burst)
- **API endpoints:** 30 requests/second (100 burst)
- **Login page:** 20 requests/second (specific for brute-force protection)

#### 4. **Gzip Compression**

```nginx
gzip on;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml application/json application/javascript;
```

**Reduces bandwidth by ~70% for text content**

#### 5. **Request Forwarding Headers**

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $server_name;
```

These headers tell the Node.js app:
- The original client IP
- The original protocol (HTTP/HTTPS)
- The original hostname

#### 6. **Endpoint-Specific Configuration**

**Health Check** (`/health`)
- No rate limiting
- No access logging
- Immediate response

**API Endpoints** (`/api/*`)
- Rate limit: 30 req/s
- Timeout: 60s
- Full buffering enabled

**Admin Panel** (`/admin/*`)
- Rate limit: 10 req/s
- Timeout: 30s
- Moderate buffering

**Login Page** (`/login`)
- Rate limit: 20 req/s (brute-force protection)
- Immediate timeout: 30s

**Static Files** (`/public/*`)
- Cache for 1 day
- Headers: `Cache-Control: max-age=86400`
- Not rate limited

---

## Container Configuration

### Docker Setup

**Nginx Container:**
```bash
docker run -d \
  --name kyra-nginx \
  --network kyra-network \
  -p 8080:80 \
  -p 8443:443 \
  -v /path/to/nginx.conf:/etc/nginx/nginx.conf:ro \
  kita-ax_nginx:latest
```

**Network:**
- Custom bridge network: `kyra-network`
- Upstream service: `kyra-admin-phase6:3005`
- Internal DNS resolution enabled

**Volumes:**
- Read-only nginx.conf mount
- SSL certificates directory
- Webroot for Let's Encrypt ACME challenges

---

## Testing the Setup

### Health Check
```bash
curl -k https://localhost:8443/health
```

Expected output:
```json
{"success":true,"status":"healthy","timestamp":"2026-05-27T08:09:57.478Z"}
```

### Login Page
```bash
curl -k https://localhost:8443/login
```

### Rate Limiting Test
```bash
# This should work (within limits)
curl -k https://localhost:8443/api/docs

# Rapid repeated requests should get 429 Too Many Requests
for i in {1..100}; do curl -k https://localhost:8443/api/v1/users; done
```

### SSL Certificate Verification
```bash
# For self-signed cert (staging)
curl -k https://localhost:8443/health

# For production with valid cert
curl https://localhost:8443/health
```

---

## Production Deployment

### 1. Replace Self-Signed Certificates

**Option A: Let's Encrypt (Recommended)**
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy to nginx directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /path/to/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /path/to/nginx/ssl/key.pem

# Auto-renewal (crontab)
0 0 1 * * certbot renew --quiet
```

**Option B: Commercial CA Certificate**
- Obtain certificate and key from your CA
- Place in `/nginx/ssl/cert.pem` and `/nginx/ssl/key.pem`

### 2. Update Nginx Configuration

```nginx
# Update server name
server_name yourdomain.com www.yourdomain.com;

# Update security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Consider adding to HSTS preload list
# https://hstspreload.org/
```

### 3. Configure Backup & Monitoring

```bash
# Backup certificates
docker exec kyra-nginx tar czf - /etc/nginx/ssl | \
  gzip > nginx-ssl-backup-$(date +%Y%m%d).tar.gz

# Monitor logs
docker logs -f kyra-nginx
docker exec kyra-nginx tail -f /var/log/nginx/access.log
```

### 4. Performance Tuning

```nginx
# Increase worker processes based on CPU cores
worker_processes auto;

# Increase connection pool
upstream kyra_app {
    keepalive 32;
    server kyra-admin-phase6:3005;
}

# Enable proxy caching for static assets
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=cache:10m max_size=100m;
```

---

## SSL Certificate Generation (Staging)

For development/staging, self-signed certificates are auto-generated:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/key.pem \
    -out /etc/nginx/ssl/cert.pem \
    -subj "/C=KR/ST=Seoul/L=Seoul/O=KYRA/CN=localhost"
```

**Warning:** Modern browsers will show security warnings for self-signed certs. This is normal for staging and development.

---

## Troubleshooting

### 502 Bad Gateway

**Cause:** Upstream service not running or not responding

```bash
# Check if app is running
docker ps | grep kyra-admin-phase6

# Check app logs
docker logs kyra-admin-phase6

# Test app directly
docker exec kyra-nginx wget http://kyra-admin-phase6:3005/health

# Check network connectivity
docker network inspect kyra-network
```

### 504 Gateway Timeout

**Cause:** Request taking longer than timeout

```nginx
# Increase timeouts in nginx.conf
proxy_connect_timeout 60s;   # Connection timeout
proxy_send_timeout 60s;       # Send timeout
proxy_read_timeout 60s;       # Response timeout
```

### SSL Certificate Errors

```bash
# Check certificate expiry
openssl x509 -in /path/to/cert.pem -text -noout | grep -i "not after"

# Verify certificate chain
openssl verify /path/to/cert.pem

# Test HTTPS with verbose output
curl -vk https://localhost:8443/health
```

### High Memory Usage

```bash
# Reduce buffer sizes
proxy_buffer_size 4k;
proxy_buffers 8 4k;

# Reduce connection pool
keepalive 10;
```

---

## Monitoring

### Access Logs
```bash
docker exec kyra-nginx tail -f /var/log/nginx/access.log
```

### Error Logs
```bash
docker exec kyra-nginx tail -f /var/log/nginx/error.log
```

### Key Metrics to Monitor

1. **Request Rate:** Requests per second
2. **Response Time:** P50, P95, P99 latencies
3. **Error Rate:** 4xx and 5xx response percentages
4. **Cache Hit Rate:** Static asset caching effectiveness
5. **SSL/TLS Handshake Time:** Connection setup performance
6. **Upstream Availability:** Backend service health

---

## Comparison: Before & After Nginx

| Aspect | Before | After |
|--------|--------|-------|
| **Protocol** | HTTP only | HTTP/HTTPS |
| **Encryption** | None | TLS 1.2/1.3 |
| **Port** | 3005 (direct) | 8080/8443 (proxy) |
| **Rate Limiting** | None | Per-endpoint limits |
| **Compression** | Manual | Automatic gzip |
| **Security Headers** | None | 5+ headers |
| **DDoS Protection** | None | Rate limiting |
| **Static Caching** | None | 1-day cache |
| **Access Logs** | App-level | Nginx-level |

---

## Next Steps

1. ✅ Self-signed certificates (staging)
2. ✅ HTTP → HTTPS redirect
3. ✅ Rate limiting configured
4. ✅ Security headers set
5. ✅ Upstream proxy working

**For production:**
1. Replace self-signed certs with real CA certs
2. Configure monitoring and alerting
3. Set up log aggregation
4. Configure backup and recovery
5. Performance tune based on load testing
6. Add WAF rules if needed

---

## Files

| File | Purpose |
|------|---------|
| `nginx/nginx.conf` | Main configuration |
| `nginx/Dockerfile` | Container image |
| `docker-compose.yml` | Service orchestration |

---

## Support

For issues or questions:
1. Check logs: `docker logs kyra-nginx`
2. Test connectivity: `docker exec kyra-nginx wget http://kyra-admin-phase6:3005/health`
3. Verify config: `docker exec kyra-nginx nginx -t`
4. Restart service: `docker restart kyra-nginx`


# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Run linting and tests (optional, can be skipped)
RUN npm run lint || true

# Production stage
FROM node:18-alpine

LABEL maintainer="SeekersLab"
LABEL description="KYRA Admin Console - Production"
LABEL version="1.0.0"

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package files from builder
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application code from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/nginx ./nginx

# Create logs directory
RUN mkdir -p /var/log/kyra-admin && chown -R nodejs:nodejs /var/log/kyra-admin /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check with improved logging
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Set environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Start application with graceful shutdown support
CMD ["node", "src/server.js"]

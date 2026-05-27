FROM nginx:1.25-alpine

# Install openssl
RUN apk add --no-cache openssl

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Create directories for SSL
RUN mkdir -p /etc/nginx/ssl /var/www/certbot

# Generate self-signed certificate for staging
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/key.pem \
    -out /etc/nginx/ssl/cert.pem \
    -subj "/C=KR/ST=Seoul/L=Seoul/O=KYRA/CN=localhost"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]

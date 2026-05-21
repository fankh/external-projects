#!/bin/bash
set -eu
cd "$(dirname "$0")/../.."
[ -z "${1:-}" ] && { echo "Usage: $0 <cohere-api-key>"; exit 1; }
grep -q COHERE_API_KEY .env && sed -i "s|^COHERE_API_KEY=.*|COHERE_API_KEY=$1|" .env || echo "COHERE_API_KEY=$1" >> .env
docker compose up -d rag-service
echo "Cohere key set. rag-service restarting."

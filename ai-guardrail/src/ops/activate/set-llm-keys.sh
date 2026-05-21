#!/bin/bash
# Usage: bash set-llm-keys.sh <openai-key> [anthropic-key]
set -eu
cd "$(dirname "$0")/../.."
[ -z "${1:-}" ] && { echo "Usage: $0 <openai-key> [anthropic-key]"; exit 1; }
sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$1|" .env
[ -n "${2:-}" ] && sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$2|" .env
docker compose up -d ml-service
echo "LLM keys set. ml-service restarting."

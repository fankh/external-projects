#!/bin/bash
# Usage: bash set-slack-webhook.sh <webhook-url>
set -eu
cd "$(dirname "$0")/../.."
[ -z "${1:-}" ] && { echo "Usage: $0 <slack-webhook-url>"; exit 1; }
echo "$1" > monitoring/slack_url_stub
docker compose restart alertmanager
echo "Slack webhook set. Alertmanager restarted."

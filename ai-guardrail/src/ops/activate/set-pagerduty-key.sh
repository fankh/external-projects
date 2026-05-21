#!/bin/bash
set -eu
cd "$(dirname "$0")/../.."
[ -z "${1:-}" ] && { echo "Usage: $0 <pagerduty-service-key>"; exit 1; }
echo "$1" > monitoring/pagerduty_key_stub
docker compose restart alertmanager
echo "PagerDuty key set. Alertmanager restarted."

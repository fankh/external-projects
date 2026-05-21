# Multi-Region Deployment

## Architecture
- **Primary:** ap-northeast-2 (Seoul)
- **Secondary:** us-west-2 (Oregon) or eu-west-1 (Ireland)
- **DNS:** Route53 latency-based routing with health checks
- **DB:** RDS cross-region read replica + manual failover
- **Cache:** Redis cluster per region (eventual consistency via app-level sync)

## Files
- `region-values-primary.yaml` — Helm values for primary region
- `region-values-secondary.yaml` — Helm values for secondary
- `dns-failover.yaml` — Route53 health check + failover config
- `replication.yaml` — Cross-region DB replication setup

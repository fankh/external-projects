# DLP / PHI Detection Spike Runbook
## When: Prometheus alert `PhiCriticalSpike`
1. Check compliance dashboard: `/admin/compliance` → PHI tab
2. Review recent PHI scan audit logs: `SELECT * FROM audit_logs WHERE action='phi.scan' ORDER BY created_at DESC LIMIT 20;`
3. Identify the user/tenant generating the spike
4. Check if legitimate (e.g., legal department scanning docs) vs. data leak attempt
5. If leak: immediately restrict user via `/admin/users` → Suspend
6. File breach incident if PHI was exposed externally

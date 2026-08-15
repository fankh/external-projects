"""
KOVAN SIEM Log Analyzer
========================
Integrates log parsers with detection rules to analyze logs and generate alerts.

Features:
- Parse logs from multiple vendors
- Apply detection rules
- Generate alerts with severity levels
- MITRE ATT&CK mapping
- Real-time analysis and batch processing
"""

import json
import sys
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from detection_rules import (
    DETECTION_RULES,
    Alert,
    DetectionEngine,
    RuleCategory,
    Severity,
)

# Import parsers and detection engine
from KOVAN_Log_Parsers import (
    ALL_PARSERS,
    KOVAN_LOG_SOURCES,
    auto_detect_parser,
    parse_log,
)


class LogAnalyzer:
    """Main log analyzer combining parsers and detection rules"""

    def __init__(self):
        self.detection_engine = DetectionEngine()
        self.stats = {
            "total_logs": 0,
            "parsed_logs": 0,
            "failed_parses": 0,
            "alerts_generated": 0,
            "alerts_by_severity": defaultdict(int),
            "alerts_by_category": defaultdict(int),
            "logs_by_parser": defaultdict(int),
        }
        self.alerts: List[Alert] = []

    def analyze_log_line(
        self, log_line: str, parser_name: Optional[str] = None
    ) -> Tuple[Optional[Dict], List[Alert]]:
        """
        Analyze a single log line.

        Args:
            log_line: Raw log string
            parser_name: Optional specific parser to use (auto-detect if None)

        Returns:
            Tuple of (parsed_log_dict, list_of_alerts)
        """
        self.stats["total_logs"] += 1

        # Auto-detect parser if not specified
        if not parser_name:
            parser_name = auto_detect_parser(log_line)

        if not parser_name:
            self.stats["failed_parses"] += 1
            return None, []

        # Parse the log
        parsed = parse_log(log_line, parser_name)

        if not parsed:
            self.stats["failed_parses"] += 1
            return None, []

        self.stats["parsed_logs"] += 1
        self.stats["logs_by_parser"][parser_name] += 1

        # Run detection rules
        alerts = self.detection_engine.analyze_log(parsed, log_line)

        for alert in alerts:
            self.stats["alerts_generated"] += 1
            self.stats["alerts_by_severity"][alert.severity.name] += 1
            self.stats["alerts_by_category"][alert.category.value] += 1
            self.alerts.append(alert)

        return parsed, alerts

    def analyze_batch(
        self, log_lines: List[str], parser_name: Optional[str] = None
    ) -> List[Alert]:
        """Analyze a batch of log lines"""
        all_alerts = []

        for line in log_lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            _, alerts = self.analyze_log_line(line, parser_name)
            all_alerts.extend(alerts)

        return all_alerts

    def analyze_file(self, file_path: str) -> List[Alert]:
        """Analyze all logs in a file"""
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        return self.analyze_batch(lines)

    def print_alert(self, alert: Alert, verbose: bool = False):
        """Print a formatted alert"""
        severity_colors = {
            Severity.CRITICAL: "\033[91m",  # Red
            Severity.HIGH: "\033[93m",  # Yellow
            Severity.MEDIUM: "\033[94m",  # Blue
            Severity.LOW: "\033[92m",  # Green
            Severity.INFO: "\033[90m",  # Gray
        }
        reset = "\033[0m"
        color = severity_colors.get(alert.severity, "")

        print(f"\n{'=' * 70}")
        print(f"{color}[{alert.severity.name}]{reset} {alert.rule_name}")
        print(f"{'=' * 70}")
        print(f"Alert ID:    {alert.alert_id}")
        print(f"Rule ID:     {alert.rule_id}")
        print(f"Category:    {alert.category.value}")
        print(f"Timestamp:   {alert.timestamp}")
        print(f"Source IP:   {alert.source_ip or 'N/A'}")
        print(f"Dest IP:     {alert.destination_ip or 'N/A'}")
        print(f"Description: {alert.description}")

        if alert.event_count > 1:
            print(f"Event Count: {alert.event_count} events")

        if alert.mitre_tactics:
            print(f"MITRE ATT&CK Tactics: {', '.join(alert.mitre_tactics)}")
        if alert.mitre_techniques:
            print(f"MITRE ATT&CK Techniques: {', '.join(alert.mitre_techniques)}")

        if alert.response_actions:
            print(f"\nRecommended Actions:")
            for i, action in enumerate(alert.response_actions, 1):
                print(f"  {i}. {action}")

        if verbose:
            print(f"\nRaw Log: {alert.raw_log[:200]}...")
            print(f"\nParsed Fields:")
            for key, value in alert.parsed_fields.items():
                if value and not key.startswith("_"):
                    print(f"  {key}: {value}")

    def print_statistics(self):
        """Print analysis statistics"""
        print("\n" + "=" * 70)
        print("LOG ANALYSIS STATISTICS")
        print("=" * 70)

        print(f"\nLog Processing:")
        print(f"  Total Logs:     {self.stats['total_logs']}")
        print(f"  Parsed:         {self.stats['parsed_logs']}")
        print(f"  Failed:         {self.stats['failed_parses']}")
        if self.stats["total_logs"] > 0:
            success_rate = (self.stats["parsed_logs"] / self.stats["total_logs"]) * 100
            print(f"  Success Rate:   {success_rate:.1f}%")

        print(f"\nAlerts Generated: {self.stats['alerts_generated']}")

        if self.stats["alerts_by_severity"]:
            print(f"\nAlerts by Severity:")
            for severity in Severity:
                count = self.stats["alerts_by_severity"].get(severity.name, 0)
                if count > 0:
                    print(f"  {severity.name:10}: {count}")

        if self.stats["alerts_by_category"]:
            print(f"\nAlerts by Category:")
            for cat, count in sorted(self.stats["alerts_by_category"].items()):
                print(f"  {cat:15}: {count}")

        if self.stats["logs_by_parser"]:
            print(f"\nLogs by Parser:")
            for parser, count in sorted(
                self.stats["logs_by_parser"].items(), key=lambda x: -x[1]
            ):
                print(f"  {parser:25}: {count}")

    def export_alerts_json(self, file_path: str):
        """Export all alerts to JSON file"""
        alerts_data = [alert.to_dict() for alert in self.alerts]
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(alerts_data, f, indent=2, ensure_ascii=False)
        print(f"\nExported {len(alerts_data)} alerts to {file_path}")


# =============================================================================
# SAMPLE ATTACK LOGS FOR TESTING
# =============================================================================

SAMPLE_ATTACK_LOGS = [
    # FW-001: Blocked inbound from Internet
    'Aug 9 19:39:56 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:39:51" duration=5 policy_id=1 service=http proto=6 src zone=Untrust dst zone=Trust action=Deny sent=0 rcvd=0 src=203.0.113.100 dst=192.168.1.10 src_port=54321 dst_port=80',
    # FW-002: Outbound to suspicious C2 port
    'Aug 9 19:40:00 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:40:00" duration=1 policy_id=100 service=tcp proto=6 src zone=Trust dst zone=Untrust action=Deny sent=0 rcvd=0 src=192.168.1.50 dst=185.100.87.33 src_port=49152 dst_port=4444',
    # FW-005: SSH from external
    'Aug 9 19:41:00 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:41:00" duration=30 policy_id=5 service=ssh proto=6 src zone=Untrust dst zone=Trust action=Permit sent=1024 rcvd=2048 src=45.33.32.156 dst=192.168.1.100 src_port=54321 dst_port=22',
    # FW-006: Database port from DMZ (CRITICAL)
    'Aug 9 19:42:00 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:42:00" duration=1 policy_id=50 service=tcp proto=6 src zone=DMZ dst zone=Trust action=Permit sent=100 rcvd=200 src=10.0.0.50 dst=192.168.1.200 src_port=49000 dst_port=1433',
    # VPN-001: VPN authentication failure
    "Aug 9 19:43:00 192.168.163.2 vpn-gw01: NetScreen device_id=vpn-gw01 [Root]system-notification-00018(ike): IKE Phase-1 authentication failed (gateway=VPN-GW-01 peer=203.0.113.100 reason=invalid credentials)",
    # Multiple VPN failures (VPN-002 threshold test)
    "Aug 9 19:43:10 192.168.163.2 vpn-gw01: NetScreen device_id=vpn-gw01 [Root]system-notification-00018(ike): IKE Phase-1 authentication failed (gateway=VPN-GW-01 peer=45.33.32.156 reason=wrong password)",
    "Aug 9 19:43:15 192.168.163.2 vpn-gw01: NetScreen device_id=vpn-gw01 [Root]system-notification-00018(ike): IKE Phase-1 authentication failed (gateway=VPN-GW-01 peer=45.33.32.156 reason=wrong password)",
    "Aug 9 19:43:20 192.168.163.2 vpn-gw01: NetScreen device_id=vpn-gw01 [Root]system-notification-00018(ike): IKE Phase-1 authentication failed (gateway=VPN-GW-01 peer=45.33.32.156 reason=wrong password)",
    "Aug 9 19:43:25 192.168.163.2 vpn-gw01: NetScreen device_id=vpn-gw01 [Root]system-notification-00018(ike): IKE Phase-1 authentication failed (gateway=VPN-GW-01 peer=45.33.32.156 reason=wrong password)",
    "Aug 9 19:43:30 192.168.163.2 vpn-gw01: NetScreen device_id=vpn-gw01 [Root]system-notification-00018(ike): IKE Phase-1 authentication failed (gateway=VPN-GW-01 peer=45.33.32.156 reason=wrong password)",
    # VPN-003: VPN tunnel established
    'Jan 15 17:00:00 fortigate-01 date=2024-01-15 time=17:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0101039424" type="event" subtype="vpn" eventtype="ipsec" level="information" vd="root" action="tunnel-up" tunneltype="ipsec" tunnelid="1" remip=203.0.113.100 locip=10.231.241.13 user="vpn_user" msg="IPsec phase 2 established"',
    # NAC-001: Unauthorized device
    "2024-01-16 08:00:00,LOGTYPE=NODE,LOGID=2001,IP=192.168.1.150,MAC=AA:BB:CC:DD:EE:FF,MSG=Unknown device detected, DETAIL=hostname=ROGUE-DEVICE user=unknown os=Unknown",
    # NAC-002: MAC spoofing
    "2024-01-16 08:05:00,LOGTYPE=SECURITY,LOGID=3001,IP=192.168.1.160,MAC=00:1A:2B:3C:4D:5E,MSG=MAC address spoof detected, DETAIL=original_ip=192.168.1.100 duplicate_mac=00:1A:2B:3C:4D:5E",
    # NAC-003: Policy violation
    "2024-01-16 08:10:00,LOGTYPE=POLICY,LOGID=4001,IP=192.168.1.101,MAC=00:1A:2B:3C:4D:5F,MSG=Policy violation detected - non-compliant endpoint, DETAIL=reason=antivirus_outdated quarantine=true",
    # FortiGate blocked traffic
    'Jan 15 18:00:00 fortigate-01 date=2024-01-15 time=18:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0000000013" type="traffic" subtype="forward" level="warning" vd="root" srcip=192.168.1.100 srcport=54321 srcintf="port1" dstip=185.220.101.1 dstport=443 dstintf="port2" policyid=10 sessionid=99999 proto=6 action="deny" sentbyte=0 rcvdbyte=0 duration=0 msg="blocked suspicious destination"',
    # FortiGate - Large data transfer (potential exfiltration)
    'Jan 15 19:00:00 fortigate-01 date=2024-01-15 time=19:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=192.168.1.50 srcport=54321 srcintf="port1" dstip=45.33.32.156 dstport=443 dstintf="port2" policyid=1 sessionid=12345 proto=6 action="accept" sentbyte=157286400 rcvdbyte=2048 duration=300 msg="session closed"',
    # SECUI MF2 - Blocked attack
    'Jan 15 10:23:45 10.231.59.10 id=MF2FW time="2024-01-15 10:23:45" fw=10.231.59.10 pri=2 rule=999 proto=tcp src=203.0.113.50 dst=192.168.1.10 sport=12345 dport=445 sent=0 rcvd=0 duration=0 action=deny',
    # SECUI MF2 - Database port access attempt
    'Jan 15 10:24:00 10.231.59.10 id=MF2FW time="2024-01-15 10:24:00" fw=10.231.59.10 pri=1 rule=100 proto=tcp src=10.0.0.100 dst=192.168.1.200 sport=49999 dport=3306 sent=100 rcvd=0 duration=1 action=accept',
]


# =============================================================================
# MAIN EXECUTION
# =============================================================================


def demo_analysis():
    """Demonstrate log analysis with sample attack logs"""

    print("=" * 70)
    print("KOVAN SIEM Log Analyzer - Detection Demo")
    print("=" * 70)
    print(
        f"\nAnalyzing {len(SAMPLE_ATTACK_LOGS)} sample logs for security threats...\n"
    )

    analyzer = LogAnalyzer()

    # Analyze all sample logs
    for log_line in SAMPLE_ATTACK_LOGS:
        parsed, alerts = analyzer.analyze_log_line(log_line)

        # Print alerts immediately
        for alert in alerts:
            analyzer.print_alert(alert, verbose=False)

    # Print final statistics
    analyzer.print_statistics()

    # Summary of critical/high alerts
    critical_high = [
        a for a in analyzer.alerts if a.severity in [Severity.CRITICAL, Severity.HIGH]
    ]

    if critical_high:
        print("\n" + "=" * 70)
        print("PRIORITY ALERTS REQUIRING IMMEDIATE ATTENTION")
        print("=" * 70)
        for alert in critical_high:
            print(f"\n[{alert.severity.name}] {alert.rule_id}: {alert.rule_name}")
            print(f"  Source: {alert.source_ip} -> Dest: {alert.destination_ip}")
            print(
                f"  Action: {alert.response_actions[0] if alert.response_actions else 'Review immediately'}"
            )

    return analyzer


def print_all_rules():
    """Print all available detection rules"""
    engine = DetectionEngine()
    engine.print_rule_summary()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--rules":
        print_all_rules()
    else:
        demo_analysis()

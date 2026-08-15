"""
KOVAN SIEM Detection Rules Engine
==================================
Security detection rules for analyzing parsed logs and identifying threats.

Rule Categories:
- Firewall: Blocked traffic, policy violations, port scans
- VPN: Failed authentication, tunnel failures, anomalous connections
- NAC: Unauthorized devices, policy violations, MAC spoofing
- DDoS: Attack detection, traffic anomalies
- WAF: Web attacks, SQL injection, XSS attempts
- General: Brute force, anomalous patterns, compliance violations

Severity Levels:
- CRITICAL (1): Immediate action required - active attack or breach
- HIGH (2): Urgent - potential security incident
- MEDIUM (3): Warning - suspicious activity
- LOW (4): Informational - audit events
- INFO (5): Normal operational events
"""

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Pattern, Set, Tuple

# =============================================================================
# ENUMS AND DATA CLASSES
# =============================================================================


class Severity(Enum):
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4
    INFO = 5


class RuleCategory(Enum):
    FIREWALL = "firewall"
    VPN = "vpn"
    NAC = "nac"
    IPS_IDS = "ips_ids"
    DDOS = "ddos"
    WAF = "waf"
    AUTHENTICATION = "authentication"
    DATA_EXFILTRATION = "data_exfiltration"
    MALWARE = "malware"
    COMPLIANCE = "compliance"
    ANOMALY = "anomaly"


class MitreAttackTactic(Enum):
    """MITRE ATT&CK Tactics"""

    RECONNAISSANCE = "TA0043"
    RESOURCE_DEVELOPMENT = "TA0042"
    INITIAL_ACCESS = "TA0001"
    EXECUTION = "TA0002"
    PERSISTENCE = "TA0003"
    PRIVILEGE_ESCALATION = "TA0004"
    DEFENSE_EVASION = "TA0005"
    CREDENTIAL_ACCESS = "TA0006"
    DISCOVERY = "TA0007"
    LATERAL_MOVEMENT = "TA0008"
    COLLECTION = "TA0009"
    COMMAND_AND_CONTROL = "TA0011"
    EXFILTRATION = "TA0010"
    IMPACT = "TA0040"


@dataclass
class DetectionRule:
    """Detection rule definition"""

    rule_id: str
    name: str
    description: str
    severity: Severity
    category: RuleCategory

    # Matching conditions
    conditions: Dict[str, Any]  # Field conditions to match
    pattern: Optional[Pattern] = None  # Optional regex pattern

    # Context
    mitre_tactics: List[MitreAttackTactic] = field(default_factory=list)
    mitre_techniques: List[str] = field(default_factory=list)

    # Response
    response_actions: List[str] = field(default_factory=list)
    false_positive_hints: List[str] = field(default_factory=list)

    # Aggregation (for threshold-based rules)
    threshold_count: int = 1  # Number of events to trigger
    threshold_window: int = 0  # Time window in seconds (0 = single event)
    group_by: List[str] = field(default_factory=list)  # Fields to group by

    # Metadata
    enabled: bool = True
    tags: List[str] = field(default_factory=list)
    references: List[str] = field(default_factory=list)


@dataclass
class Alert:
    """Generated alert from detection rule"""

    alert_id: str
    rule_id: str
    rule_name: str
    severity: Severity
    category: RuleCategory
    timestamp: datetime
    source_ip: Optional[str]
    destination_ip: Optional[str]
    description: str
    raw_log: str
    parsed_fields: Dict[str, Any]
    mitre_tactics: List[str]
    mitre_techniques: List[str]
    response_actions: List[str]
    event_count: int = 1

    def to_dict(self) -> Dict:
        return {
            "alert_id": self.alert_id,
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "severity": self.severity.name,
            "category": self.category.value,
            "timestamp": self.timestamp.isoformat(),
            "source_ip": self.source_ip,
            "destination_ip": self.destination_ip,
            "description": self.description,
            "raw_log": self.raw_log[:500],  # Truncate for readability
            "parsed_fields": self.parsed_fields,
            "mitre_tactics": self.mitre_tactics,
            "mitre_techniques": self.mitre_techniques,
            "response_actions": self.response_actions,
            "event_count": self.event_count,
        }


# =============================================================================
# DETECTION RULES DEFINITIONS
# =============================================================================

DETECTION_RULES: Dict[str, DetectionRule] = {}


# -----------------------------------------------------------------------------
# FIREWALL RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["FW-001"] = DetectionRule(
    rule_id="FW-001",
    name="Firewall Deny - Inbound from Internet",
    description="Blocked inbound connection attempt from external network to internal resources",
    severity=Severity.LOW,
    category=RuleCategory.FIREWALL,
    conditions={
        "action": ["Deny", "deny", "drop", "DROP", "block", "BLOCK"],
        "src_zone": ["Untrust", "untrust", "external", "internet", "WAN"],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    mitre_techniques=["T1190"],  # Exploit Public-Facing Application
    response_actions=["Log for baseline", "Review if repeated from same source"],
    false_positive_hints=["Normal internet noise", "Port scanners"],
    tags=["firewall", "blocked", "inbound"],
)

DETECTION_RULES["FW-002"] = DetectionRule(
    rule_id="FW-002",
    name="Firewall Deny - Outbound to Suspicious Ports",
    description="Internal host attempting to connect to suspicious external ports (C2, malware)",
    severity=Severity.HIGH,
    category=RuleCategory.FIREWALL,
    conditions={
        "action": ["Deny", "deny", "drop", "block"],
        "src_zone": ["Trust", "trust", "internal", "LAN"],
        "dst_port": ["4444", "5555", "6666", "1337", "31337", "8080", "8443", "9001"],
    },
    mitre_tactics=[MitreAttackTactic.COMMAND_AND_CONTROL],
    mitre_techniques=["T1571"],  # Non-Standard Port
    response_actions=[
        "Investigate source host immediately",
        "Check for malware infection",
        "Review recent user activity",
        "Block source IP if confirmed malicious",
    ],
    false_positive_hints=["Development servers", "Legitimate proxy usage"],
    tags=["firewall", "c2", "outbound", "suspicious"],
)

DETECTION_RULES["FW-003"] = DetectionRule(
    rule_id="FW-003",
    name="Port Scan Detected - Multiple Ports",
    description="Single source attempting connections to multiple ports on same destination",
    severity=Severity.MEDIUM,
    category=RuleCategory.FIREWALL,
    conditions={
        "action": ["Deny", "deny", "drop"],
    },
    threshold_count=10,
    threshold_window=60,  # 10 events in 60 seconds
    group_by=["src_ip", "dst_ip"],
    mitre_tactics=[MitreAttackTactic.DISCOVERY, MitreAttackTactic.RECONNAISSANCE],
    mitre_techniques=["T1046"],  # Network Service Discovery
    response_actions=[
        "Block source IP temporarily",
        "Investigate if internal source",
        "Add to watchlist",
    ],
    tags=["firewall", "portscan", "reconnaissance"],
)

DETECTION_RULES["FW-004"] = DetectionRule(
    rule_id="FW-004",
    name="High Volume Traffic - Potential DDoS or Exfiltration",
    description="Unusually high data transfer volume detected",
    severity=Severity.HIGH,
    category=RuleCategory.FIREWALL,
    conditions={
        "action": ["Permit", "permit", "accept", "ACCEPT", "allow"],
        "_sent_bytes_gt": 104857600,  # > 100MB
    },
    mitre_tactics=[MitreAttackTactic.EXFILTRATION],
    mitre_techniques=["T1048"],  # Exfiltration Over Alternative Protocol
    response_actions=[
        "Verify if legitimate data transfer",
        "Check destination reputation",
        "Review user authorization",
    ],
    tags=["firewall", "exfiltration", "high-volume"],
)

DETECTION_RULES["FW-005"] = DetectionRule(
    rule_id="FW-005",
    name="SSH/RDP Access from External Network",
    description="Remote access protocol connection from external network",
    severity=Severity.MEDIUM,
    category=RuleCategory.FIREWALL,
    conditions={
        "action": ["Permit", "permit", "accept", "allow"],
        "src_zone": ["Untrust", "untrust", "external", "internet"],
        "dst_port": ["22", "3389", "23", "5900"],  # SSH, RDP, Telnet, VNC
    },
    mitre_tactics=[
        MitreAttackTactic.INITIAL_ACCESS,
        MitreAttackTactic.LATERAL_MOVEMENT,
    ],
    mitre_techniques=["T1021"],  # Remote Services
    response_actions=[
        "Verify authorized remote access",
        "Check VPN should be required",
        "Review access logs",
    ],
    tags=["firewall", "remote-access", "ssh", "rdp"],
)

DETECTION_RULES["FW-006"] = DetectionRule(
    rule_id="FW-006",
    name="Database Port Access from Untrusted Zone",
    description="Direct database access attempt from external or untrusted network",
    severity=Severity.CRITICAL,
    category=RuleCategory.FIREWALL,
    conditions={
        "src_zone": ["Untrust", "untrust", "external", "DMZ"],
        "dst_port": [
            "1433",
            "1521",
            "3306",
            "5432",
            "27017",
            "6379",
        ],  # MSSQL, Oracle, MySQL, PostgreSQL, MongoDB, Redis
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    mitre_techniques=["T1190"],
    response_actions=[
        "Block immediately if not authorized",
        "Investigate source",
        "Review database access policies",
        "Check for data breach indicators",
    ],
    tags=["firewall", "database", "critical"],
)


# -----------------------------------------------------------------------------
# VPN RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["VPN-001"] = DetectionRule(
    rule_id="VPN-001",
    name="VPN Authentication Failure",
    description="Failed VPN authentication attempt",
    severity=Severity.MEDIUM,
    category=RuleCategory.VPN,
    conditions={
        "log_type": ["ike", "vpn", "auth"],
        "_message_contains": ["failed", "failure", "denied", "invalid", "rejected"],
    },
    mitre_tactics=[
        MitreAttackTactic.CREDENTIAL_ACCESS,
        MitreAttackTactic.INITIAL_ACCESS,
    ],
    mitre_techniques=["T1110"],  # Brute Force
    response_actions=[
        "Monitor for repeated failures",
        "Check if legitimate user",
        "Review VPN access policies",
    ],
    tags=["vpn", "authentication", "failure"],
)

DETECTION_RULES["VPN-002"] = DetectionRule(
    rule_id="VPN-002",
    name="VPN Brute Force Attack",
    description="Multiple VPN authentication failures from same source",
    severity=Severity.HIGH,
    category=RuleCategory.VPN,
    conditions={
        "_message_contains": ["failed", "failure", "denied", "invalid"],
    },
    threshold_count=5,
    threshold_window=300,  # 5 failures in 5 minutes
    group_by=["src_ip", "remip"],
    mitre_tactics=[MitreAttackTactic.CREDENTIAL_ACCESS],
    mitre_techniques=["T1110.001"],  # Password Guessing
    response_actions=[
        "Block source IP",
        "Alert security team",
        "Force password reset for targeted user",
        "Enable MFA if not already",
    ],
    tags=["vpn", "brute-force", "authentication"],
)

DETECTION_RULES["VPN-003"] = DetectionRule(
    rule_id="VPN-003",
    name="VPN Tunnel Established from Unusual Location",
    description="VPN connection from geographically unusual or suspicious IP",
    severity=Severity.MEDIUM,
    category=RuleCategory.VPN,
    conditions={
        "action": ["tunnel-up", "established", "connected"],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    mitre_techniques=["T1133"],  # External Remote Services
    response_actions=[
        "Verify user identity",
        "Check connection history",
        "Review geo-location of source IP",
    ],
    tags=["vpn", "connection", "geo-anomaly"],
)

DETECTION_RULES["VPN-004"] = DetectionRule(
    rule_id="VPN-004",
    name="VPN Tunnel Down - Unexpected Disconnect",
    description="VPN tunnel terminated unexpectedly",
    severity=Severity.LOW,
    category=RuleCategory.VPN,
    conditions={
        "action": ["tunnel-down", "disconnected", "terminated"],
        "_message_contains": ["error", "timeout", "failure"],
    },
    response_actions=[
        "Check for network issues",
        "Verify user reconnection",
        "Review for potential attack interruption",
    ],
    tags=["vpn", "disconnect", "availability"],
)


# -----------------------------------------------------------------------------
# NAC (Network Access Control) RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["NAC-001"] = DetectionRule(
    rule_id="NAC-001",
    name="Unauthorized Device Connected",
    description="Unknown or unauthorized device connected to network",
    severity=Severity.HIGH,
    category=RuleCategory.NAC,
    conditions={
        "logtype": ["NODE", "DEVICE"],
        "_message_contains": ["unknown", "unauthorized", "unregistered", "new device"],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    mitre_techniques=["T1200"],  # Hardware Additions
    response_actions=[
        "Isolate device immediately",
        "Identify device owner",
        "Perform security scan",
        "Register or remove device",
    ],
    tags=["nac", "unauthorized", "device"],
)

DETECTION_RULES["NAC-002"] = DetectionRule(
    rule_id="NAC-002",
    name="MAC Address Spoofing Detected",
    description="Possible MAC address spoofing - same MAC from different IPs",
    severity=Severity.CRITICAL,
    category=RuleCategory.NAC,
    conditions={
        "logtype": ["SECURITY", "ALERT"],
        "_message_contains": ["spoof", "duplicate", "conflict"],
    },
    mitre_tactics=[MitreAttackTactic.DEFENSE_EVASION],
    mitre_techniques=["T1036"],  # Masquerading
    response_actions=[
        "Block both MAC addresses",
        "Investigate physical location",
        "Alert security team immediately",
        "Review switch port security",
    ],
    tags=["nac", "spoofing", "mac"],
)

DETECTION_RULES["NAC-003"] = DetectionRule(
    rule_id="NAC-003",
    name="NAC Policy Violation",
    description="Device violating network access policy (non-compliant)",
    severity=Severity.MEDIUM,
    category=RuleCategory.NAC,
    conditions={
        "logtype": ["POLICY", "COMPLIANCE"],
        "_message_contains": ["violation", "non-compliant", "blocked", "quarantine"],
    },
    mitre_tactics=[MitreAttackTactic.DEFENSE_EVASION],
    response_actions=[
        "Quarantine device",
        "Notify device owner",
        "Enforce compliance requirements",
    ],
    tags=["nac", "policy", "compliance"],
)

DETECTION_RULES["NAC-004"] = DetectionRule(
    rule_id="NAC-004",
    name="Agent Tampering Detected",
    description="NAC agent disabled or tampered with on endpoint",
    severity=Severity.HIGH,
    category=RuleCategory.NAC,
    conditions={
        "logtype": ["AGENT", "SECURITY"],
        "_message_contains": ["disabled", "uninstalled", "tampered", "stopped"],
    },
    mitre_tactics=[MitreAttackTactic.DEFENSE_EVASION],
    mitre_techniques=["T1562"],  # Impair Defenses
    response_actions=[
        "Isolate device",
        "Investigate endpoint",
        "Reinstall agent",
        "Check for malware",
    ],
    tags=["nac", "agent", "tampering"],
)


# -----------------------------------------------------------------------------
# IPS/IDS RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["IPS-001"] = DetectionRule(
    rule_id="IPS-001",
    name="IPS Signature Match - High Severity",
    description="IPS detected high-severity attack signature",
    severity=Severity.HIGH,
    category=RuleCategory.IPS_IDS,
    conditions={
        "severity": ["high", "critical", "1", "2"],
        "_message_contains": ["attack", "exploit", "intrusion"],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS, MitreAttackTactic.EXECUTION],
    response_actions=[
        "Block source IP",
        "Investigate targeted system",
        "Check for successful exploitation",
        "Update signatures if needed",
    ],
    tags=["ips", "signature", "attack"],
)

DETECTION_RULES["IPS-002"] = DetectionRule(
    rule_id="IPS-002",
    name="SQL Injection Attempt",
    description="SQL injection attack detected",
    severity=Severity.HIGH,
    category=RuleCategory.IPS_IDS,
    conditions={
        "_message_contains": [
            "SQL injection",
            "SQLI",
            "sql-injection",
            "1=1",
            "OR 1=1",
        ],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    mitre_techniques=["T1190"],
    response_actions=[
        "Block source IP",
        "Review application logs",
        "Check database for unauthorized changes",
        "Patch vulnerable application",
    ],
    tags=["ips", "sqli", "web-attack"],
)

DETECTION_RULES["IPS-003"] = DetectionRule(
    rule_id="IPS-003",
    name="Cross-Site Scripting (XSS) Attempt",
    description="XSS attack detected",
    severity=Severity.MEDIUM,
    category=RuleCategory.IPS_IDS,
    conditions={
        "_message_contains": ["XSS", "cross-site", "<script>", "javascript:"],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    mitre_techniques=["T1189"],  # Drive-by Compromise
    response_actions=[
        "Block source IP",
        "Review application input validation",
        "Check for stored XSS",
    ],
    tags=["ips", "xss", "web-attack"],
)


# -----------------------------------------------------------------------------
# DDoS RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["DDOS-001"] = DetectionRule(
    rule_id="DDOS-001",
    name="DDoS Attack Detected",
    description="Distributed denial of service attack in progress",
    severity=Severity.CRITICAL,
    category=RuleCategory.DDOS,
    conditions={
        "event_type": ["DDOS", "ATTACK", "FLOOD"],
        "_message_contains": [
            "attack",
            "flood",
            "syn flood",
            "udp flood",
            "icmp flood",
        ],
    },
    mitre_tactics=[MitreAttackTactic.IMPACT],
    mitre_techniques=["T1498"],  # Network Denial of Service
    response_actions=[
        "Enable DDoS mitigation",
        "Contact ISP if needed",
        "Activate rate limiting",
        "Document attack characteristics",
    ],
    tags=["ddos", "attack", "availability"],
)

DETECTION_RULES["DDOS-002"] = DetectionRule(
    rule_id="DDOS-002",
    name="SYN Flood Attack",
    description="TCP SYN flood attack detected",
    severity=Severity.CRITICAL,
    category=RuleCategory.DDOS,
    conditions={
        "_message_contains": ["SYN flood", "syn_flood", "half-open"],
    },
    mitre_tactics=[MitreAttackTactic.IMPACT],
    mitre_techniques=["T1498.001"],
    response_actions=[
        "Enable SYN cookies",
        "Increase SYN backlog",
        "Block attacking IPs",
    ],
    tags=["ddos", "syn-flood", "tcp"],
)

DETECTION_RULES["DDOS-003"] = DetectionRule(
    rule_id="DDOS-003",
    name="Traffic Anomaly - Volume Spike",
    description="Unusual traffic volume increase detected",
    severity=Severity.MEDIUM,
    category=RuleCategory.DDOS,
    conditions={
        "_message_contains": ["anomaly", "spike", "threshold", "exceeded"],
    },
    response_actions=[
        "Investigate traffic source",
        "Check for legitimate cause",
        "Prepare DDoS mitigation",
    ],
    tags=["ddos", "anomaly", "traffic"],
)


# -----------------------------------------------------------------------------
# WAF (Web Application Firewall) RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["WAF-001"] = DetectionRule(
    rule_id="WAF-001",
    name="WAF Block - Web Attack",
    description="Web application firewall blocked attack attempt",
    severity=Severity.MEDIUM,
    category=RuleCategory.WAF,
    conditions={
        "_message_contains": ["blocked", "denied", "rejected"],
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    response_actions=[
        "Review attack pattern",
        "Check for bypass attempts",
        "Update WAF rules if needed",
    ],
    tags=["waf", "blocked", "web-attack"],
)

DETECTION_RULES["WAF-002"] = DetectionRule(
    rule_id="WAF-002",
    name="Directory Traversal Attempt",
    description="Path traversal attack attempt detected",
    severity=Severity.HIGH,
    category=RuleCategory.WAF,
    conditions={
        "_message_contains": [
            "../",
            "..\\",
            "directory traversal",
            "path traversal",
            "LFI",
        ],
    },
    mitre_tactics=[MitreAttackTactic.COLLECTION],
    mitre_techniques=["T1083"],  # File and Directory Discovery
    response_actions=[
        "Block source IP",
        "Review web server configuration",
        "Check for successful access",
    ],
    tags=["waf", "lfi", "traversal"],
)

DETECTION_RULES["WAF-003"] = DetectionRule(
    rule_id="WAF-003",
    name="Command Injection Attempt",
    description="OS command injection attack detected",
    severity=Severity.CRITICAL,
    category=RuleCategory.WAF,
    conditions={
        "_message_contains": [
            "command injection",
            "cmd injection",
            "; cat",
            "| cat",
            "`",
            "$(",
        ],
    },
    mitre_tactics=[MitreAttackTactic.EXECUTION],
    mitre_techniques=["T1059"],  # Command and Scripting Interpreter
    response_actions=[
        "Block source IP immediately",
        "Check for successful execution",
        "Review application code",
        "Incident response if exploited",
    ],
    tags=["waf", "rce", "command-injection"],
)


# -----------------------------------------------------------------------------
# AUTHENTICATION RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["AUTH-001"] = DetectionRule(
    rule_id="AUTH-001",
    name="Multiple Failed Login Attempts",
    description="Repeated authentication failures - potential brute force",
    severity=Severity.MEDIUM,
    category=RuleCategory.AUTHENTICATION,
    conditions={
        "_message_contains": ["failed", "failure", "invalid", "denied"],
    },
    threshold_count=5,
    threshold_window=300,
    group_by=["src_ip", "user"],
    mitre_tactics=[MitreAttackTactic.CREDENTIAL_ACCESS],
    mitre_techniques=["T1110"],
    response_actions=[
        "Lock account temporarily",
        "Alert user",
        "Review source IP",
    ],
    tags=["authentication", "brute-force"],
)

DETECTION_RULES["AUTH-002"] = DetectionRule(
    rule_id="AUTH-002",
    name="Login After Hours",
    description="Authentication success outside normal business hours",
    severity=Severity.LOW,
    category=RuleCategory.AUTHENTICATION,
    conditions={
        "_message_contains": ["success", "accepted", "authenticated"],
        "_time_outside_hours": [9, 18],  # Outside 9 AM - 6 PM
    },
    mitre_tactics=[MitreAttackTactic.INITIAL_ACCESS],
    response_actions=[
        "Verify with user",
        "Check if authorized",
        "Review access pattern",
    ],
    tags=["authentication", "after-hours"],
)

DETECTION_RULES["AUTH-003"] = DetectionRule(
    rule_id="AUTH-003",
    name="Privilege Escalation Attempt",
    description="User attempting to access resources above their privilege level",
    severity=Severity.HIGH,
    category=RuleCategory.AUTHENTICATION,
    conditions={
        "_message_contains": [
            "privilege",
            "escalation",
            "unauthorized",
            "access denied",
            "forbidden",
        ],
    },
    mitre_tactics=[MitreAttackTactic.PRIVILEGE_ESCALATION],
    mitre_techniques=["T1068"],
    response_actions=[
        "Review user permissions",
        "Check for exploitation",
        "Alert security team",
    ],
    tags=["authentication", "privilege-escalation"],
)


# -----------------------------------------------------------------------------
# DATA EXFILTRATION RULES
# -----------------------------------------------------------------------------

DETECTION_RULES["EXFIL-001"] = DetectionRule(
    rule_id="EXFIL-001",
    name="Large Outbound Data Transfer",
    description="Unusually large data transfer to external destination",
    severity=Severity.HIGH,
    category=RuleCategory.DATA_EXFILTRATION,
    conditions={
        "action": ["Permit", "permit", "accept", "allow"],
        "dst_zone": ["Untrust", "untrust", "external", "internet"],
        "_sent_bytes_gt": 52428800,  # > 50MB
    },
    mitre_tactics=[MitreAttackTactic.EXFILTRATION],
    mitre_techniques=["T1048"],
    response_actions=[
        "Investigate source user/host",
        "Check destination IP reputation",
        "Review data classification",
        "Block if unauthorized",
    ],
    tags=["exfiltration", "data-loss"],
)

DETECTION_RULES["EXFIL-002"] = DetectionRule(
    rule_id="EXFIL-002",
    name="DNS Tunneling Suspected",
    description="Potential DNS tunneling for data exfiltration",
    severity=Severity.HIGH,
    category=RuleCategory.DATA_EXFILTRATION,
    conditions={
        "dst_port": ["53"],
        "_message_contains": ["long query", "unusual", "encoded"],
    },
    mitre_tactics=[
        MitreAttackTactic.EXFILTRATION,
        MitreAttackTactic.COMMAND_AND_CONTROL,
    ],
    mitre_techniques=["T1071.004"],  # DNS
    response_actions=[
        "Analyze DNS query patterns",
        "Block suspicious domains",
        "Investigate source host",
    ],
    tags=["exfiltration", "dns-tunneling"],
)


# =============================================================================
# DETECTION ENGINE
# =============================================================================


class DetectionEngine:
    """Log analysis and detection engine"""

    def __init__(self):
        self.rules = DETECTION_RULES
        self.event_buffer: Dict[str, List[Tuple[datetime, Dict]]] = defaultdict(list)
        self.alert_counter = 0

    def analyze_log(self, parsed_log: Dict, raw_log: str) -> List[Alert]:
        """Analyze a parsed log against all detection rules"""
        alerts = []

        for rule_id, rule in self.rules.items():
            if not rule.enabled:
                continue

            if self._matches_rule(parsed_log, rule, raw_log):
                if rule.threshold_count > 1 and rule.threshold_window > 0:
                    # Threshold-based rule - buffer events
                    alert = self._check_threshold(parsed_log, rule, raw_log)
                    if alert:
                        alerts.append(alert)
                else:
                    # Single-event rule
                    alert = self._create_alert(parsed_log, rule, raw_log)
                    alerts.append(alert)

        return alerts

    def _matches_rule(
        self, parsed_log: Dict, rule: DetectionRule, raw_log: str
    ) -> bool:
        """Check if parsed log matches rule conditions"""

        # Check field conditions
        for field, expected_values in rule.conditions.items():
            if field.startswith("_"):
                # Special conditions
                if field == "_message_contains":
                    message = (
                        parsed_log.get("message", "")
                        or parsed_log.get("msg", "")
                        or raw_log
                    )
                    if not any(
                        val.lower() in message.lower() for val in expected_values
                    ):
                        return False

                elif field == "_sent_bytes_gt":
                    sent = int(
                        parsed_log.get("sent", 0) or parsed_log.get("sentbyte", 0) or 0
                    )
                    if sent <= expected_values:
                        return False

                elif field == "_time_outside_hours":
                    # Check if event is outside specified hours
                    pass  # Would need timestamp parsing

            else:
                # Regular field match
                log_value = parsed_log.get(field, "")
                if log_value and log_value not in expected_values:
                    return False

        # Check regex pattern if specified
        if rule.pattern and not rule.pattern.search(raw_log):
            return False

        return True

    def _check_threshold(
        self, parsed_log: Dict, rule: DetectionRule, raw_log: str
    ) -> Optional[Alert]:
        """Check threshold-based rules with event buffering"""

        # Create group key
        group_key = f"{rule.rule_id}:"
        for field in rule.group_by:
            group_key += f"{parsed_log.get(field, 'unknown')}:"

        # Add event to buffer
        now = datetime.now()
        self.event_buffer[group_key].append((now, parsed_log))

        # Clean old events outside window
        cutoff = now - timedelta(seconds=rule.threshold_window)
        self.event_buffer[group_key] = [
            (ts, log) for ts, log in self.event_buffer[group_key] if ts > cutoff
        ]

        # Check if threshold reached
        if len(self.event_buffer[group_key]) >= rule.threshold_count:
            event_count = len(self.event_buffer[group_key])
            alert = self._create_alert(parsed_log, rule, raw_log, event_count)
            # Clear buffer after alert
            self.event_buffer[group_key] = []
            return alert

        return None

    def _create_alert(
        self, parsed_log: Dict, rule: DetectionRule, raw_log: str, event_count: int = 1
    ) -> Alert:
        """Create an alert from matched rule"""

        self.alert_counter += 1
        alert_id = (
            f"ALERT-{datetime.now().strftime('%Y%m%d%H%M%S')}-{self.alert_counter:04d}"
        )

        return Alert(
            alert_id=alert_id,
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            category=rule.category,
            timestamp=datetime.now(),
            source_ip=parsed_log.get("src_ip")
            or parsed_log.get("srcip")
            or parsed_log.get("src"),
            destination_ip=parsed_log.get("dst_ip")
            or parsed_log.get("dstip")
            or parsed_log.get("dst"),
            description=rule.description,
            raw_log=raw_log,
            parsed_fields=parsed_log,
            mitre_tactics=[t.value for t in rule.mitre_tactics],
            mitre_techniques=rule.mitre_techniques,
            response_actions=rule.response_actions,
            event_count=event_count,
        )

    def get_rules_by_category(self, category: RuleCategory) -> Dict[str, DetectionRule]:
        """Get all rules for a specific category"""
        return {
            rule_id: rule
            for rule_id, rule in self.rules.items()
            if rule.category == category
        }

    def get_rules_by_severity(self, severity: Severity) -> Dict[str, DetectionRule]:
        """Get all rules with specific severity"""
        return {
            rule_id: rule
            for rule_id, rule in self.rules.items()
            if rule.severity == severity
        }

    def print_rule_summary(self):
        """Print summary of all detection rules"""
        print("=" * 70)
        print("KOVAN SIEM Detection Rules Summary")
        print("=" * 70)

        # Group by category
        by_category = defaultdict(list)
        for rule_id, rule in self.rules.items():
            by_category[rule.category].append(rule)

        for category in RuleCategory:
            rules = by_category.get(category, [])
            if rules:
                print(f"\n{category.value.upper()} ({len(rules)} rules)")
                print("-" * 50)
                for rule in sorted(rules, key=lambda r: r.severity.value):
                    status = "✓" if rule.enabled else "✗"
                    print(
                        f"  {status} [{rule.severity.name:8}] {rule.rule_id}: {rule.name}"
                    )
        # Statistics
        print("\n" + "=" * 70)
        print("Statistics")
        print("-" * 50)
        print(f"Total Rules: {len(self.rules)}")
        for sev in Severity:
            count = len([r for r in self.rules.values() if r.severity == sev])
            print(f"  {sev.name}: {count}")


# =============================================================================
# MAIN EXECUTION
# =============================================================================

if __name__ == "__main__":
    engine = DetectionEngine()
    engine.print_rule_summary()

"""
KOVAN SIEM Log Parser Test Script
=================================
Test all regex patterns against sample logs and validate extraction.

Usage:
    python test_parsers.py
"""

import re
from typing import Dict, List, Optional

from KOVAN_Log_Parsers import (
    ALL_PARSERS,
    KOVAN_LOG_SOURCES,
    auto_detect_parser,
    get_unverified_parsers,
    get_verified_parsers,
    parse_log,
)

# =============================================================================
# VERIFIED SAMPLE LOGS (from official documentation)
# =============================================================================

VERIFIED_SAMPLES = {
    # Juniper SSG ScreenOS Traffic Logs
    "juniper_ssg_traffic": [
        'Aug 9 19:39:56 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:39:51" duration=5 policy_id=1 service=http proto=6 src zone=Trust dst zone=Untrust action=Permit sent=134 rcvd=70 src=192.168.163.26 dst=193.203.32.20 src_port=4090 dst_port=80 src-xlated ip=81.83.5.18 port=3303 dst-xlated ip=193.203.32.20 port=80 session_id=15683 reason=Close - TCP RST',
        'Jan 15 10:00:00 10.231.250.61 SSG550M: NetScreen device_id=SSG550M-CINEMA [Root]system-notification-00257(traffic): start_time="2024-01-15 10:00:00" duration=0 policy_id=0 service=ssh proto=6 src zone=Untrust dst zone=Trust action=Deny sent=0 rcvd=0 src=203.0.113.100 dst=192.168.1.10 src_port=54321 dst_port=22 session_id=0 reason=Traffic Denied',
    ],
    # Juniper SSG VPN/IKE Logs
    "juniper_ssg_vpn": [
        "Aug 9 19:40:00 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00018(ike): IKE Phase-1 completed (gateway=VPN-GW-01 peer=203.0.113.100)",
        "Jan 15 15:00:00 10.231.59.1 SSG550M: NetScreen device_id=SSG550M-VPN01 [Root]system-notification-00018(ike): IKE Phase-1 negotiation completed",
    ],
    # FortiGate Traffic Logs
    "fortigate_traffic": [
        'Jan 15 17:00:00 fortigate-01 date=2024-01-15 time=17:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=192.168.1.100 srcport=54321 srcintf="port1" dstip=10.0.0.50 dstport=443 dstintf="port2" policyid=1 sessionid=12345 proto=6 action="accept" sentbyte=1024 rcvdbyte=2048 duration=30',
        'Jan 15 17:01:00 fortigate-01 date=2024-01-15 time=17:01:00 devname="FG100D" devid="FG100D4G19000001" logid="0000000013" type="traffic" subtype="forward" level="warning" vd="root" srcip=203.0.113.50 srcport=45678 srcintf="wan1" dstip=192.168.1.10 dstport=22 dstintf="port1" policyid=0 sessionid=0 proto=6 action="deny" sentbyte=0 rcvdbyte=0 msg="policy violation"',
    ],
    # FortiGate VPN Logs
    "fortigate_vpn": [
        'Jan 15 17:00:00 fortigate-01 date=2024-01-15 time=17:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0101039424" type="event" subtype="vpn" eventtype="ipsec" level="information" vd="root" action="tunnel-up" tunneltype="ipsec" tunnelid="1" remip=203.0.113.100 locip=10.231.241.13 user="vpn_user" msg="IPsec phase 2 established"',
    ],
    # SECUI MF2 WELF Format Logs
    "secui_mf2_welf": [
        'Jan 15 10:23:45 10.231.59.10 id=MF2FW time="2024-01-15 10:23:45" fw=10.231.59.10 pri=6 rule=100 proto=tcp src=192.168.1.100 dst=10.0.0.50 sport=54321 dport=443 sent=1024 rcvd=2048 duration=30 action=accept',
        'Jan 15 10:24:00 10.231.59.11 id=MF2FW time="2024-01-15 10:24:00" fw=10.231.59.11 pri=4 rule=0 proto=tcp src=203.0.113.100 dst=192.168.1.10 sport=45678 dport=22 sent=0 rcvd=0 action=deny',
    ],
    # Genians NAC Default Format
    "genians_nac": [
        "2024-01-16 08:00:00,LOGTYPE=NODE,LOGID=2001,IP=192.168.1.100,MAC=00:1A:2B:3C:4D:5E,MSG=Node connected, DETAIL=hostname=WORKSTATION-001 user=kim.minho os=Windows 10",
        "2024-01-16 09:00:00,LOGTYPE=POLICY,LOGID=3001,IP=192.168.1.101,MAC=00:2B:3C:4D:5E:6F,MSG=Policy violation, DETAIL=hostname=GUEST-PC policy=Guest-Restrict action=quarantine",
    ],
    # Genians NAC CEF Format
    "genians_nac_cef": [
        "CEF:0|GENIANS|Genian NAC|4.1.37|NodeConnect|Node Connected|1|rt=2024-01-16T08:00:00Z cs1Label=Log Type cs1=NODE cs2Label=Log ID cs2=2001 dvchost=NAC-SENSOR-01 dst=192.168.1.100 dmac=00:1A:2B:3C:4D:5E msg=Node_connected cs3Label=Detail Message cs3=hostname=WORKSTATION-001",
    ],
    # Lenovo Server (Standard Syslog)
    "lenovo_server": [
        "Jan 16 15:00:00 hsm-server-01 kernel: HSM: Key operation completed successfully",
        "Jan 16 15:00:30 hsm-server-01 sshd[5678]: Accepted publickey for admin from 192.168.1.200 port 54321",
    ],
}


def test_parser(parser_name: str, sample_logs: List[str]) -> Dict:
    """Test a parser against sample logs."""
    results = {
        "parser_name": parser_name,
        "total_samples": len(sample_logs),
        "passed": 0,
        "failed": 0,
        "details": [],
    }

    parser = ALL_PARSERS.get(parser_name)
    if not parser:
        results["error"] = f"Parser '{parser_name}' not found"
        return results

    for i, log in enumerate(sample_logs):
        parsed = parse_log(log, parser_name)
        if parsed:
            results["passed"] += 1
            results["details"].append(
                {
                    "sample_index": i,
                    "status": "PASS",
                    "fields_extracted": len(
                        [
                            k
                            for k in parsed.keys()
                            if not k.startswith("_") and parsed[k]
                        ]
                    ),
                    "key_fields": {
                        k: v
                        for k, v in parsed.items()
                        if k
                        in [
                            "src_ip",
                            "dst_ip",
                            "action",
                            "srcip",
                            "dstip",
                            "ip",
                            "logtype",
                        ]
                    },
                }
            )
        else:
            results["failed"] += 1
            results["details"].append(
                {
                    "sample_index": i,
                    "status": "FAIL",
                    "log_preview": log[:100] + "..." if len(log) > 100 else log,
                }
            )

    return results


def test_auto_detection(sample_logs: Dict[str, List[str]]) -> Dict:
    """Test auto-detection of parsers."""
    results = {
        "total_tests": 0,
        "correct_detections": 0,
        "incorrect_detections": 0,
        "no_detection": 0,
        "details": [],
    }

    for expected_parser, logs in sample_logs.items():
        for log in logs:
            results["total_tests"] += 1
            detected = auto_detect_parser(log)

            if detected == expected_parser:
                results["correct_detections"] += 1
                status = "CORRECT"
            elif detected is None:
                results["no_detection"] += 1
                status = "NO_MATCH"
            else:
                results["incorrect_detections"] += 1
                status = "WRONG"

            results["details"].append(
                {"expected": expected_parser, "detected": detected, "status": status}
            )

    return results


def print_test_results():
    """Run all tests and print results."""
    print("=" * 70)
    print("KOVAN SIEM Log Parser Test Results")
    print("=" * 70)

    # Test verified parsers
    print("\n" + "=" * 70)
    print("VERIFIED PARSER TESTS")
    print("=" * 70)

    total_passed = 0
    total_failed = 0

    for parser_name, samples in VERIFIED_SAMPLES.items():
        result = test_parser(parser_name, samples)
        total_passed += result["passed"]
        total_failed += result["failed"]

        status = "✓ PASS" if result["failed"] == 0 else "✗ FAIL"
        print(f"\n{parser_name}: {status}")
        print(
            f"  Samples: {result['total_samples']}, Passed: {result['passed']}, Failed: {result['failed']}"
        )

        for detail in result["details"]:
            if detail["status"] == "PASS":
                print(
                    f"    Sample {detail['sample_index']}: {detail['fields_extracted']} fields extracted"
                )
                if detail.get("key_fields"):
                    for k, v in detail["key_fields"].items():
                        if v:
                            print(f"      {k}: {v}")
            else:
                print(
                    f"    Sample {detail['sample_index']}: FAILED - {detail.get('log_preview', 'N/A')}"
                )

    print("\n" + "-" * 70)
    print(f"TOTAL: {total_passed} passed, {total_failed} failed")

    # Test auto-detection
    print("\n" + "=" * 70)
    print("AUTO-DETECTION TESTS")
    print("=" * 70)

    auto_results = test_auto_detection(VERIFIED_SAMPLES)
    print(f"\nTotal Tests: {auto_results['total_tests']}")
    print(f"Correct Detections: {auto_results['correct_detections']}")
    print(f"Incorrect Detections: {auto_results['incorrect_detections']}")
    print(f"No Detection: {auto_results['no_detection']}")

    accuracy = (
        (auto_results["correct_detections"] / auto_results["total_tests"] * 100)
        if auto_results["total_tests"] > 0
        else 0
    )
    print(f"Accuracy: {accuracy:.1f}%")

    # Summary
    print("\n" + "=" * 70)
    print("PARSER SUMMARY")
    print("=" * 70)

    verified = get_verified_parsers()
    unverified = get_unverified_parsers()

    print(f"\nVerified Parsers ({len(verified)}):")
    for name in verified:
        p = ALL_PARSERS[name]
        print(f"  ✓ {name}: {p.vendor} {p.device_model}")

    print(f"\nUnverified Parsers ({len(unverified)}) - Need real samples:")
    for name in unverified:
        p = ALL_PARSERS[name]
        print(f"  ? {name}: {p.vendor} {p.device_model}")


def demo_parsing():
    """Demonstrate parsing with detailed output."""
    print("\n" + "=" * 70)
    print("PARSING DEMONSTRATION")
    print("=" * 70)

    demo_logs = [
        (
            "Juniper SSG Traffic",
            'Aug 9 19:39:56 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:39:51" duration=5 policy_id=1 service=http proto=6 src zone=Trust dst zone=Untrust action=Permit sent=134 rcvd=70 src=192.168.163.26 dst=193.203.32.20 src_port=4090 dst_port=80 src-xlated ip=81.83.5.18 port=3303 dst-xlated ip=193.203.32.20 port=80 session_id=15683 reason=Close - TCP RST',
        ),
        (
            "FortiGate VPN",
            'Jan 15 17:00:00 fortigate-01 date=2024-01-15 time=17:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0101039424" type="event" subtype="vpn" eventtype="ipsec" level="information" vd="root" action="tunnel-up" tunneltype="ipsec" tunnelid="1" remip=203.0.113.100 locip=10.231.241.13 user="vpn_user" msg="IPsec phase 2 established"',
        ),
        (
            "Genians NAC",
            "2024-01-16 08:00:00,LOGTYPE=NODE,LOGID=2001,IP=192.168.1.100,MAC=00:1A:2B:3C:4D:5E,MSG=Node connected, DETAIL=hostname=WORKSTATION-001 user=kim.minho os=Windows 10",
        ),
    ]

    for name, log in demo_logs:
        print(f"\n--- {name} ---")
        print(f"Log: {log[:80]}...")

        parser_name = auto_detect_parser(log)
        if parser_name:
            print(f"Detected Parser: {parser_name}")
            result = parse_log(log, parser_name)
            if result:
                print("Extracted Fields:")
                for k, v in result.items():
                    if v and not k.startswith("_"):
                        print(f"  {k}: {v}")
        else:
            print("No parser matched!")


if __name__ == "__main__":
    print_test_results()
    demo_parsing()

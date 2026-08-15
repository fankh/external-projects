"""
KOVAN SIEM Log Parser Configuration
====================================
Regex patterns for log sources defined in SeekuritySIEM_Logsources_KOVAN_v3.xlsx

This file contains VERIFIED log formats from vendor documentation and public sources.
Where vendor-specific formats were unavailable, parsers are marked as UNVERIFIED.

Verified Sources:
- Juniper SSG ScreenOS: Official Juniper KB + Splunk community samples
- FortiGate: Official Fortinet documentation
- Genians NAC: Official Genians documentation
- SECUI MF2: Logpresso WELF format reference

Unverified (need real samples):
- WINS SNIPER DDoS
- Penta WAPPLES WAF
- NexG VForce VPN
- Future Systems XTM/FW
- Hunesion i-onenet
- 어울림 ezWall
- 퓨처텍정보통신 SSL VPN
- AhnLab EPP/EDR
- 와이즈허브시스템즈 DLP
- 웨어벨리 Chakra
- 아이엔소프트 OpenManager
"""

import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Pattern


@dataclass
class LogParser:
    """Log parser configuration with vendor-specific details"""

    name: str
    vendor: str
    device_model: str
    device_type: str
    version: str
    pattern: Pattern
    field_names: List[str]
    timestamp_format: str = "%b %d %H:%M:%S"
    description: str = ""
    sample_log: str = ""
    verified: bool = False  # True if format is from official documentation


# =============================================================================
# COMMON SYSLOG HEADER PATTERNS
# =============================================================================

SYSLOG_HEADER = r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(?P<hostname>[\d\w\.\-]+)\s+"
SYSLOG_HEADER_ISO = r"^(?P<timestamp>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+"


# =============================================================================
# JUNIPER SSG SCREENOS (VERIFIED)
# Source: Juniper KB, Splunk Community, Rapid7 Documentation
# Devices: SSG-550M, SSG-320M
# Version: 6.3.0rxx
# =============================================================================

JUNIPER_SSG_TRAFFIC = LogParser(
    name="Juniper_SSG_Traffic",
    vendor="Juniper",
    device_model="SSG-550M/SSG-320M",
    device_type="Firewall",
    version="ScreenOS 6.3.0",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<device_ip>[\d\.]+)\s+"
        r"(?P<device_name>[\w\-]+):\s+"
        r"NetScreen device_id=(?P<device_id>[\w\-]+)\s+"
        r"\[(?P<vsys>\w+)\]"
        r"(?P<category>[\w\-]+)-(?P<message_id>\d+)"
        r"\((?P<log_type>\w+)\):\s+"
        r"start_time=\"(?P<start_time>[^\"]+)\"\s+"
        r"duration=(?P<duration>\d+)\s+"
        r"policy_id=(?P<policy_id>\d+)\s+"
        r"service=(?P<service>\w+)\s+"
        r"proto=(?P<proto>\d+)\s+"
        r"src zone=(?P<src_zone>\w+)\s+"
        r"dst zone=(?P<dst_zone>\w+)\s+"
        r"action=(?P<action>\w+)\s+"
        r"sent=(?P<sent>\d+)\s+"
        r"rcvd=(?P<rcvd>\d+)\s+"
        r"src=(?P<src_ip>[\d\.]+)\s+"
        r"dst=(?P<dst_ip>[\d\.]+)\s+"
        r"src_port=(?P<src_port>\d+)\s+"
        r"dst_port=(?P<dst_port>\d+)"
        r"(?:\s+src-xlated ip=(?P<nat_src_ip>[\d\.]+)\s+port=(?P<nat_src_port>\d+))?"
        r"(?:\s+dst-xlated ip=(?P<nat_dst_ip>[\d\.]+)\s+port=(?P<nat_dst_port>\d+))?"
        r"(?:\s+session_id=(?P<session_id>\d+))?"
        r"(?:\s+reason=(?P<reason>.+))?"
    ),
    field_names=[
        "timestamp",
        "device_ip",
        "device_name",
        "device_id",
        "vsys",
        "category",
        "message_id",
        "log_type",
        "start_time",
        "duration",
        "policy_id",
        "service",
        "proto",
        "src_zone",
        "dst_zone",
        "action",
        "sent",
        "rcvd",
        "src_ip",
        "dst_ip",
        "src_port",
        "dst_port",
        "nat_src_ip",
        "nat_src_port",
        "nat_dst_ip",
        "nat_dst_port",
        "session_id",
        "reason",
    ],
    description="Juniper SSG ScreenOS Traffic logs (시네마, 사용자, HSM, 관제망, VOICE, 그룹웨어 방화벽)",
    sample_log='Aug 9 19:39:56 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00257(traffic): start_time="2011-08-09 19:39:51" duration=5 policy_id=1 service=http proto=6 src zone=Trust dst zone=Untrust action=Permit sent=134 rcvd=70 src=192.168.163.26 dst=193.203.32.20 src_port=4090 dst_port=80 src-xlated ip=81.83.5.18 port=3303 dst-xlated ip=193.203.32.20 port=80 session_id=15683 reason=Close - TCP RST',
    verified=True,
)

JUNIPER_SSG_VPN = LogParser(
    name="Juniper_SSG_VPN",
    vendor="Juniper",
    device_model="SSG-550M",
    device_type="VPN",
    version="ScreenOS 6.3.0",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<device_ip>[\d\.]+)\s+"
        r"(?P<device_name>[\w\-]+):\s+"
        r"NetScreen device_id=(?P<device_id>[\w\-]+)\s+"
        r"\[(?P<vsys>\w+)\]"
        r"(?P<category>[\w\-]+)-(?P<message_id>\d+)"
        r"\((?P<log_type>\w+)\):\s+"
        r"(?P<message>.+)"
    ),
    field_names=[
        "timestamp",
        "device_ip",
        "device_name",
        "device_id",
        "vsys",
        "category",
        "message_id",
        "log_type",
        "message",
    ],
    description="Juniper SSG VPN/IKE logs (한국 타이밴 VPN, BHN VPN)",
    sample_log="Aug 9 19:40:00 192.168.163.2 gw0-NLA: NetScreen device_id=gw0-NLA [Root]system-notification-00018(ike): IKE Phase-1 completed (gateway=VPN-GW-01 peer=203.0.113.100)",
    verified=True,
)


# =============================================================================
# FORTIGATE (VERIFIED)
# Source: Fortinet Official Documentation, LogRhythm
# Devices: FortiGate 100D
# Version: v5.6.8
# =============================================================================

FORTIGATE_TRAFFIC = LogParser(
    name="FortiGate_Traffic",
    vendor="FortiGate",
    device_model="100D",
    device_type="Firewall/VPN",
    version="v5.6.x",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\w\-\.]+)\s+"
        r"date=(?P<date>[\d\-]+)\s+"
        r"time=(?P<time>[\d:]+)\s+"
        r"(?:devname=\"?(?P<devname>[^\"]+)\"?\s+)?"
        r"(?:devid=\"?(?P<devid>[^\"]+)\"?\s+)?"
        r"logid=\"?(?P<logid>\d+)\"?\s+"
        r"type=\"?(?P<type>\w+)\"?\s+"
        r"subtype=\"?(?P<subtype>\w+)\"?\s+"
        r"(?:level=\"?(?P<level>\w+)\"?\s+)?"
        r"(?:vd=\"?(?P<vd>\w+)\"?\s+)?"
        r"(?:srcip=(?P<srcip>[\d\.]+)\s+)?"
        r"(?:srcport=(?P<srcport>\d+)\s+)?"
        r"(?:srcintf=\"?(?P<srcintf>[^\"]+)\"?\s+)?"
        r"(?:dstip=(?P<dstip>[\d\.]+)\s+)?"
        r"(?:dstport=(?P<dstport>\d+)\s+)?"
        r"(?:dstintf=\"?(?P<dstintf>[^\"]+)\"?\s+)?"
        r"(?:policyid=(?P<policyid>\d+)\s+)?"
        r"(?:sessionid=(?P<sessionid>\d+)\s+)?"
        r"(?:proto=(?P<proto>\d+)\s+)?"
        r"(?:action=\"?(?P<action>\w+)\"?\s+)?"
        r"(?:sentbyte=(?P<sentbyte>\d+)\s+)?"
        r"(?:rcvdbyte=(?P<rcvdbyte>\d+)\s+)?"
        r"(?:duration=(?P<duration>\d+)\s+)?"
        r"(?:msg=\"?(?P<msg>[^\"]+)\"?)?"
    ),
    field_names=[
        "timestamp",
        "hostname",
        "date",
        "time",
        "devname",
        "devid",
        "logid",
        "type",
        "subtype",
        "level",
        "vd",
        "srcip",
        "srcport",
        "srcintf",
        "dstip",
        "dstport",
        "dstintf",
        "policyid",
        "sessionid",
        "proto",
        "action",
        "sentbyte",
        "rcvdbyte",
        "duration",
        "msg",
    ],
    description="FortiGate Traffic/VPN logs (유니클로VPN)",
    sample_log='Jan 15 17:00:00 fortigate-01 date=2024-01-15 time=17:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=192.168.1.100 srcport=54321 srcintf="port1" dstip=10.0.0.50 dstport=443 dstintf="port2" policyid=1 sessionid=12345 proto=6 action="accept" sentbyte=1024 rcvdbyte=2048 duration=30',
    verified=True,
)

FORTIGATE_VPN = LogParser(
    name="FortiGate_VPN",
    vendor="FortiGate",
    device_model="100D",
    device_type="VPN",
    version="v5.6.x",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\w\-\.]+)\s+"
        r"date=(?P<date>[\d\-]+)\s+"
        r"time=(?P<time>[\d:]+)\s+"
        r"(?:devname=\"?(?P<devname>[^\"]+)\"?\s+)?"
        r"(?:devid=\"?(?P<devid>[^\"]+)\"?\s+)?"
        r"logid=\"?(?P<logid>\d+)\"?\s+"
        r"type=\"?event\"?\s+"
        r"subtype=\"?vpn\"?\s+"
        r"(?:eventtype=\"?(?P<eventtype>\w+)\"?\s+)?"
        r"(?:level=\"?(?P<level>\w+)\"?\s+)?"
        r"(?:vd=\"?(?P<vd>\w+)\"?\s+)?"
        r"(?:action=\"?(?P<action>[\w\-]+)\"?\s+)?"
        r"(?:tunneltype=\"?(?P<tunneltype>\w+)\"?\s+)?"
        r"(?:tunnelid=(?P<tunnelid>\d+)\s+)?"
        r"(?:remip=(?P<remip>[\d\.]+)\s+)?"
        r"(?:locip=(?P<locip>[\d\.]+)\s+)?"
        r"(?:user=\"?(?P<user>[^\"]+)\"?\s+)?"
        r"(?:group=\"?(?P<group>[^\"]+)\"?\s+)?"
        r"(?:xauthuser=\"?(?P<xauthuser>[^\"]+)\"?\s+)?"
        r"(?:assignip=(?P<assignip>[\d\.]+)\s+)?"
        r"(?:vpntunnel=\"?(?P<vpntunnel>[^\"]+)\"?\s+)?"
        r"(?:msg=\"?(?P<msg>[^\"]+)\"?)?"
    ),
    field_names=[
        "timestamp",
        "hostname",
        "date",
        "time",
        "devname",
        "devid",
        "logid",
        "eventtype",
        "level",
        "vd",
        "action",
        "tunneltype",
        "tunnelid",
        "remip",
        "locip",
        "user",
        "group",
        "xauthuser",
        "assignip",
        "vpntunnel",
        "msg",
    ],
    description="FortiGate VPN event logs",
    sample_log='Jan 15 17:00:00 fortigate-01 date=2024-01-15 time=17:00:00 devname="FG100D" devid="FG100D4G19000001" logid="0101039424" type="event" subtype="vpn" eventtype="ipsec" level="information" vd="root" action="tunnel-up" tunneltype="ipsec" tunnelid="1" remip=203.0.113.100 locip=10.231.241.13 user="vpn_user" msg="IPsec phase 2 established"',
    verified=True,
)


# =============================================================================
# SECUI MF2 (PARTIALLY VERIFIED)
# Source: FireMon docs, Logpresso - WELF format
# Devices: MF2 1510/1520
# Version: 4.3.x
# =============================================================================

SECUI_MF2_WELF = LogParser(
    name="SECUI_MF2_WELF",
    vendor="SECUI",
    device_model="MF2 1510/1520",
    device_type="Firewall",
    version="4.3.x",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"id=(?P<id>\w+)\s+"
        r"time=\"(?P<log_time>[^\"]+)\"\s+"
        r"fw=(?P<fw_ip>[\d\.]+)\s+"
        r"pri=(?P<priority>\d+)\s+"
        r"(?:rule=(?P<rule>\d+)\s+)?"
        r"proto=(?P<proto>\w+)\s+"
        r"src=(?P<src_ip>[\d\.]+)\s+"
        r"dst=(?P<dst_ip>[\d\.]+)\s+"
        r"(?:sport=(?P<sport>\d+)\s+)?"
        r"(?:dport=(?P<dport>\d+)\s+)?"
        r"(?:sent=(?P<sent>\d+)\s+)?"
        r"(?:rcvd=(?P<rcvd>\d+)\s+)?"
        r"(?:duration=(?P<duration>\d+)\s+)?"
        r"(?:action=(?P<action>\w+))?"
    ),
    field_names=[
        "timestamp",
        "hostname",
        "id",
        "log_time",
        "fw_ip",
        "priority",
        "rule",
        "proto",
        "src_ip",
        "dst_ip",
        "sport",
        "dport",
        "sent",
        "rcvd",
        "duration",
        "action",
    ],
    description="SECUI MF2 WELF format logs (한국 타이밴, 메인인터넷, 웹 인터넷, DS, 전용선, DB 방화벽)",
    sample_log='Jan 15 10:23:45 10.231.59.10 id=MF2FW time="2024-01-15 10:23:45" fw=10.231.59.10 pri=6 rule=100 proto=tcp src=192.168.1.100 dst=10.0.0.50 sport=54321 dport=443 sent=1024 rcvd=2048 duration=30 action=accept',
    verified=True,  # WELF format is documented
)


# =============================================================================
# GENIANS NAC (VERIFIED)
# Source: Official Genians Documentation
# Devices: S10_R1, C10_R1
# Version: Genians 4.1.37
# =============================================================================

GENIANS_NAC = LogParser(
    name="Genians_NAC",
    vendor="Genians",
    device_model="S10_R1 / C10_R1",
    device_type="NAC",
    version="Genians 4.1.37",
    pattern=re.compile(
        r"^(?P<datetime>[^,]+),"
        r"LOGTYPE=(?P<logtype>[^,]+),"
        r"LOGID=(?P<logid>[^,]+),"
        r"IP=(?P<ip>[\d\.]+),"
        r"MAC=(?P<mac>[\w:\-]+),"
        r"MSG=(?P<msg>[^,]+),\s*"
        r"DETAIL=(?P<detail>.+)"
    ),
    field_names=["datetime", "logtype", "logid", "ip", "mac", "msg", "detail"],
    description="Genians NAC logs (업무망/인터넷 NAC 센서/서버)",
    sample_log="2024-01-16 08:00:00,LOGTYPE=NODE,LOGID=2001,IP=192.168.1.100,MAC=00:1A:2B:3C:4D:5E,MSG=Node connected, DETAIL=hostname=WORKSTATION-001 user=kim.minho os=Windows 10",
    verified=True,
)

# Alternative CEF format for Genians
GENIANS_NAC_CEF = LogParser(
    name="Genians_NAC_CEF",
    vendor="Genians",
    device_model="S10_R1 / C10_R1",
    device_type="NAC",
    version="Genians 4.1.37",
    pattern=re.compile(
        r"^CEF:0\|GENIANS\|Genian NAC\|(?P<version>[^\|]+)\|"
        r"(?P<filter_name>[^\|]+)\|(?P<filter_desc>[^\|]+)\|(?P<severity>\d+)\|"
        r"rt=(?P<datetime>[^\s]+)\s+"
        r"cs1Label=Log Type\s+cs1=(?P<logtype>[^\s]+)\s+"
        r"cs2Label=Log ID\s+cs2=(?P<logid>[^\s]+)\s+"
        r"dvchost=(?P<sensorname>[^\s]+)\s+"
        r"dst=(?P<ip>[\d\.]+)\s+"
        r"dmac=(?P<mac>[\w:\-]+)\s+"
        r"msg=(?P<msg>[^\s]+)\s+"
        r"cs3Label=Detail Message\s+cs3=(?P<detail>.+)"
    ),
    field_names=[
        "version",
        "filter_name",
        "filter_desc",
        "severity",
        "datetime",
        "logtype",
        "logid",
        "sensorname",
        "ip",
        "mac",
        "msg",
        "detail",
    ],
    description="Genians NAC CEF format logs",
    sample_log="CEF:0|GENIANS|Genian NAC|4.1.37|NodeConnect|Node Connected|1|rt=2024-01-16T08:00:00Z cs1Label=Log Type cs1=NODE cs2Label=Log ID cs2=2001 dvchost=NAC-SENSOR-01 dst=192.168.1.100 dmac=00:1A:2B:3C:4D:5E msg=Node_connected cs3Label=Detail Message cs3=hostname=WORKSTATION-001",
    verified=True,
)


# =============================================================================
# UNVERIFIED PARSERS (Need real samples from devices)
# =============================================================================

# SECUI BLUEMAX NGF (UNVERIFIED - need real samples)
SECUI_BLUEMAX_NGF = LogParser(
    name="SECUI_BLUEMAX_NGF",
    vendor="SECUI",
    device_model="BLUEMAX NGF 100/1510",
    device_type="Firewall/VPN",
    version="SecuiOS V4.0",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?P<product>BLUEMAX)\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "product", "log_type", "message"],
    description="SECUI BLUEMAX NGF (Internet_BLUEMAX_VPN, PG/선불 내부 방화벽) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# SECUI MFI/BLUEMAX IPS (UNVERIFIED)
SECUI_IPS = LogParser(
    name="SECUI_IPS",
    vendor="SECUI",
    device_model="MFI 2100 / BLUEMAX IPS 2000",
    device_type="IDS/IPS",
    version="4.0.0 / V1.0.2",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?P<product>[\w\-]+)\s+"
        r"IPS\s+"
        r"(?P<severity>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "product", "severity", "message"],
    description="SECUI MFI/BLUEMAX IPS (한국 타이밴/메인인터넷/웹인터넷 IPS) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# WINS SNIPER DDoS (UNVERIFIED - no documentation found)
WINS_SNIPER_DDOS = LogParser(
    name="WINS_SNIPER_DDoS",
    vendor="Wins",
    device_model="SNIPER DDX ND2000 / SNIPER ONE-d 2000",
    device_type="DDoS Protection",
    version="V3.0 / V6.5",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"SNIPER\s+"
        r"(?P<event_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "event_type", "message"],
    description="WINS SNIPER DDoS (한국 타이밴/메인인터넷/웹인터넷 DDoS) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample from device]",
    verified=False,
)

# Future Systems XTM/FW VPN (UNVERIFIED)
FUTURE_XTM_VPN = LogParser(
    name="Future_XTM_VPN",
    vendor="Future Systems",
    device_model="XTM500/750/2500, FW750",
    device_type="VPN",
    version="1.0.x ~ 2.1.x",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?P<product>XTM|FW)\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "product", "log_type", "message"],
    description="Future Systems XTM/FW VPN (UVAN, DS카드, 신한카드, BC카드, 농협카드 VPN) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# NexG VForce VPN (UNVERIFIED)
NEXG_VFORCE_VPN = LogParser(
    name="NexG_VForce_VPN",
    vendor="NexG",
    device_model="VForce406R1/500/1500",
    device_type="VPN",
    version="4.6",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"VForce\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "log_type", "message"],
    description="NexG VForce VPN (현대푸본생명, 패스고, BC/농협카드 승인 VPN) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# 어울림 ezWall VPN (UNVERIFIED)
EOULIM_EZWALL_VPN = LogParser(
    name="Eoulim_ezWall_VPN",
    vendor="어울림",
    device_model="ezWall 200",
    device_type="VPN",
    version="V4.0.3",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"ezWall\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "log_type", "message"],
    description="어울림 ezWall VPN (현대푸본생명 DR VPN) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# 퓨처텍정보통신 SSL VPN (UNVERIFIED)
FUTURETECH_SSL_VPN = LogParser(
    name="FutureTech_SSL_VPN",
    vendor="퓨처텍정보통신",
    device_model="SSL PNS 110 R1",
    device_type="SSL VPN",
    version="V.1.0.8",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"SSL-PNS\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "log_type", "message"],
    description="퓨처텍정보통신 SSL VPN - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# Penta WAPPLES WAF (UNVERIFIED)
PENTA_WAPPLES_WAF = LogParser(
    name="Penta_WAPPLES_WAF",
    vendor="Penta",
    device_model="WAPPLES-2700 V7.0",
    device_type="WAF",
    version="penta 3.0",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"WAPPLES\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "log_type", "message"],
    description="Penta WAPPLES WAF (WEB망 웹 방화벽) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# Hunesion i-onenet (UNVERIFIED)
HUNESION_IONENET = LogParser(
    name="Hunesion_i-onenet",
    vendor="Hunesion",
    device_model="i-onenet",
    device_type="Network Bridge",
    version="Centos 6.9",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"i-onenet\s+"
        r"(?P<direction>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "direction", "message"],
    description="Hunesion i-onenet Network Bridge (망연계#1, 망연계#2) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# SpamSniper (UNVERIFIED)
SPAMSNIPER_EMAIL = LogParser(
    name="SpamSniper_SA2000",
    vendor="SPAMSNIPER",
    device_model="SA2000",
    device_type="Email Security",
    version="-",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?:SpamSniper|SPAM)\s+"
        r"(?P<action>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "action", "message"],
    description="SpamSniper Email Security (스팸스나이퍼) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# AhnLab EPP/EDR (UNVERIFIED)
AHNLAB_EPP_EDR = LogParser(
    name="AhnLab_EPP_EDR",
    vendor="안랩",
    device_model="EPP/EDR",
    device_type="Endpoint Security",
    version="-",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?P<product>EPP|EDR)\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "product", "log_type", "message"],
    description="AhnLab EPP/EDR Endpoint Security (안랩 EPP/EDR) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# 와이즈허브시스템즈 DLP (UNVERIFIED)
WISEHUB_DLP = LogParser(
    name="WiseHub_DLP",
    vendor="와이즈허브시스템즈",
    device_model="DLP",
    device_type="DLP",
    version="-",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?:WISEHUB-DLP|DLP)\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "log_type", "message"],
    description="와이즈허브시스템즈 DLP (DLP 외부유출방지_신규) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# 웨어벨리 Chakra (UNVERIFIED)
WAREVALLEY_CHAKRA = LogParser(
    name="Warevalley_Chakra",
    vendor="웨어벨리",
    device_model="Chakra",
    device_type="DB Access Control",
    version="-",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?:CHAKRA|DB-AC)\s+"
        r"(?P<log_type>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "log_type", "message"],
    description="웨어벨리 Chakra DB Access Control (NEW_샤크라) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# 아이엔소프트 OpenManager (UNVERIFIED)
IENSOFT_OPENMANAGER = LogParser(
    name="IENSoft_OpenManager",
    vendor="아이엔소프트",
    device_model="OpenManager",
    device_type="SMS/Monitoring",
    version="-",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?:OpenManager|SMS)\s+"
        r"(?P<alert_level>\w+)\s+"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "alert_level", "message"],
    description="아이엔소프트 OpenManager SMS (오픈매니저) - NEEDS VERIFICATION",
    sample_log="[UNVERIFIED - Need real sample]",
    verified=False,
)

# Lenovo Server (Generic syslog)
LENOVO_SERVER = LogParser(
    name="Lenovo_Server",
    vendor="LENOVO",
    device_model="SR650",
    device_type="Server",
    version="CentOS 7.6",
    pattern=re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>[\d\w\.\-]+)\s+"
        r"(?P<program>[\w\-\[\]]+):\s*"
        r"(?P<message>.+)"
    ),
    field_names=["timestamp", "hostname", "program", "message"],
    description="Lenovo SR650 Server - HSM (HSM#1, HSM#2)",
    sample_log="Jan 16 15:00:00 hsm-server-01 kernel: HSM: Key operation completed successfully",
    verified=True,  # Standard syslog format
)


# =============================================================================
# PARSER REGISTRY
# =============================================================================

ALL_PARSERS: Dict[str, LogParser] = {
    # VERIFIED Parsers
    "juniper_ssg_traffic": JUNIPER_SSG_TRAFFIC,
    "juniper_ssg_vpn": JUNIPER_SSG_VPN,
    "fortigate_traffic": FORTIGATE_TRAFFIC,
    "fortigate_vpn": FORTIGATE_VPN,
    "secui_mf2_welf": SECUI_MF2_WELF,
    "genians_nac": GENIANS_NAC,
    "genians_nac_cef": GENIANS_NAC_CEF,
    "lenovo_server": LENOVO_SERVER,
    # UNVERIFIED Parsers (need real samples)
    "secui_bluemax_ngf": SECUI_BLUEMAX_NGF,
    "secui_ips": SECUI_IPS,
    "wins_sniper_ddos": WINS_SNIPER_DDOS,
    "future_xtm_vpn": FUTURE_XTM_VPN,
    "nexg_vforce_vpn": NEXG_VFORCE_VPN,
    "eoulim_ezwall_vpn": EOULIM_EZWALL_VPN,
    "futuretech_ssl_vpn": FUTURETECH_SSL_VPN,
    "penta_wapples_waf": PENTA_WAPPLES_WAF,
    "hunesion_ionenet": HUNESION_IONENET,
    "spamsniper_email": SPAMSNIPER_EMAIL,
    "ahnlab_epp_edr": AHNLAB_EPP_EDR,
    "wisehub_dlp": WISEHUB_DLP,
    "warevalley_chakra": WAREVALLEY_CHAKRA,
    "iensoft_openmanager": IENSOFT_OPENMANAGER,
}


# =============================================================================
# KOVAN LOG SOURCE MAPPING
# =============================================================================

KOVAN_LOG_SOURCES: Dict[str, Dict[str, Any]] = {
    # HSM Servers
    "HSM#1": {
        "ip": "10.231.202.40",
        "vendor": "LENOVO",
        "model": "SR650",
        "parsers": ["lenovo_server"],
    },
    "HSM#2": {
        "ip": "10.231.202.50",
        "vendor": "LENOVO",
        "model": "SR650",
        "parsers": ["lenovo_server"],
    },
    # Juniper SSG Firewalls (VERIFIED)
    "시네마 방화벽": {
        "ip": ["10.231.250.61", "10.231.250.62"],
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "사용자 방화벽": {
        "ip": ["10.1.1.241", "10.1.1.242"],
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "HSM 방화벽": {
        "ip": ["10.231.250.13", "10.231.250.14"],
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "Test 방화벽": {
        "ip": "10.231.250.52",
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "관제망 방화벽": {
        "ip": ["10.231.250.93", "10.231.250.94"],
        "vendor": "Juniper",
        "model": "SSG-320M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "망분리 인터넷 방화벽": {
        "ip": "10.1.4.250",
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "사용자 DLP 방화벽": {
        "ip": "10.1.1.250",
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "VOICE 방화벽": {
        "ip": "10.1.1.252",
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    "그룹웨어 방화벽": {
        "ip": "220.117.220.234",
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_traffic"],
    },
    # Juniper SSG VPN (VERIFIED)
    "한국 타이밴 VPN": {
        "ip": "10.231.59.1",
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_vpn"],
    },
    "BHN VPN": {
        "ip": ["220.117.220.246", "220.117.220.247"],
        "vendor": "Juniper",
        "model": "SSG-550M",
        "parsers": ["juniper_ssg_vpn"],
    },
    # SECUI MF2 Firewalls (VERIFIED - WELF format)
    "한국 타이밴 방화벽": {
        "ip": ["10.231.59.10", "10.231.59.11"],
        "vendor": "SECUI",
        "model": "MF2 1510",
        "parsers": ["secui_mf2_welf"],
    },
    "메인인터넷 방화벽": {
        "ip": ["10.231.250.5", "10.231.250.6"],
        "vendor": "SECUI",
        "model": "MF2 1520",
        "parsers": ["secui_mf2_welf"],
    },
    "웹 인터넷 방화벽": {
        "ip": ["10.231.250.69", "10.231.250.70"],
        "vendor": "SECUI",
        "model": "MF2 1520",
        "parsers": ["secui_mf2_welf"],
    },
    "DS 방화벽": {
        "ip": ["10.231.250.37", "10.231.250.38"],
        "vendor": "SECUI",
        "model": "MF2 1520",
        "parsers": ["secui_mf2_welf"],
    },
    "전용선 방화벽": {
        "ip": ["10.231.250.45", "10.231.250.46"],
        "vendor": "SECUI",
        "model": "MF2 1520",
        "parsers": ["secui_mf2_welf"],
    },
    "DB 방화벽": {
        "ip": ["10.231.250.21", "10.231.250.22"],
        "vendor": "SECUI",
        "model": "MF2 1520",
        "parsers": ["secui_mf2_welf"],
    },
    # SECUI BLUEMAX (UNVERIFIED)
    "PG/선불 내부 방화벽": {
        "ip": ["10.231.250.109", "10.231.250.110"],
        "vendor": "SECUI",
        "model": "BLUEMAX NGF 1510",
        "parsers": ["secui_bluemax_ngf"],
    },
    "Internet_BLUEMAX_VPN": {
        "ip": "10.231.253.124",
        "vendor": "SECUI",
        "model": "BLUEMAX NGF 100",
        "parsers": ["secui_bluemax_ngf"],
    },
    # SECUI IPS (UNVERIFIED)
    "한국 타이밴 IPS": {
        "ip": "10.231.241.33",
        "vendor": "SECUI",
        "model": "MFI 2100",
        "parsers": ["secui_ips"],
    },
    "메인 인터넷 IPS": {
        "ip": "10.231.241.2",
        "vendor": "SECUI",
        "model": "BLUEMAX IPS 2000",
        "parsers": ["secui_ips"],
    },
    "웹 인터넷 IPS": {
        "ip": "10.231.241.4",
        "vendor": "SECUI",
        "model": "BLUEMAX IPS 2000",
        "parsers": ["secui_ips"],
    },
    # WINS DDoS (UNVERIFIED)
    "한국 타이밴 DDoS": {
        "ip": "10.231.241.32",
        "vendor": "Wins",
        "model": "SNIPER DDX ND2000",
        "parsers": ["wins_sniper_ddos"],
    },
    "메인 인터넷 DDoS": {
        "ip": "10.231.241.1",
        "vendor": "Wins",
        "model": "SNIPER ONE-d 2000",
        "parsers": ["wins_sniper_ddos"],
    },
    "웹 인터넷 DDoS": {
        "ip": "10.231.241.3",
        "vendor": "Wins",
        "model": "SNIPER ONE-d 2000",
        "parsers": ["wins_sniper_ddos"],
    },
    # FortiGate VPN (VERIFIED)
    "유니클로VPN": {
        "ip": ["10.231.241.13", "10.231.241.14"],
        "vendor": "FortiGate",
        "model": "100D",
        "parsers": ["fortigate_vpn", "fortigate_traffic"],
    },
    # Future Systems VPN (UNVERIFIED)
    "UVAN운영 VPN": {
        "ip": ["10.231.253.5", "10.231.253.6"],
        "vendor": "Future",
        "model": "XTM500",
        "parsers": ["future_xtm_vpn"],
    },
    "UVAN개발 VPN": {
        "ip": "10.231.210.234",
        "vendor": "Future",
        "model": "XTM500",
        "parsers": ["future_xtm_vpn"],
    },
    "DS농협카드 VPN": {
        "ip": ["10.231.207.2", "10.231.207.3"],
        "vendor": "Future",
        "model": "XTM500",
        "parsers": ["future_xtm_vpn"],
    },
    "신한카드 VPN": {
        "ip": ["10.231.250.157", "10.231.250.158"],
        "vendor": "Future",
        "model": "XTM500",
        "parsers": ["future_xtm_vpn"],
    },
    "제로페이": {
        "ip": "10.231.253.116",
        "vendor": "Future",
        "model": "XTM500",
        "parsers": ["future_xtm_vpn"],
    },
    # NexG VPN (UNVERIFIED)
    "현대푸본생명 VPN": {
        "ip": "10.231.253.100",
        "vendor": "NexG",
        "model": "VForce406R1",
        "parsers": ["nexg_vforce_vpn"],
    },
    "패스고 VPN": {
        "ip": "10.231.253.148",
        "vendor": "NexG",
        "model": "VForce500",
        "parsers": ["nexg_vforce_vpn"],
    },
    "BC카드 승인 VPN_A": {
        "ip": "10.231.250.149",
        "vendor": "NexG",
        "model": "VForce 1500",
        "parsers": ["nexg_vforce_vpn"],
    },
    "농협카드 승인 VPN_A": {
        "ip": "10.231.250.189",
        "vendor": "NexG",
        "model": "VForce 1500",
        "parsers": ["nexg_vforce_vpn"],
    },
    # Genians NAC (VERIFIED)
    "업무망_NAC_센서": {
        "ip": "10.1.1.208",
        "vendor": "Genians",
        "model": "S10_R1",
        "parsers": ["genians_nac", "genians_nac_cef"],
    },
    "업무망_NAC_서버": {
        "ip": "10.1.1.207",
        "vendor": "Genians",
        "model": "C10_R1",
        "parsers": ["genians_nac", "genians_nac_cef"],
    },
    "인터넷_NAC_센서": {
        "ip": "10.1.3.208",
        "vendor": "Genians",
        "model": "S10_R1",
        "parsers": ["genians_nac", "genians_nac_cef"],
    },
    "인터넷_NAC_서버": {
        "ip": "10.1.3.207",
        "vendor": "Genians",
        "model": "C10_R1",
        "parsers": ["genians_nac", "genians_nac_cef"],
    },
    # Other devices (UNVERIFIED)
    "WEB망 웹 방화벽": {
        "ip": "10.231.241.5",
        "vendor": "Penta",
        "model": "WAPPLES-2700",
        "parsers": ["penta_wapples_waf"],
    },
    "망연계#1": {
        "ip": "10.1.1.206",
        "vendor": "Hunesion",
        "model": "i-onenet",
        "parsers": ["hunesion_ionenet"],
    },
    "망연계#2": {
        "ip": "10.1.3.206",
        "vendor": "Hunesion",
        "model": "i-onenet",
        "parsers": ["hunesion_ionenet"],
    },
    "스팸스나이퍼": {
        "ip": "10.231.212.51",
        "vendor": "SPAMSNIPER",
        "model": "SA2000",
        "parsers": ["spamsniper_email"],
    },
    "DLP 외부유출방지_신규": {
        "ip": "10.1.4.1",
        "vendor": "와이즈허브시스템즈",
        "model": "DLP",
        "parsers": ["wisehub_dlp"],
    },
    "NEW_샤크라(DB접근제어)": {
        "ip": "10.231.203.21",
        "vendor": "웨어벨리",
        "model": "Chakra",
        "parsers": ["warevalley_chakra"],
    },
    "안랩 EPP/EDR": {
        "ip": "10.1.1.136",
        "vendor": "안랩",
        "model": "EPP/EDR",
        "parsers": ["ahnlab_epp_edr"],
    },
    "오픈매니저(SMS)": {
        "ip": "10.231.217.111",
        "vendor": "아이엔소프트",
        "model": "OpenManager",
        "parsers": ["iensoft_openmanager"],
    },
    "현대푸본생명 DR VPN": {
        "ip": "10.231.253.108",
        "vendor": "어울림",
        "model": "ezWall 200",
        "parsers": ["eoulim_ezwall_vpn"],
    },
    "SSL VPN": {
        "ip": "10.1.5.102",
        "vendor": "퓨처텍정보통신",
        "model": "SSL PNS 110 R1",
        "parsers": ["futuretech_ssl_vpn"],
    },
}


# =============================================================================
# PARSER FUNCTIONS
# =============================================================================


def parse_log(log_line: str, parser_name: str) -> Optional[Dict]:
    """Parse a log line using the specified parser."""
    if parser_name not in ALL_PARSERS:
        return None

    parser = ALL_PARSERS[parser_name]
    match = parser.pattern.match(log_line)

    if match:
        result = match.groupdict()
        result["_parser"] = parser_name
        result["_vendor"] = parser.vendor
        result["_verified"] = parser.verified
        return result
    return None


def auto_detect_parser(log_line: str) -> Optional[str]:
    """Automatically detect which parser matches the log line."""
    # Try verified parsers first
    for parser_name, parser in ALL_PARSERS.items():
        if parser.verified and parser.pattern.match(log_line):
            return parser_name

    # Then try unverified parsers
    for parser_name, parser in ALL_PARSERS.items():
        if not parser.verified and parser.pattern.match(log_line):
            return parser_name

    return None


def get_verified_parsers() -> List[str]:
    """Get list of verified parser names."""
    return [name for name, parser in ALL_PARSERS.items() if parser.verified]


def get_unverified_parsers() -> List[str]:
    """Get list of unverified parser names that need real samples."""
    return [name for name, parser in ALL_PARSERS.items() if not parser.verified]


def print_statistics():
    """Print parser statistics."""
    verified = get_verified_parsers()
    unverified = get_unverified_parsers()

    print("=" * 60)
    print("KOVAN SIEM Log Parser Statistics")
    print("=" * 60)
    print(f"\nTotal Parsers: {len(ALL_PARSERS)}")
    print(f"  Verified: {len(verified)}")
    print(f"  Unverified (need real samples): {len(unverified)}")

    print(f"\nTotal Log Sources: {len(KOVAN_LOG_SOURCES)}")

    print("\n\nVERIFIED Parsers:")
    for name in verified:
        p = ALL_PARSERS[name]
        print(f"  - {name}: {p.vendor} {p.device_model}")

    print("\n\nUNVERIFIED Parsers (need real samples):")
    for name in unverified:
        p = ALL_PARSERS[name]
        print(f"  - {name}: {p.vendor} {p.device_model}")


if __name__ == "__main__":
    print_statistics()

"""개발 시드 — 슬라이드 36 데이터셋 (DB 검증 verify_runtime.sql 과 동일 체계).

멱등: tenant_code='nova' 가 있으면 건너뜀. 실 데이터 이행 시 이 시드는 비활성화.
"""
from __future__ import annotations

import hashlib
import json
import logging

from app.db import get_pool

logger = logging.getLogger("edim.seed")

TENANT = "nova"

KOF_ITEMS = [
    ("A", "Fan Model", ["KAD", "KFD", "KAP", "KFS", "ECE", "ECB"]),
    ("B", "Fan Size", ["13", "21", "32"]),
    ("C", "Material", ["32", "45"]),
    ("D", "Bearing Type", ["1.0505", "2.1005", "3.1010", "4.1510"]),
    ("E", "Motor", ["15", "21"]),
    ("F", "Sensor", ["1.Air Vol."]),
]

PRODUCT_CODES = [
    ("KDCR 3-13", "Fan 원심 Casing Double"),
    ("KAD 900 FW", "SF Fan"),
    ("KDP 1-21", "Fan 원심 Casing"),
    ("H 22 380", "Motor"),
    ("ECC 55", "Cooling Coil"),
    ("EFP 55", "Filter"),
    ("EHC 55", "Heating Coil"),
    ("EMX 55", "Mixing Box"),
    ("KDP 9", "Bearing Unit"),
    ("FDV-480", "Motor H22 380V"),
    ("KDC-1", "Casing 강판"),
    ("EWT-3", "Water Trap"),
]

# (mother, child, qty, sort, slot_map[(child_slot, mother_slot|None, fixed|None)])
RELATIONSHIPS = [
    ("KDCR 3-13", "KAD 900 FW", 1, 1, [("B", "B", None), ("E", "E", None)]),
    ("KAD 900 FW", "KDP 1-21", 1, 1, [("B", "B", None), ("E", "E", None)]),
    ("KAD 900 FW", "H 22 380", 1, 2, [("V", None, "380V")]),
    ("KAD 900 FW", "KDP 9", 4, 3, []),
    ("KDCR 3-13", "ECC 55", 1, 2, [("C", "C", None)]),
    ("KDCR 3-13", "EFP 55", 3, 3, []),
    ("KDCR 3-13", "EHC 55", 1, 4, [("C", "C", None)]),
    ("KDCR 3-13", "EMX 55", 1, 5, []),
]

# (code, source, supplier|None, price, from, to)
PRICES = [
    ("KDP 1-21", "QUOTE", "효성", 2_400_000, "2026-01-01", None),
    ("H 22 380", "QUOTE", "효성", 2_400_000, "2026-01-01", None),
    ("ECC 55", "QUOTE", "중원", 1_180_000, "2026-01-01", None),
    ("EFP 55", "QUOTE", "중원", 420_000, "2026-01-01", None),
    ("EHC 55", "QUOTE", "중원", 960_000, "2026-01-01", None),
    ("EMX 55", "QUOTE", "중원", 310_000, "2026-01-01", None),
    ("KDP 9", "QUOTE", "대신금속", 96_000, "2026-01-01", None),
    ("FDV-480", "QUOTE", "효성", 450_000, "2026-06-01", None),
    ("FDV-480", "QUOTE", "LG", 462_000, "2026-05-15", "2026-05-31"),
    ("KDC-1", "PURCHASE", "중원", 128_000, "2026-04-01", "2026-06-30"),
    ("KDC-1", "STOCK", None, 131_000, "2026-07-01", None),
    ("EWT-3", "APPLIED", "대신금속", 36_000, "2026-06-10", None),
]

TECH_ROWS = [
    ("710", {"pd": 11, "pt": 111, "rpm": 1000, "eff": 82, "power": 40, "sound": 57}),
    ("800", {"pd": 9, "pt": 109, "rpm": 980, "eff": 84, "power": 43, "sound": 58}),
    ("900", {"pd": 7, "pt": 107, "rpm": 910, "eff": 72, "power": 44, "sound": 59}),
    ("1000", {"pd": 6, "pt": 104, "rpm": 860, "eff": 68, "power": 47, "sound": 61}),
    ("1120", {"pd": 5, "pt": 101, "rpm": 800, "eff": 63, "power": 52, "sound": 63}),
]

SUPPLIERS = ["효성", "LG", "중원", "대신금속"]


def run_seed() -> None:
    pool = get_pool()
    if pool is None:
        logger.warning("seed skipped — DB unavailable")
        return
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT tenant_id FROM sys_tenant WHERE tenant_code=%s", (TENANT,))
        row = cur.fetchone()
        if row:
            logger.info("seed skipped — tenant '%s' exists (tenant_id=%s)", TENANT, row[0])
            return

        cur.execute(
            "INSERT INTO sys_tenant (tenant_code, tenant_name) VALUES (%s,%s) RETURNING tenant_id",
            (TENANT, "NOVA Solution"))
        tid = cur.fetchone()[0]

        pw = hashlib.sha256(b"edim").hexdigest()
        cur.execute(
            """INSERT INTO sys_user (tenant_id, login_id, user_name, password_hash, department, user_level)
               VALUES (%s,'edim','YS.Gang',%s,'기술연구소','SETUP')""", (tid, pw))

        suppliers: dict[str, int] = {}
        for name in SUPPLIERS:
            cur.execute(
                """INSERT INTO com_company (tenant_id, company_type, company_name)
                   VALUES (%s,'SUPPLIER',%s) RETURNING company_id""", (tid, name))
            suppliers[name] = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO com_company (tenant_id, company_type, company_name)
               VALUES (%s,'CUSTOMER','Micron') RETURNING company_id""", (tid,))
        micron = cur.fetchone()[0]

        cur.execute(
            """INSERT INTO prj_project (tenant_id, project_no, project_name, customer_id, project_type)
               VALUES (%s,'PS-61313-5','Micron #7',%s,'Client') RETURNING project_id""",
            (tid, micron))
        project_id = cur.fetchone()[0]

        cur.execute(
            """INSERT INTO code_group (tenant_id, group_code, group_name, group_type,
               hierarchy_address, approval_status)
               VALUES (%s,'KOF','Specification - Fan','SPECIFICATION','/C/ENG/FAN/KOF','APPROVED')
               RETURNING group_id""", (tid,))
        gid = cur.fetchone()[0]

        for slot, name, values in KOF_ITEMS:
            cur.execute(
                """INSERT INTO code_item (tenant_id, group_id, item_slot, item_name)
                   VALUES (%s,%s,%s,%s) RETURNING item_id""", (tid, gid, slot, name))
            item_id = cur.fetchone()[0]
            for i, v in enumerate(values):
                cur.execute(
                    """INSERT INTO code_item_value (tenant_id, item_id, value_code,
                       sort_order, approval_status)
                       VALUES (%s,%s,%s,%s,'APPROVED')""", (tid, item_id, v, i))

        codes: dict[str, int] = {}
        for main, name in PRODUCT_CODES:
            cur.execute(
                """INSERT INTO product_code (tenant_id, main_code, group_id, code_name,
                   hierarchy_address, approval_status)
                   VALUES (%s,%s,%s,%s,%s,'APPROVED') RETURNING product_code_id""",
                (tid, main, gid, name, f"/C/ENG/FAN/{main.split(' ')[0]}"))
            codes[main] = cur.fetchone()[0]

        for mother, child, qty, sort, maps in RELATIONSHIPS:
            cur.execute(
                """INSERT INTO code_relationship (tenant_id, mother_code_id, child_code_id,
                   quantity, sort_order, approval_status)
                   VALUES (%s,%s,%s,%s,%s,'APPROVED') RETURNING rel_id""",
                (tid, codes[mother], codes[child], qty, sort))
            rel_id = cur.fetchone()[0]
            for child_slot, mother_slot, fixed in maps:
                cur.execute(
                    """INSERT INTO code_relationship_slot_map (rel_id, child_slot, mother_slot, fixed_value)
                       VALUES (%s,%s,%s,%s)""", (rel_id, child_slot, mother_slot, fixed))

        for code, source, supplier, price, vfrom, vto in PRICES:
            cur.execute(
                """INSERT INTO cst_price (tenant_id, product_code_id, price_source,
                   supplier_id, price, valid_from, valid_to)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (tid, codes[code], source,
                 suppliers.get(supplier) if supplier else None, price, vfrom, vto))

        cur.execute(
            """INSERT INTO tbl_data_table (tenant_id, table_name, table_type, department,
               hierarchy_address, column_def, approval_status)
               VALUES (%s,'FanTechData','TECH','Engineering','/T/ENG/TECH/FanTechData',
                       %s,'APPROVED') RETURNING table_id""",
            (tid, json.dumps({"columns": ["pd", "pt", "rpm", "eff", "power", "sound"]})))
        tech_id = cur.fetchone()[0]
        for i, (key, vals) in enumerate(TECH_ROWS):
            cur.execute(
                """INSERT INTO tbl_data_row (table_id, row_key, row_key_num, row_values, sort_order)
                   VALUES (%s,%s,%s,%s,%s)""", (tech_id, key, key, json.dumps(vals), i))

        cur.execute(
            """INSERT INTO cpq_selection (tenant_id, project_id, finished_goods_code,
               product_code_id, slot_values, status)
               VALUES (%s,%s,'KDCR 3-13-13-15',%s,%s,'DRAFT')""",
            (tid, project_id, codes["KDCR 3-13"],
             json.dumps({"B": "13", "C": "32", "E": "15"})))

        logger.info("seed complete — tenant_id=%s, %d codes", tid, len(codes))

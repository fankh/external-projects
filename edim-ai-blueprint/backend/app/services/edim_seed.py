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


def _ensure_dev_table(cur) -> None:
    """개발서버 운영 도구 — 운영자 요구사항 접수함 (54-테이블 설계 스키마 외, 멱등 생성)."""
    cur.execute("""CREATE TABLE IF NOT EXISTS dev_requirement (
        req_id      SERIAL PRIMARY KEY,
        tenant_id   INT NOT NULL,
        screen_id   VARCHAR(50),
        category    VARCHAR(20)  NOT NULL DEFAULT 'CHANGE',
        title       VARCHAR(200) NOT NULL,
        content     TEXT         NOT NULL DEFAULT '',
        priority    VARCHAR(10)  NOT NULL DEFAULT 'P2',
        status      VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
        requester   VARCHAR(50)  NOT NULL,
        resolution  TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS dev_requirement_image (
        image_id    SERIAL PRIMARY KEY,
        req_id      INT NOT NULL REFERENCES dev_requirement(req_id) ON DELETE CASCADE,
        file_name   VARCHAR(200) NOT NULL,
        file_path   VARCHAR(300) NOT NULL,
        file_size   INT NOT NULL,
        content_type VARCHAR(60) NOT NULL DEFAULT 'image/png',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now())""")


# ── seed v15 — B17: 부품 마스터(prt_part)·도면 BOM(dwg_bom)·공급자 코드(prt_supplier_code_map)·슬롯 정의 ──

# (part_no, name, spec, material_code, supplier, product_main_code, unit, weight, is_standard)
PARTS_V15 = [
    ('PRT-CAS-900', 'Casing Φ900', 'Fan 원심 Casing 용접구조', 'SPHC', None, 'KDCR 3-13', 'EA', 42.5, False),
    ('PRT-IMP-900', 'Impeller Airfoil 900', '밸런싱 등급 G6.3', 'SS400', '효성', 'KDCR 3-13', 'EA', 18.2, False),
    ('PRT-SHF-045', 'Shaft Φ45', '연마 h6', 'SS400', '중원', None, 'EA', 12.0, True),
    ('PRT-BRG-6210', 'Bearing 6210', 'Deep Groove 2RS', None, '중원', None, 'EA', 0.5, True),
]

# (part_no, qty, assembly_seq, assembly_note) — KDCR 3-13 조립순서 ◆
BOM_V15 = [
    ('PRT-BRG-6210', 2, 1, 'Bearing 압입 (양단)'),
    ('PRT-SHF-045', 1, 2, '축 조립·수평 확인'),
    ('PRT-IMP-900', 1, 5, 'Impeller 밸런싱 후 체결'),
    ('PRT-CAS-900', 1, 6, 'Casing 최종 조립'),
]

# (part_no, supplier, supplier_code, supplier_name)
SUPPLIER_CODES_V15 = [
    ('PRT-BRG-6210', '중원', 'JW-6210-2RS', 'Deep Groove Ball Bearing 6210'),
    ('PRT-IMP-900', '효성', 'HS-IMP-900A', 'Airfoil Impeller 900'),
]

# (item_slot, source item_name, is_required, sort) — 'KDP 1-21' 필수 슬롯 정의
SLOT_ITEMS_V15 = [
    ('A', 'Fan Model', True, 1),
    ('B', 'Fan Size', True, 2),
    ('C', 'Material', False, 3),
]

LABELS_V15 = {
    'menu.plm-parts': ('Part Ledger (M-4-7)', '部品台帳 (M-4-7)', '零件台账 (M-4-7)'),
    'screen.plm-parts': ('Part Ledger', '部品台帳', '零件台账'),
    'parts.title': ('Part Ledger — prt_part', '部品台帳 — prt_part', '零件台账 — prt_part'),
    'parts.registerF2': ('+ Register Part F2', '＋ 部品登録 F2', '＋ 零件登记 F2'),
    'parts.partNo': ('Part No.', '部品番号', '零件编号'),
    'parts.partName': ('Part Name', '部品名', '零件名'),
    'parts.specCol': ('Spec', '仕様', '规格'),
    'parts.materialCol': ('Material', '材質', '材质'),
    'parts.supplierCol': ('Supplier', '仕入先', '供应商'),
    'parts.weightCol': ('Weight(kg)', '重量(kg)', '重量(kg)'),
    'parts.stdChip': ('STD', 'STD', 'STD'),
    'parts.bomCol': ('BOM Refs', 'BOM 参照', 'BOM 引用'),
    'parts.supCodes': ('Supplier Code Map (ERP-018)', '仕入先コードマップ (ERP-018)', '供应商代码映射 (ERP-018)'),
    'parts.supCodeAdd': ('Add Mapping', 'マッピング追加', '添加映射'),
    'parts.selectHint': ('Select a part row to view supplier code mappings', '部品行を選択すると仕入先コードを表示', '选择零件行以查看供应商代码'),
    'parts.noSupCodes': ('No supplier code mappings', '仕入先コードマッピングなし', '无供应商代码映射'),
    'editor.bomLive': ('Sub Item DWG · Assembly Seq (dwg_bom)', 'Sub Item DWG · 組立順序 (dwg_bom)', 'Sub Item DWG · 装配顺序 (dwg_bom)'),
    'purchase.supCode': ('Supplier Code', '仕入先コード', '供应商代码'),
    'detail.slotDef': ('Required Slot Definition (product_code_item)', '必須スロット定義 (product_code_item)', '必需槽位定义 (product_code_item)'),
}


def seed_v15(cur, tid: int) -> None:
    cur.execute('SELECT 1 FROM prt_part WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        ids: dict[str, int] = {}
        for no, name, spec, mat, sup, pcode, unit, weight, std in PARTS_V15:
            mid = None
            if mat:
                cur.execute('SELECT material_id FROM mat_material WHERE tenant_id=%s AND material_code=%s',
                            (tid, mat))
                m = cur.fetchone()
                mid = m[0] if m else None
            sid = None
            if sup:
                cur.execute('SELECT company_id FROM com_company WHERE tenant_id=%s AND company_name=%s LIMIT 1',
                            (tid, sup))
                s = cur.fetchone()
                sid = s[0] if s else None
            pcid = None
            if pcode:
                cur.execute('SELECT min(product_code_id) FROM product_code WHERE tenant_id=%s AND main_code=%s',
                            (tid, pcode))
                pc = cur.fetchone()
                pcid = pc[0] if pc else None
            cur.execute(
                """INSERT INTO prt_part (tenant_id, part_no, part_name, specification, material_id,
                   supplier_id, product_code_id, unit, weight, is_standard)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING part_id""",
                (tid, no, name, spec, mid, sid, pcid, unit, weight, std))
            ids[no] = cur.fetchone()[0]
        cur.execute(
            "SELECT drawing_id FROM dwg_drawing WHERE tenant_id=%s AND drawing_no='KDCR 3-13'", (tid,))
        d = cur.fetchone()
        if d:
            for i, (no, qty, seq, note) in enumerate(BOM_V15, start=1):
                cur.execute(
                    """INSERT INTO dwg_bom (drawing_id, part_id, item_no, quantity, assembly_seq, assembly_note)
                       VALUES (%s,%s,%s,%s,%s,%s)""", (d[0], ids[no], i, qty, seq, note))
        for no, sup, scode, sname in SUPPLIER_CODES_V15:
            cur.execute('SELECT company_id FROM com_company WHERE tenant_id=%s AND company_name=%s LIMIT 1',
                        (tid, sup))
            s = cur.fetchone()
            if s:
                cur.execute(
                    """INSERT INTO prt_supplier_code_map (tenant_id, part_id, supplier_id,
                       supplier_code, supplier_name) VALUES (%s,%s,%s,%s,%s)""",
                    (tid, ids[no], s[0], scode, sname))
        logger.info('seed v15 — prt_part %d + bom %d + supplier_code %d',
                    len(PARTS_V15), len(BOM_V15), len(SUPPLIER_CODES_V15))
    cur.execute('SELECT 1 FROM product_code_item LIMIT 1')
    if not cur.fetchone():
        cur.execute(
            "SELECT min(product_code_id) FROM product_code WHERE tenant_id=%s AND main_code='KDP 1-21'",
            (tid,))
        pc = cur.fetchone()
        if pc and pc[0]:
            n = 0
            for slot, item_name, req, sort in SLOT_ITEMS_V15:
                cur.execute('SELECT item_id FROM code_item WHERE tenant_id=%s AND item_name=%s LIMIT 1',
                            (tid, item_name))
                ci = cur.fetchone()
                if ci:
                    cur.execute(
                        """INSERT INTO product_code_item (product_code_id, item_slot, source_item_id,
                           is_required, sort_order) VALUES (%s,%s,%s,%s,%s)""",
                        (pc[0], slot, ci[0], req, sort))
                    n += 1
            logger.info('seed v15 — product_code_item %d', n)
    for key, (en, ja, zh) in LABELS_V15.items():
        for locale, text in (('en', en), ('ja', ja), ('zh', zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v16 — B19: 창고/저장위치 계층 (erp_warehouse, ERP-020/021) ──

# (location_type, code, name, parent_code, hazard, inspection)
WAREHOUSES_V16 = [
    ('REGION', 'KR-CW', '창원 사업장', None, None, None),
    ('PLANT', 'CW-P1', '1공장 (Fan 조립)', 'KR-CW', None, None),
    ('WAREHOUSE', 'P1-WH-A', '자재창고 A', 'CW-P1', None, '6개월'),
    ('STORAGE', 'WH-A-GEN', '일반 자재 보관', 'P1-WH-A', None, '3개월'),
    ('STORAGE', 'WH-A-HAZ', '위험물 보관소', 'P1-WH-A', '액체·가스 (도료·용접가스)', '1개월'),
    ('SECTOR', 'GEN-A01', 'A-01 (표준 부품)', 'WH-A-GEN', None, None),
    ('SECTOR', 'HAZ-H01', 'H-01 (인화성 액체)', 'WH-A-HAZ', '액체', '1개월'),
]

LABELS_V16 = {
    'menu.erp-warehouse': ('Warehouse·Storage (M-8-4)', '倉庫·保管場所 (M-8-4)', '仓库·储位 (M-8-4)'),
    'screen.erp-warehouse': ('Warehouse·Storage', '倉庫·保管場所', '仓库·储位'),
    'wh.title': ('Warehouse/Storage Hierarchy — erp_warehouse', '倉庫/保管場所階層 — erp_warehouse', '仓库/储位层级 — erp_warehouse'),
    'wh.addF2': ('+ Add Location F2', '＋ 位置追加 F2', '＋ 添加位置 F2'),
    'wh.typeCol': ('Type', '種別', '类型'),
    'wh.codeCol': ('Code', 'コード', '代码'),
    'wh.nameCol': ('Name', '名称', '名称'),
    'wh.hazardCol': ('Hazard Allowed', '危険物許可', '危险品许可'),
    'wh.inspectionCol': ('Inspection Cycle', '検査周期', '检查周期'),
    'wh.hierHint': ('Hierarchy: REGION→PLANT→WAREHOUSE→STORAGE→SECTOR (order enforced)',
                    '階層: REGION→PLANT→WAREHOUSE→STORAGE→SECTOR (順序強制)',
                    '层级: REGION→PLANT→WAREHOUSE→STORAGE→SECTOR (强制顺序)'),
    'purch.poDialog': ('PO Terms (ERP-017)', 'PO 条件 (ERP-017)', 'PO 条款 (ERP-017)'),
    'purch.delivery': ('Delivery Terms', '納品条件', '交货条款'),
    'purch.transport': ('Transport', '輸送手段', '运输方式'),
    'purch.minQty': ('Min Order Qty', '最小購買数量', '最小采购量'),
    'purch.cert': ('Certificate Required', '証明書要求', '要求证书'),
}


def seed_v16(cur, tid: int) -> None:
    cur.execute('SELECT 1 FROM erp_warehouse WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        ids: dict[str, int] = {}
        for lt, code, name, parent, hazard, insp in WAREHOUSES_V16:
            cur.execute(
                """INSERT INTO erp_warehouse (tenant_id, parent_id, location_type, location_code,
                   location_name, hazard_allowed, inspection_cycle)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING warehouse_id""",
                (tid, ids.get(parent), lt, code, name, hazard, insp))
            ids[code] = cur.fetchone()[0]
        logger.info('seed v16 — erp_warehouse %d노드', len(WAREHOUSES_V16))
    for key, (en, ja, zh) in LABELS_V16.items():
        for locale, text in (('en', en), ('ja', ja), ('zh', zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v17 — B20: Macro 4-Way 필드·CODING 모드·tbx_macro_ref ──

FLOWCHART_V17 = {
    'nodes': [
        {'id': 'f1', 'name': 'Impeller 참조', 'sub': 'Table12', 'x': 20, 'y': 12, 'w': 110, 'h': 34},
        {'id': 'f2', 'name': 'Casing 폭', 'sub': 'Table12', 'x': 20, 'y': 60, 'w': 110, 'h': 34},
        {'id': 'f3', 'name': 'FES 여유', 'sub': 'Var', 'x': 20, 'y': 108, 'w': 110, 'h': 34},
        {'id': 'f4', 'name': 'Σ Shaft 길이', 'x': 150, 'y': 60, 'w': 90, 'h': 34},
    ],
    'edges': [['f1', 'f4'], ['f2', 'f4'], ['f3', 'f4']],
}

CODE_TEXT_V17 = (
    "def shaft_length(mc: float, fes: float) -> float:\n"
    "    base = table12('E', 560, 800, agg='SUM')  # Casing 구간 합\n"
    "    margin = var('FES', fes)                  # 여유 (Variant)\n"
    "    return round((base + margin) * prec(1), 1)\n")

CODING_MACRO_V17 = (
    "def weight_estimate(parts: list[dict]) -> float:\n"
    "    \"\"\"부품 중량 합산 — prt_part.weight × BOM 수량 (CODING 모드 데모).\"\"\"\n"
    "    return sum(p['weight'] * p['qty'] for p in parts if p.get('weight'))\n")


def seed_v17(cur, tid: int) -> None:
    # 4-Way 필드 보강 — Shaft 길이 계산 (미보유 시 1회)
    cur.execute(
        """SELECT macro_id, code_text FROM tbx_macro
           WHERE tenant_id=%s AND macro_name='Shaft 길이 계산'""", (tid,))
    m = cur.fetchone()
    if m and not m[1]:
        cur.execute(
            """UPDATE tbx_macro SET code_text=%s, flowchart_def=%s,
               description_text=COALESCE(description_text,
                 'Casing 구간 Table 합계에 FES 여유를 더해 Shaft 길이를 산출 — MC>500 조건 분기'),
               test_input=%s, test_result=%s WHERE macro_id=%s""",
            (CODE_TEXT_V17, json.dumps(FLOWCHART_V17),
             json.dumps({'MC': 520, 'FES': 15}), json.dumps({'value': 2685, 'ok': True}),
             m[0]))
        logger.info('seed v17 — Shaft 길이 계산 4-Way 필드 보강')
    # CODING 모드 데모 매크로
    cur.execute(
        "SELECT 1 FROM tbx_macro WHERE tenant_id=%s AND apply_type='CODING' LIMIT 1", (tid,))
    if not cur.fetchone():
        cur.execute(
            """INSERT INTO tbx_macro (tenant_id, macro_name, code_text, description_text,
               apply_type, status)
               VALUES (%s,'중량 추정 (Coding)',%s,'BOM 중량 합산 — 복잡 로직은 Coding 모드 (TBX-010)',
                       'CODING','DRAFT')""", (tid, CODING_MACRO_V17))
        logger.info('seed v17 — CODING 모드 매크로 1건')
    # tbx_macro_ref — Table 참조 매크로 (DIM D = Table12 참조)
    cur.execute('SELECT 1 FROM tbx_macro_ref LIMIT 1')
    if not cur.fetchone():
        cur.execute("SELECT table_id FROM tbl_data_table WHERE tenant_id=%s AND table_name='Table12'",
                    (tid,))
        t = cur.fetchone()
        if t:
            n = 0
            cur.execute(
                """SELECT macro_id, macro_expr FROM tbx_macro
                   WHERE tenant_id=%s AND macro_expr ILIKE '%%Table12%%'""", (tid,))
            for mid, _expr in cur.fetchall():
                cur.execute(
                    """INSERT INTO tbx_macro_ref (macro_id, ref_type, ref_target_id)
                       VALUES (%s,'TABLE',%s)""", (mid, t[0]))
                n += 1
            logger.info('seed v17 — tbx_macro_ref %d건 (Table12)', n)


def _seed_invariants(cur, tid: int) -> None:
    """버전 게이트와 무관하게 매 기동 실행되는 불변식 재확정 (자기치유).

    seed_v4 는 멱등(1회)이라, 라이브 테스트·수동 조작이 데모 계정을 강등하면
    복원되지 않는다. 여기서 레벨이 다를 때만 재승격하고, 실제 치유 시에만 감사 남긴다.
    """
    cur.execute(
        """UPDATE sys_user SET user_level='ADMIN', updated_at=now()
           WHERE tenant_id=%s AND login_id='edim' AND user_level<>'ADMIN'
           RETURNING user_id""", (tid,))
    healed = cur.fetchone()
    if healed:
        uid = healed[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action,
               actor_id, before_data, after_data)
               VALUES (%s,'sys_user',%s,'LEVEL_CHANGE',%s,
                       '{"level":"(demoted)","source":"seed self-heal"}'::jsonb,
                       '{"level":"ADMIN"}'::jsonb)""", (tid, uid, uid))
        logger.info("seed invariant healed — edim 레벨 → ADMIN 재확정")


def run_seed() -> None:
    pool = get_pool()
    if pool is None:
        logger.warning("seed skipped — DB unavailable")
        return
    with pool.connection() as conn, conn.cursor() as cur:
        # dev_requirement 테이블은 마이그레이션(0002)이 담당 — 시드는 데이터만 (C6)
        cur.execute("SELECT tenant_id FROM sys_tenant WHERE tenant_code=%s", (TENANT,))
        row = cur.fetchone()
        if row:
            logger.info("base seed exists (tenant_id=%s)", row[0])
            _seed_v2(cur, row[0])
            seed_v3(cur, row[0])
            seed_v4(cur, row[0])
            seed_v5(cur, row[0])
            seed_v6(cur, row[0])
            seed_v7(cur, row[0])
            seed_v8(cur, row[0])
            seed_v9(cur, row[0])
            seed_v10(cur, row[0])
            seed_v11(cur, row[0])
            seed_v12(cur, row[0])
            seed_v13(cur, row[0])
            seed_v14(cur, row[0])
            seed_v15(cur, row[0])
            seed_v16(cur, row[0])
            seed_v17(cur, row[0])
            seed_v18(cur, row[0])
            seed_v19(cur, row[0])
            seed_v20(cur, row[0])
            seed_v21(cur, row[0])
            seed_v22(cur, row[0])
            seed_v23(cur, row[0])
            seed_v24(cur, row[0])
            seed_v25(cur, row[0])
            seed_v26(cur, row[0])
            seed_v27(cur, row[0])
            seed_v28(cur, row[0])
            seed_v29(cur, row[0])
            seed_v31(cur, row[0])
            _seed_invariants(cur, row[0])
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
        _seed_v2(cur, tid)
        seed_v3(cur, tid)
        seed_v4(cur, tid)
        seed_v5(cur, tid)
        seed_v6(cur, tid)
        seed_v7(cur, tid)
        seed_v8(cur, tid)
        seed_v9(cur, tid)
        seed_v10(cur, tid)
        seed_v11(cur, tid)
        seed_v12(cur, tid)
        seed_v13(cur, tid)
        seed_v14(cur, tid)
        seed_v15(cur, tid)
        seed_v16(cur, tid)
        seed_v17(cur, tid)
        seed_v18(cur, tid)
        seed_v19(cur, tid)
        seed_v20(cur, tid)
        seed_v21(cur, tid)
        seed_v22(cur, tid)
        seed_v23(cur, tid)
        seed_v24(cur, tid)
        seed_v25(cur, tid)
        seed_v26(cur, tid)
        seed_v27(cur, tid)
        seed_v28(cur, tid)
        seed_v29(cur, tid)
        seed_v31(cur, tid)
        _seed_invariants(cur, tid)


# ── seed v2 — 승인함·문서함·사용자·프로세스 이벤트·이력 (배치 A) ──

USERS_V2 = [
    ("kim01", "Kim", "기술", "GENERAL", "ACTIVE"),
    ("park.f", "Park", "재무", "ADMIN", "LOCKED"),
    ("lee.t", "Lee", "기술", "GENERAL", "ACTIVE"),
    ("jang.s", "Jang", "영업", "GENERAL", "ACTIVE"),
]

DOCS_V2 = [
    ("DF 342-234 E", "Density 계산서", "TECH_DOC", "CHECK", "KD-0.2", "Kim", None, "S-2"),
    ("DF 342-235 A", "Fan 성능 Report", "TECH_DOC", "APPROVE", "KD-1.0", "Lee", None, "S-3"),
    ("QR-61216-01", "CLT 견적서", "QUOTATION", "ACCEPTED", "1.1", "Jang", "2026-06-30", "S-3"),
    ("I011902", "승인도면 (AHU 5)", "DRAWING", "ACCEPTED", "B", "Kim", "2026-06-27", "S-1"),
    ("DF 342-236", "소음 예측 계산서", "TECH_DOC", "SET_UP", "KD-0.1", "Kim", None, "S-2"),
]

PROC_DEFS_V2 = [
    ("OR", "수주", "영업", False), ("AP", "승인 도서", "영업", True),
    ("PL", "Part List", "기술", True), ("BOM", "BOM", "기술", True),
    ("MR", "제작의뢰", "기술", False), ("PR", "발주 요청", "자재", False),
    ("IR", "기성청구", "재무", False),
]
PROC_EDGES_V2 = [("OR", "AP"), ("OR", "PL"), ("PL", "BOM"), ("BOM", "PR"), ("AP", "MR")]

# (proc, project_no, assignee, due, status)
EVENTS_V2 = [
    ("MR", "PS-61313-5", "edim", "2026-07-09", "IN_PROGRESS"),
    ("PL", "PS-61313-5", "kim01", "2026-07-05", "TODO"),
    ("BOM", "PS-598", "kim01", "2026-07-11", "TODO"),
    ("MR", "PS-612", "edim", "2026-07-07", "TODO"),
    ("IR", "PS-598", "park.f", "2026-07-04", "TODO"),
]


def _seed_v2(cur, tid: int) -> None:
    cur.execute("SELECT 1 FROM doc_control WHERE tenant_id=%s LIMIT 1", (tid,))
    if cur.fetchone():
        logger.info("seed v2 exists — skip")
        return

    for login, name, dept, level, status in USERS_V2:
        cur.execute(
            """INSERT INTO sys_user (tenant_id, login_id, user_name, password_hash,
               department, user_level, status)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (tenant_id, login_id) DO NOTHING""",
            (tid, login, name, hashlib.sha256(b"edim").hexdigest(), dept, level, status))

    for no, name in [("PS-612", "반도체 배기 개선"), ("PS-598", "물류센터 공조")]:
        cur.execute(
            """INSERT INTO prj_project (tenant_id, project_no, project_name)
               VALUES (%s,%s,%s) ON CONFLICT (tenant_id, project_no) DO NOTHING""",
            (tid, no, name))

    for doc_no, title, dtype, status, ver, person, appdate, grade in DOCS_V2:
        cur.execute(
            """INSERT INTO doc_control (tenant_id, doc_no, title, doc_type,
               released_status, version, person, approval_date, management_grade)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (tid, doc_no, title, dtype, status, ver, person, appdate, grade))

    defs: dict[str, int] = {}
    for code, name, dept, auto in PROC_DEFS_V2:
        cur.execute(
            """INSERT INTO erp_process_def (tenant_id, proc_code, proc_name, department, is_auto)
               VALUES (%s,%s,%s,%s,%s) RETURNING proc_def_id""",
            (tid, code, name, dept, auto))
        defs[code] = cur.fetchone()[0]
    for f, t in PROC_EDGES_V2:
        cur.execute(
            """INSERT INTO erp_process_edge (tenant_id, from_def_id, to_def_id)
               VALUES (%s,%s,%s)""", (tid, defs[f], defs[t]))

    cur.execute("SELECT login_id, user_id FROM sys_user WHERE tenant_id=%s", (tid,))
    uids = dict(cur.fetchall())
    cur.execute("SELECT project_no, project_id FROM prj_project WHERE tenant_id=%s", (tid,))
    pids = dict(cur.fetchall())

    for proc, pno, login, due, status in EVENTS_V2:
        cur.execute(
            """INSERT INTO erp_process_event (tenant_id, proc_def_id, project_id,
               status, assignee_id, due_date)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (tid, defs[proc], pids[pno], status, uids.get(login), due))

    # 승인 요청 (PENDING) — product_code / doc_control 대상
    cur.execute(
        "SELECT main_code, product_code_id FROM product_code WHERE tenant_id=%s", (tid,))
    cids = dict(cur.fetchall())
    cur.execute(
        "SELECT doc_no, doc_control_id FROM doc_control WHERE tenant_id=%s", (tid,))
    dids = dict(cur.fetchall())
    reqs = [
        ("product_code", cids["KDCR 3-13"], "UPDATE", "검토", "ysgang", "KDCR 3-13 ↔ KDI 21 관계"),
        ("product_code", cids["FDV-480"], "CREATE", "승인", "ysgang", "FDV-480 신규 등록"),
        ("doc_control", dids["DF 342-235 A"], "UPDATE", "승인", "kim01", "Fan 성능 Report v1.0"),
        ("doc_control", dids["DF 342-234 E"], "CREATE", "검토", "lee.t", "Density 계산서 v0.2"),
    ]
    requester_fallback = uids.get("edim") or next(iter(uids.values()))
    for table, target, rtype, step, login, label in reqs:
        cur.execute(
            """INSERT INTO sys_approval_request (tenant_id, target_table, target_id,
               request_type, step, requester_id, comment)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (tid, table, target, rtype, step,
             uids.get(login, requester_fallback), label))

    actor = requester_fallback
    for table, target, action in [
        ("cpq_run", 1, "RUN_SUCCESS"), ("code_relationship", 1, "UPDATE"),
        ("sys_hierarchy", 1, "MOVE"),
    ]:
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action,
               actor_id, after_data)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (tid, table, target, action, actor, json.dumps({"seed": True})))

    logger.info("seed v2 complete — docs/users/events/approvals")


# ── seed v3 — Table12 (Variant, W-20) ──

TABLE12_ROWS = [
    ("560", {"A": 55, "B": 45, "C": 9, "E": 656}),
    ("630", {"A": 32, "B": 45, "C": 11, "E": 656}),
    ("710", {"A": 679, "B": 760, "C": 45, "D": 700, "E": 656}),
    ("800", {"A": 721, "B": 806, "C": 45, "D": 760, "E": 702}),
]


def seed_v3(cur, tid: int) -> None:
    cur.execute(
        "SELECT 1 FROM tbl_data_table WHERE tenant_id=%s AND table_name='Table12'", (tid,))
    if cur.fetchone():
        return
    cur.execute(
        """INSERT INTO tbl_data_table (tenant_id, table_name, table_type, department,
           hierarchy_address, column_def, approval_status)
           VALUES (%s,'Table12','VARIANT','Engineering','/T/ENG/VARIANT/Table12',
                   %s,'APPROVED') RETURNING table_id""",
        (tid, json.dumps({"columns": ["A", "B", "C", "D", "E"], "keyLabel": "Size"})))
    table_id = cur.fetchone()[0]
    for i, (key, vals) in enumerate(TABLE12_ROWS):
        cur.execute(
            """INSERT INTO tbl_data_row (table_id, row_key, row_key_num, row_values, sort_order)
               VALUES (%s,%s,%s,%s,%s)""", (table_id, key, key, json.dumps(vals), i))
    logger.info("seed v3 complete — Table12 %d rows", len(TABLE12_ROWS))


# ── seed v4 — RBAC 데모(edim→ADMIN) + 알림 샘플 ──

def seed_v4(cur, tid: int) -> None:
    cur.execute("SELECT 1 FROM sys_notification WHERE tenant_id=%s LIMIT 1", (tid,))
    if cur.fetchone():
        return
    cur.execute(
        "UPDATE sys_user SET user_level='ADMIN' WHERE tenant_id=%s AND login_id='edim'", (tid,))
    cur.execute(
        "SELECT user_id FROM sys_user WHERE tenant_id=%s AND login_id='edim'", (tid,))
    uid = cur.fetchone()[0]
    for ntype, title in [
        ("APPROVAL_REQUEST", "승인 요청 — 도면 KDCR 3-13 Rev.B (Kim)"),
        ("DEADLINE_WARN", "기한 경고 — PS-612 MR 제작의뢰 초과 2일"),
    ]:
        cur.execute(
            """INSERT INTO sys_notification (tenant_id, user_id, notify_type, title, link_url)
               VALUES (%s,%s,%s,%s,'/common')""", (tid, uid, ntype, title))
    logger.info("seed v4 complete — edim=ADMIN, 알림 2건")


# ── seed v5 — 치수 정의 이행 (dwg_drawing + tbx_macro + dwg_dimension) ──

DIMS_V5 = [
    # (label, type, variant, macro_expr)
    ("A", "KEY", 670, None),
    ("B", "KEY", None, "=A+56"),
    ("C", "DETAIL", 45, None),
    ("D", "DETAIL", None, "=Table12(B,710)"),
    ("E", "DETAIL", 320, None),
    ("K", "KEY", None, "=A*1.62"),
]


def seed_v5(cur, tid: int) -> None:
    cur.execute(
        "SELECT 1 FROM dwg_drawing WHERE tenant_id=%s AND drawing_no='KDCR 3-13'", (tid,))
    if cur.fetchone():
        return
    cur.execute(
        """INSERT INTO dwg_drawing (tenant_id, drawing_no, drawing_name, drawing_type,
           dwg_kind, current_rev, status)
           VALUES (%s,'KDCR 3-13','Fan 원심 Casing 제작도','PART','MANUFACTURING','B','APPROVED')
           RETURNING drawing_id""", (tid,))
    drawing_id = cur.fetchone()[0]
    cur.execute(
        "SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code='KDCR 3-13'",
        (tid,))
    pc = cur.fetchone()
    # Studio 데모 Macro (APPROVED — 실행 이력 포함)
    cur.execute(
        """INSERT INTO tbx_macro (tenant_id, macro_name, prompt_text, macro_expr,
           description_text, status, hierarchy_address, test_input, test_result)
           VALUES (%s,'Shaft 길이 계산',
                   'SS Fan 샤프트의 길이 계산 — Table 참조 합산',
                   'IF(MC>500, Table12(E,560:800,Cos2)+Var(FES,15), Table12(E,560:800,Cos1)+Var(FES,15))*PreC(1)',
                   'Impeller/Casing/Bearing 폭을 더해 Shaft 길이를 계산',
                   'APPROVED','/M/ENG/FAN/SHAFT',
                   %s, %s)""",
        (tid, json.dumps({"MC": 520, "FES": 15}), json.dumps({"value": 2685})))
    for label, dtype, variant, expr in DIMS_V5:
        macro_id = None
        if expr:
            cur.execute(
                """INSERT INTO tbx_macro (tenant_id, macro_name, macro_expr, status,
                   hierarchy_address)
                   VALUES (%s,%s,%s,'APPROVED',%s) RETURNING macro_id""",
                (tid, f"DIM {label} (KDCR 3-13)", expr, f"/M/ENG/FAN/DIM_{label}"))
            macro_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO dwg_dimension (tenant_id, drawing_id, product_code_id,
               dim_label, dim_type, macro_id, variant_value)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (tid, drawing_id, pc[0] if pc else None, label, dtype, macro_id, variant))
    logger.info("seed v5 complete — dwg_dimension %d건 (Macro 바인딩)", len(DIMS_V5))


# ── seed v6 — UI 번역 (sys_translation, REQ-N-015/SYS-021) ──
# key(≤40자) → (en, ja, zh) — KO 는 프론트 기본 문자열 (폴백)

UI_TRANSLATIONS: dict[str, tuple[str, str, str]] = {
    "common.query": ("Query", "照会", "查询"),
    "common.new": ("New", "新規", "新建"),
    "common.delete": ("Delete", "削除", "删除"),
    "common.save": ("Save", "保存", "保存"),
    "common.apply": ("Apply", "適用", "应用"),
    "common.approve": ("Approve", "承認", "批准"),
    "common.reject": ("Reject", "差戻", "驳回"),
    "common.upload": ("Upload", "アップロード", "上传"),
    "common.download": ("Download", "ダウンロード", "下载"),
    "common.total": ("Total", "合計", "合计"),
    "shell.file": ("File", "ファイル", "文件"),
    "shell.edit": ("Edit", "編集", "编辑"),
    "shell.view": ("View", "照会", "查看"),
    "shell.tools": ("Tools", "ツール", "工具"),
    "shell.window": ("Window", "ウィンドウ", "窗口"),
    "shell.help": ("Help", "ヘルプ", "帮助"),
    "shell.common": ("Common", "共通", "公共"),
    "shell.todo": ("To-Do", "To-Do", "待办"),
    "shell.alerts": ("Notifications", "通知", "通知"),
    "shell.searchPh": ("Search screen·code·drawing (⌘K)", "画面・コード・図面検索 (⌘K)", "搜索画面·代码·图纸 (⌘K)"),
    "shell.openHint": ("Open a screen from the left menu", "左メニューから画面を開いてください", "请从左侧菜单打开画面"),
    "shell.openHint2": ("Double-click = new tab (MDI)", "ダブルクリック＝新タブ (MDI)", "双击＝新标签页 (MDI)"),
    "shell.pending": ("Pending approvals", "承認待ち", "待审批"),
    "login.title": ("Sign in", "ログイン", "登录"),
    "login.userId": ("User ID", "社員番号", "工号"),
    "login.password": ("Password", "パスワード", "密码"),
    "login.tenant": ("Tenant", "テナント", "租户"),
    "login.submit": ("Sign in (Enter)", "ログイン (Enter)", "登录 (Enter)"),
    "login.checking": ("Checking…", "確認中…", "验证中…"),
    "cpq.airflow": ("Airflow", "風量", "风量"),
    "cpq.pressure": ("Static P.", "静圧", "静压"),
    "cpq.applyF8": ("Apply F8", "適用 F8", "应用 F8"),
    "cpq.finishedCode": ("Finished Goods Code", "完成品コード", "成品代码"),
    "cpq.slotSpec": ("Selected Spec (Slot)", "選択仕様 (Slot)", "选择规格 (Slot)"),
    "cpq.bomTitle": ("BOM · Live Pricing", "BOM・リアルタイム価格", "BOM·实时价格"),
    "cpq.quotePreview": ("Quote Preview", "見積プレビュー", "报价预览"),
    "cpq.specExcel": ("Spec Excel ⬆", "仕様 Excel ⬆", "规格 Excel ⬆"),
    "cpq.qty": ("Qty", "数量", "数量"),
    "cpq.name": ("Name", "品名", "品名"),
    "cpq.amount": ("Amount(K)", "金額(千)", "金额(千)"),
}


def seed_v6(cur, tid: int) -> None:
    cur.execute(
        "SELECT 1 FROM sys_translation WHERE tenant_id=%s AND entity_type='UI' LIMIT 1", (tid,))
    if cur.fetchone():
        return
    n = 0
    for key, (en, ja, zh) in UI_TRANSLATIONS.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                   VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))
            n += 1
    logger.info("seed v6 complete — UI 번역 %d행 (en/ja/zh)", n)


# ── seed v7 — UI 번역 확장: 화면 제목·메뉴 트리·공통 버튼·CAD (REQ-N-015) ──
# key 체계: screen.<screenId> = MDI 탭 제목 / menu.<nodeId> = 좌측 트리 라벨 / common·shell·cad

UI_TRANSLATIONS_V7: dict[str, tuple[str, str, str]] = {
    # 화면 제목 (한글 포함 화면만 — 영문 제목은 폴백 사용)
    "screen.cpq-selection": ("Product Selection — AHU 5", "製品選定 — AHU 5", "产品选定 — AHU 5"),
    "screen.cpq-techdata": ("Technical Data", "技術データ", "技术数据"),
    "screen.code-subcode": ("Sub Code Registration", "Sub Code 登録", "Sub Code 注册"),
    "screen.code-datatable": ("Data Table", "データ Table", "数据 Table"),
    "screen.cpq-docmgmt": ("Document Box", "文書ボックス", "文档箱"),
    "screen.plm-duct": ("Building Duct", "建築設備 Duct", "建筑设备 Duct"),
    "screen.erp-access": ("Users & Permissions", "ユーザー・権限", "用户·权限"),
    "screen.com-approval": ("Approval Inbox", "承認箱", "审批箱"),
    "screen.com-tasks": ("Dept. Task Box", "部署業務箱", "部门任务箱"),
    "screen.com-mobile": ("Mobile Preview", "Mobile プレビュー", "Mobile 预览"),
    "screen.erp-project": ("Project Registration", "Project 登録", "Project 注册"),
    "screen.erp-price": ("Price Management", "単価管理", "单价管理"),
    "screen.erp-purchase": ("Purchase & PO", "購買・発注", "采购·下单"),
    # 좌측 메뉴 트리 (리프 = 화면코드 유지)
    "menu.cpq-selection": ("Product Selection (C-1)", "製品選定 (C-1)", "产品选定 (C-1)"),
    "menu.cpq-techdata": ("Technical Data (C-2)", "技術データ (C-2)", "技术数据 (C-2)"),
    "menu.cpq-docmgmt": ("Document Box (M-5-4)", "文書ボックス (M-5-4)", "文档箱 (M-5-4)"),
    "menu.plm-material": ("Material — planned", "Material — 予定", "Material — 待定"),
    "menu.plm-quality": ("Quality — planned", "Quality — 予定", "Quality — 待定"),
    "menu.plm-arr": ("Arrangement Set-Up — planned", "Arrangement Set-Up — 予定", "Arrangement Set-Up — 待定"),
    "menu.plm-duct": ("Building Duct (M-4-3)", "建築設備 Duct (M-4-3)", "建筑设备 Duct (M-4-3)"),
    "menu.code-subcode": ("Sub Code Registration (S-1-1)", "Sub Code 登録 (S-1-1)", "Sub Code 注册 (S-1-1)"),
    "menu.code-raw": ("Raw Material·GPI — planned", "Raw Material·GPI — 予定", "Raw Material·GPI — 待定"),
    "menu.code-datatable": ("Data Table Mgmt (M-3-7)", "データ Table 管理 (M-3-7)", "数据 Table 管理 (M-3-7)"),
    "menu.code-variant": ("Variant·Constant — planned", "Variant·Constant — 予定", "Variant·Constant — 待定"),
    "menu.erp-purchase": ("PR·PO (M-8-2)", "発注 PR·PO (M-8-2)", "采购 PR·PO (M-8-2)"),
    "menu.erp-price": ("Price Management (M-12-5)", "単価管理 (M-12-5)", "单价管理 (M-12-5)"),
    "menu.erp-access": ("Users & Permissions (M-14-6)", "ユーザー・権限 (M-14-6)", "用户·权限 (M-14-6)"),
    "menu.tbx-templet": ("Templet Mgmt — planned", "Templet 管理 — 予定", "Templet 管理 — 待定"),
    "menu.com-approval": ("Approval Inbox (M-15-2)", "承認箱 (M-15-2)", "审批箱 (M-15-2)"),
    "menu.com-tasks": ("Dept. Task Box (M-15-3)", "部署業務箱 (M-15-3)", "部门任务箱 (M-15-3)"),
    "menu.com-folder": ("Project Folder·History (M-15-8/9)", "Project Folder·履歴 (M-15-8/9)", "Project Folder·历史 (M-15-8/9)"),
    "menu.com-mobile": ("Mobile App Preview (M-16)", "Mobile App プレビュー (M-16)", "Mobile App 预览 (M-16)"),
    "menu.com-search": ("Global Search — planned", "統合検索 — 予定", "全局搜索 — 待定"),
    "menu.moduleCommon": ("Common", "共通", "公共"),
    # 신규 화면 메뉴 라벨 (한글 잔존 해소 — check_i18n_en)
    "menu.cpq-xreview": ("X-code Review (C-1X)", "X-codeレビュー (C-1X)", "X-code 审核 (C-1X)"),
    "menu.plm-eco": ("Design Change ECO/ECN (D-5)", "設計変更 ECO/ECN (D-5)", "设计变更 ECO/ECN (D-5)"),
    "menu.plm-eco-ledger": ("Change History Ledger (D-5L)", "変更履歴台帳 (D-5L)", "变更历史台账 (D-5L)"),
    "menu.plm-bom-compare": ("BOM Compare (G-3B)", "BOM比較 (G-3B)", "BOM 比较 (G-3B)"),
    "menu.code-master": ("Product Code Master (M-3-8)", "製品コードマスタ (M-3-8)", "产品编码主数据 (M-3-8)"),
    "menu.i18n-data": ("Data Translation (M-13-2)", "データ翻訳 (M-13-2)", "数据翻译 (M-13-2)"),
    "menu.erp-sales-order": ("Sales Order (D-1)", "受注管理 (D-1)", "订单管理 (D-1)"),
    "menu.erp-milestone": ("Schedule / Milestone (D-7)", "日程・マイルストーン (D-7)", "进度・里程碑 (D-7)"),
    "menu.erp-calendar": ("Workday / Holiday Calendar (M-8-6)", "稼働日・休日カレンダー (M-8-6)", "工作日・假日日历 (M-8-6)"),
    "menu.erp-finance": ("Multi-currency / Tax Master (M-13-1)", "多通貨・税マスタ (M-13-1)", "多币种・税务主数据 (M-13-1)"),
    "menu.erp-po": ("PO Lifecycle (G-3)", "発注ライフサイクル (G-3)", "采购生命周期 (G-3)"),
    "menu.erp-inventory": ("Inventory (D-2)", "在庫管理 (D-2)", "库存管理 (D-2)"),
    "menu.erp-work-order": ("Work Order (D-3)", "作業指示 (D-3)", "工单 (D-3)"),
    "menu.erp-quality": ("Inspection / Quality (D-4)", "検査・品質 (D-4)", "检验・质量 (D-4)"),
    "menu.erp-cost-actual": ("Cost Actual / Variance (D-6)", "原価実績・差異 (D-6)", "成本实绩・差异 (D-6)"),
    "menu.erp-anomaly": ("Anomaly Event (M-14-4A)", "異常イベント (M-14-4A)", "异常事件 (M-14-4A)"),
    "menu.erp-audit": ("Audit Log (M-14-6A)", "監査照会 (M-14-6A)", "审计查询 (M-14-6A)"),
    "menu.tbx-runs": ("Run History / Cleanup (E-3)", "Run履歴・整理 (E-3)", "Run 历史・清理 (E-3)"),
    # 공통 버튼 확장
    "common.preview": ("Preview", "プレビュー", "预览"),
    "common.close": ("Close", "閉じる", "关闭"),
    "common.edit": ("Edit", "編集", "编辑"),
    "common.print": ("Print", "印刷", "打印"),
    "common.tempSave": ("Temp Save F12", "一時保存 F12", "暂存 F12"),
    "common.requestApproval": ("Request Approval", "承認依頼", "请求审批"),
    "common.runningTest": ("Running Test", "Running Test", "Running Test"),
    "common.backToList": ("Back to List", "一覧へ戻る", "返回列表"),
    "shell.todoApproval": ("Approvals", "承認確認", "审批确认"),
    "shell.todoPl": ("PL delayed", "PL 遅延", "PL 延迟"),
    # CAD
    "cad.hint": ("Wheel zoom · drag pan · dblclick fit · click = props",
                 "ホイール拡大・ドラッグ移動・Wクリック合わせ・クリック＝属性",
                 "滚轮缩放·拖动平移·双击适配·单击=属性"),
    "cad.measureHint": ("Click two points = distance · endpoint/center snap",
                        "2点クリック＝距離計測・端点/中心スナップ",
                        "点击两点=测距·端点/中心捕捉"),
    "cad.measure": ("Measure", "計測", "测量"),
    "cad.layer": ("Layer", "レイヤー", "图层"),
    "cad.fitTitle": ("Fit (double-click)", "フィット (Wクリック)", "适配 (双击)"),
}


def seed_v7(cur, tid: int) -> None:
    # 키 단위 멱등 — v7 사전에 키가 추가되면 누락분만 삽입
    cur.execute(
        """SELECT DISTINCT field FROM sys_translation
           WHERE tenant_id=%s AND entity_type='UI' AND locale='en'""", (tid,))
    have = {r[0] for r in cur.fetchall()}
    n = 0
    for key, (en, ja, zh) in UI_TRANSLATIONS_V7.items():
        if key in have:
            continue
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                   VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))
            n += 1
    if n:
        logger.info("seed v7 — UI 번역 확장 %d행 삽입 (화면·메뉴·CAD)", n)


# ── seed v8 — 도면 대장 (B7): Rev 이력·Supersedure 실데이터 + Run DXF 도면 연결 ──

def seed_v8(cur, tid: int) -> None:
    cur.execute(
        "SELECT drawing_id FROM dwg_drawing WHERE tenant_id=%s AND drawing_no='KDCR 3-13'",
        (tid,))
    row = cur.fetchone()
    if not row:
        return   # v5 도면이 아직 없음 (다음 기동 시 처리)
    did = row[0]
    # Run 산출 DXF 는 KDCR 3-13 제작도(build_part_dxf) — 미연결분 도면에 연결 (매 기동 멱등)
    cur.execute(
        """UPDATE dwg_file SET drawing_id=%s
           WHERE tenant_id=%s AND drawing_id IS NULL AND folder='DWG' AND file_type='DXF'""",
        (did, tid))
    cur.execute("SELECT 1 FROM dwg_revision WHERE drawing_id=%s", (did,))
    if cur.fetchone():
        return
    for rev, rdate, reason, by in [
        ("A", "2026-06-12", "최초 발행", "YS.Gang"),
        ("B", "2026-06-28", "흡입콘 치수 보정 (E 310→320)", "Kim"),
    ]:
        cur.execute(
            """INSERT INTO dwg_revision (drawing_id, rev_no, rev_date, rev_reason, revised_by)
               VALUES (%s,%s,%s,%s,%s)""", (did, rev, rdate, reason, by))
    # 구형 도면 + 대체 이력 (Supersedure 화면 실데이터)
    cur.execute(
        """INSERT INTO dwg_drawing (tenant_id, drawing_no, drawing_name, drawing_type,
           dwg_kind, current_rev, status)
           VALUES (%s,'KDCR 3-12','Fan 원심 Casing 제작도 (구형)','PART','MANUFACTURING',
                   'C','RELEASED')
           RETURNING drawing_id""", (tid,))
    old_id = cur.fetchone()[0]
    cur.execute(
        """INSERT INTO dwg_revision (drawing_id, rev_no, rev_date, rev_reason, revised_by)
           VALUES (%s,'C','2026-05-30','최종 개정 (단종)','YS.Gang')""", (old_id,))
    cur.execute(
        """INSERT INTO dwg_supersedure (tenant_id, old_drawing_id, new_drawing_id,
           reason, superseded_date)
           VALUES (%s,%s,%s,'설계 개정 — 신형 Casing 계열(3-13)로 대체','2026-06-12')""",
        (tid, old_id, did))
    logger.info("seed v8 complete — dwg_revision 3건 · dwg_supersedure 1건 · Run DXF 연결")


# ── seed v9 — UI 번역 전면 확장 (B9): 24화면 크롬 라벨 (REQ-N-015) ──
# 생성 유틸: tools/gen_i18n_bundles.py 가 이 사전들에서 프론트 OFFLINE_BUNDLES 를 생성

UI_TRANSLATIONS_V9: dict[str, tuple[str, str, str]] = {
    "access.accountActions": ("Account Actions — {n}", "アカウント操作 — {n}", "账户操作 — {n}"),
    "access.action": ("Action", "操作", "操作"),
    "access.addUser": ("＋ Add User", "＋ ユーザー登録", "＋ 添加用户"),
    "access.at": ("Timestamp", "日時", "时间"),
    "access.auditLog": ("Recent Audit Log", "最近の監査ログ", "最近审计日志"),
    "access.changeLevel": ("Change Level (Audited)", "レベル変更 (監査)", "变更级别 (审计)"),
    "access.deactivate": ("Deactivate", "無効化", "停用"),
    "access.inviteMail": ("Invite Mail", "招待メール", "邀请邮件"),
    "access.level": ("Level", "レベル", "级别"),
    "access.name": ("Name", "氏名", "姓名"),
    "access.principle1": ("4-tier levels PLATFORM/ADMIN/SETUP/GENERAL",
        "レベル4段階 PLATFORM/ADMIN/SETUP/GENERAL",
        "级别分4级 PLATFORM/ADMIN/SETUP/GENERAL"),
    "access.principle2": ("Unauthorized menus are hidden — front-end hiding is not security (re-checked in service)",
        "権限のないメニューは非表示 — フロント非表示はセキュリティではない(サービス再検査)",
        "无权限菜单不显示 — 前端隐藏不等于安全(服务端复检)"),
    "access.principle3": ("Tenant management (ADM-001) is Platform-only",
        "テナント管理(ADM-001)は Platform 専用",
        "租户管理(ADM-001)仅限 Platform"),
    "access.principles": ("Principles", "原則", "原则"),
    "access.resource": ("Resource", "リソース", "资源"),
    "access.role": ("Role", "ロール", "角色"),
    "access.roleEdit": ("Edit Role — {n} (default: permission approval spec 98-menu matrix)",
        "ロール編集 — {n} (既定: 権限承認定義書 98メニューマトリクス)",
        "角色编辑 — {n} (默认: 权限审批定义书 98菜单矩阵)"),
    "access.search": ("Search", "検索", "搜索"),
    "access.searchPh": ("login·name", "login・氏名", "login·姓名"),
    "access.unlock": ("Unlock", "ロック解除", "解锁"),
    "access.userCount": ("Users — {n}", "ユーザー — {n}名", "用户 — {n}人"),
    "appr.after": ("After", "変更後", "变更后"),
    "appr.assetType": ("Asset Type", "資産種別", "资产类型"),
    "appr.before": ("Before", "変更前", "变更前"),
    "appr.commentPh": ("Comment (required on reject)", "コメント (差戻時必須)", "备注 (驳回时必填)"),
    "appr.date": ("Date", "日付", "日期"),
    "appr.delegatedReqs": ("Delegated Requests", "委任された依頼", "受托请求"),
    "appr.detail": ("Detail", "詳細", "详情"),
    "appr.drawing": ("Drawing", "図面", "图纸"),
    "appr.history": ("History", "履歴", "历史"),
    "appr.inbox": ("Approval Inbox", "承認箱", "审批箱"),
    "appr.input": ("Input", "入力", "输入"),
    "appr.mobileSync": ("Mobile Sync", "モバイル同期", "移动同步"),
    "appr.mobileSyncDesc": ("Same data·rules as mobile approval (M-16) (APP-002)",
        "モバイル承認(M-16)と同一データ・ルール (APP-002)",
        "与移动审批(M-16)相同数据·规则 (APP-002)"),
    "appr.myReqs": ("My Requests", "自分の依頼", "我的请求"),
    "appr.noCircular": ("No Circular References", "循環参照なし", "无循环引用"),
    "appr.refIntegrity": ("Referential Integrity", "参照整合性", "引用完整性"),
    "appr.reqDate": ("Request Date", "依頼日", "请求日期"),
    "appr.reqKind": ("Request Kind", "依頼区分", "请求类别"),
    "appr.requester": ("Requester", "依頼者", "请求人"),
    "appr.result": ("Result", "結果", "结果"),
    "appr.revCompare": ("Rev Compare: Rev.A → Rev.B (dimension B re-review applied)",
        "Rev 比較: Rev.A → Rev.B (寸法B再検討反映)",
        "Rev 比较: Rev.A → Rev.B (尺寸B复审反映)"),
    "appr.rule1": ("On approve, transitions approval_status=APPROVED",
        "承認時 approval_status=APPROVED へ遷移",
        "审批通过时迁移为 approval_status=APPROVED"),
    "appr.rule2": ("System DB-affecting work requires Platform approval",
        "System DB 影響作業は Platform 承認必須",
        "影响 System DB 的操作需 Platform 审批"),
    "appr.rule3": ("AI outputs approvable only after passing verification (Test)",
        "AI 生成物は検証(Test)通過後のみ承認可能",
        "AI 生成物仅在通过验证(Test)后可审批"),
    "appr.rules": ("Approval Rules", "承認ルール", "审批规则"),
    "appr.selectReq": ("Select a request", "依頼を選択してください", "请选择请求"),
    "appr.slotReview": ("Review Slot definition·value list changes", "Slot 定義・値リスト変更レビュー", "Slot 定义·值列表变更审查"),
    "appr.stage": ("Stage", "段階", "阶段"),
    "appr.status": ("Status", "状態", "状态"),
    "appr.tableFormDoc": ("Table · Form · Document", "Table · Form · 文書", "Table · Form · 文档"),
    "appr.target": ("Target", "対象", "对象"),
    "appr.toProcess": ("Requests to Process", "処理する依頼", "待处理请求"),
    "appr.toProcessN": ("Requests to Process — {n}", "処理する依頼 — {n}件", "待处理请求 — {n}件"),
    "appr.type": ("Type", "種別", "类型"),
    "bell.empty": ("No notifications", "通知なし", "无通知"),
    "bell.readAll": ("Mark All Read", "すべて既読", "全部已读"),
    "bell.title": ("Notifications", "通知", "通知"),
    "bell.unreadPoll": ("Unread {n} · 60s polling", "未読 {n} · 60s ポーリング", "未读 {n} · 60s 轮询"),
    "codrel.childGroup": ("[ Child Group ] — double-click = Code detail",
        "[ Child Group ] — ダブルクリック＝コード詳細",
        "[ Child Group ] — 双击=代码详情"),
    "codrel.codeSourceHint": ("Code Source: shows each Slot's item definitions · 3D ☑ 2D ☐",
        "Code Source: 各 Slot の項目定義を表示 · 3D ☑ 2D ☐",
        "Code Source: 显示各 Slot 的项目定义 · 3D ☑ 2D ☐"),
    "codrel.runHint": ("Select Mother Slot combo (B·C·E) and Run — verifies full expansion of matching Children",
        "Mother Slot 組合せ(B・C・E)を選択して Run — 条件一致 Child 全量展開を検証",
        "选择 Mother Slot 组合(B·C·E)并 Run — 验证条件匹配 Child 全量展开"),
    "codrel.slotMap": ("Slot Mapping", "Slot マッピング", "Slot 映射"),
    "codrel.slotMapHint": ("Slot mapping (slot_map) propagates Mother values into Child code digits (CODE-008)",
        "Slot マッピング(slot_map)で Mother 値が Child コード桁へ伝播 (CODE-008)",
        "通过 Slot 映射(slot_map)将 Mother 值传播到 Child 代码位 (CODE-008)"),
    "codrel.testNeeded": ("Test Required", "Test 必要", "需 Test"),
    "codrel.testPassed": ("Running Test Passed", "Running Test 合格", "Running Test 通过"),
    "cvs.cmd": ("Command:", "コマンド:", "命令:"),
    "dash.alertsTitle": ("Anomaly Alerts (Time·Cash) — double-click = event detail",
        "異常警告 (時間・資金) — ダブルクリック＝イベント詳細",
        "异常警报 (时间·资金) — 双击=事件详情"),
    "dash.blkCost": ("Cost 18.8", "原価 18.8", "成本 18.8"),
    "dash.blkIn": ("Inflow +9.1", "入金 +9.1", "收款 +9.1"),
    "dash.blkOrder": ("Orders 23.0", "受注 23.0", "接单 23.0"),
    "dash.blkOut": ("Outflow -4.2", "出金 -4.2", "付款 -4.2"),
    "dash.cashTitle": ("Cash Flow (Purchase Out · Sales In)", "資金フロー (仕入出金 · 売上入金)", "资金流 (采购付款 · 销售收款)"),
    "dash.content": ("Content", "内容", "内容"),
    "dash.dept": ("Dept.", "部署", "部门"),
    "dash.deptEvents": ("Events by Dept.", "部署別 Event 状況", "各部门 Event 状况"),
    "dash.doneWeek": ("Done (wk)", "完了(週)", "完成(周)"),
    "dash.flowAp": ("AP Approval Docs", "AP 承認図書", "AP 审批文档"),
    "dash.flowApp": ("APP Customer Approval", "APP 顧客承認", "APP 客户审批"),
    "dash.flowDf": ("DF Delivery", "DF 納品", "DF 交付"),
    "dash.flowFf": ("FF Completion", "FF 完成", "FF 完工"),
    "dash.flowHint": ("Currently at OR order stage — automatic (☑) processes transition via EDIM Run outputs",
        "現在 OR 受注段階 — 自動(☑)プロセスは EDIM Run 成果物で状態遷移",
        "当前处于 OR 接单阶段 — 自动(☑)流程由 EDIM Run 产出物驱动状态迁移"),
    "dash.flowIr": ("IR Progress Billing", "IR 出来高請求", "IR 进度请款"),
    "dash.flowMi": ("MI Receiving", "MI 入庫", "MI 入库"),
    "dash.flowMp": ("MP Production Plan", "MP 生産計画", "MP 生产计划"),
    "dash.flowMr": ("MR Mfg. Request", "MR 製作依頼", "MR 制作委托"),
    "dash.flowOr": ("OR Order", "OR 受注", "OR 接单"),
    "dash.flowPcr": ("PCR Quote Review", "PCR 見積検討", "PCR 报价审查"),
    "dash.flowPo": ("PO Ordering", "PO 発注", "PO 下单"),
    "dash.flowPr": ("PR Order Request", "PR 発注依頼", "PR 下单申请"),
    "dash.flowPs": ("PS Registration", "PS 登録", "PS 注册"),
    "dash.flowQcr": ("QCR Quote", "QCR 見積", "QCR 报价"),
    "dash.flowWr": ("WR Work Order", "WR 作業指示", "WR 工单"),
    "dash.kind": ("Kind", "区分", "类别"),
    "dash.kindMoney": ("Cash", "資金", "资金"),
    "dash.kindTime": ("Time", "時間", "时间"),
    "dash.kpiAlerts": ("Anomaly Alerts (Time·Cash)", "異常警告 (時間・資金)", "异常警报 (时间·资金)"),
    "dash.kpiApprovalWait": ("Pending Approval", "承認待ち", "待审批"),
    "dash.kpiMonthOrder": ("Orders This Month", "今月の受注", "本月接单"),
    "dash.kpiRunning": ("Active Project", "進行中 Project", "进行中 Project"),
    "dash.monAug": ("Aug", "08月", "08月"),
    "dash.monSep": ("Sep", "09月", "09月"),
    "dash.processStatus": ("Project Up/Downstream Process Status — {n}",
        "Project 前後工程状況 — {n}",
        "Project 前后工序状况 — {n}"),
    "dash.profitTitle": ("Profit/Loss by Project (Order·Cost·Margin)",
        "Project 別損益 (受注額・原価・マージン)",
        "各 Project 损益 (接单额·成本·毛利)"),
    "dash.sourceHint": ("Source: erp_process_event state machine (ERP-014) · roles ADMIN·Mgmt",
        "集計元: erp_process_event 状態機械 (ERP-014) · 権限 ADMIN・経営",
        "汇总来源: erp_process_event 状态机 (ERP-014) · 权限 ADMIN·经营"),
    "docmgmt.addDoc": ("＋ Add Document", "＋ 文書登録", "＋ 添加文档"),
    "docmgmt.approveWaiting": ("Approve Pending", "Approve 待ち", "Approve 待定"),
    "docmgmt.cancel": ("Cancel", "キャンセル", "取消"),
    "docmgmt.category": ("Category", "分類", "分类"),
    "docmgmt.docLedger": ("Document Ledger — {n} (double-click = doc detail)",
        "文書台帳 — {n}件 (ダブルクリック＝文書詳細)",
        "文档台账 — {n}件 (双击=文档详情)"),
    "docmgmt.docType": ("Document Type", "文書種別", "文档类型"),
    "docmgmt.gradeHint": ("S-1/S-2 force CONFIDENTIAL watermark · masked when under-privileged (DOC-002)",
        "S-1/S-2 は CONFIDENTIAL 透かし強制 · 権限不足時マスキング (DOC-002)",
        "S-1/S-2 强制 CONFIDENTIAL 水印 · 权限不足时脱敏 (DOC-002)"),
    "docmgmt.previewGrade": ("Preview — Grade Control", "プレビュー — Grade 統制", "预览 — Grade 管控"),
    "docmgmt.printHint": ("Watermark·print controls applied (real render)",
        "透かし・出力統制適用 (実レンダー)",
        "水印·打印管控生效 (实渲染)"),
    "docmgmt.regTitle": ("Add Document — doc_control", "文書登録 — doc_control", "文档登记 — doc_control"),
    "docmgmt.registerF12": ("Register F12", "登録 F12", "登记 F12"),
    "docmgmt.rendering": ("Rendering… (backend required)", "レンダリング中… (バックエンド必要)", "渲染中… (需要后端)"),
    "docmgmt.search": ("Search", "検索", "搜索"),
    "docmgmt.selDocProgress": ("Selected Document — {n} · Progress",
        "選択文書 — {n} · Progress",
        "所选文档 — {n} · Progress"),
    "docmgmt.selectDoc": ("Select a document", "文書を選択", "选择文档"),
    "docmgmt.statusFilter": ("Status Filter", "状態フィルター", "状态筛选"),
    "docmgmt.titleReq": ("Title *", "タイトル *", "标题 *"),
    "docmgmt.type": ("Type", "種別", "类型"),
    "doctpl.calcRefTable": ("Calc Reference Table", "計算参照 Table", "计算引用 Table"),
    "doctpl.chartTable": ("[Chart] · [Table]", "[チャート] · [Table]", "[图表] · [Table]"),
    "doctpl.correction": ("Correction", "補正", "校正"),
    "doctpl.densityCalcDoc": ("Density Calc Sheet", "密度計算書", "密度计算书"),
    "doctpl.fanPerfReport": ("Fan Performance Report", "Fan 性能 Report", "Fan 性能 Report"),
    "doctpl.formDef": ("Form definition: Document Set-up S-3-3 (CPQ-012)",
        "Form 定義: Document Set-up S-3-3 (CPQ-012)",
        "Form 定义: Document Set-up S-3-3 (CPQ-012)"),
    "doctpl.inputOutput": ("Input Data → Output Data (Macro calc)",
        "Input Data → Output Data (Macro 計算)",
        "Input Data → Output Data (Macro 计算)"),
    "doctpl.macroCalcF9": ("▶ Macro Calc F9", "▶ Macro 計算 F9", "▶ Macro 计算 F9"),
    "doctpl.printPreview": ("Print Preview", "Print プレビュー", "Print 预览"),
    "doctpl.psychroChart": ("Psychrometric Chart — calc points plotted (graph Templet)",
        "湿り空気線図 — 計算点表示 (グラフ Templet)",
        "焓湿图 — 显示计算点 (图形 Templet)"),
    "doctpl.spreadsheet": ("Spreadsheet (A~L — intermediate calc)",
        "スプレッドシート (A~L — 中間計算)",
        "电子表格 (A~L — 中间计算)"),
    "dtable.addRowF2": ("＋ Add Row F2", "＋ 行追加 F2", "＋ 添加行 F2"),
    "dtable.addressTitle": ("Table Address — Hierarchy = DB address",
        "Table Address — Hierarchy = DB アドレス",
        "Table Address — Hierarchy = DB 地址"),
    "dtable.apprStatus": ("Approval Status", "承認状態", "审批状态"),
    "dtable.gridTitle": ("Table12 — double-click cell = edit (Excel syntax)",
        "Table12 — セルダブルクリック ＝ 編集 (Excel 文法)",
        "Table12 — 双击单元格 = 编辑 (Excel 语法)"),
    "dtable.importRule1": ("Only structured-format Excel (row-1 header = column names) allowed",
        "定型様式(1行目ヘッダー = 列名)の Excel のみ許可",
        "仅允许规范格式(首行表头 = 列名)的 Excel"),
    "dtable.importRule2": ("Duplicate Key rows rejected — download error report",
        "Key 重複行は拒否 — エラーレポートをダウンロード",
        "Key 重复行拒绝 — 下载错误报告"),
    "dtable.importRule3": ("Text in numeric column ignores that cell (warning)",
        "数値列にテキスト混入時は該当セル無視(警告)",
        "数值列混入文本时忽略该单元格(警告)"),
    "dtable.importRules": ("Import Rules", "Import ルール", "Import 规则"),
    "dtable.keyHint": ("Numeric Key auto-parses row_key_num — range query (10:25) sort guaranteed",
        "Key が数値なら row_key_num 自動パース — 範囲照会(10:25)のソート保証",
        "Key 为数字时自动解析 row_key_num — 范围查询(10:25)保证排序"),
    "dtable.macroRefHint": ("Macro references via this path:", "Macro がこのパスで参照:", "Macro 通过此路径引用:"),
    "dtable.reapprovalHint": ("Re-approval required on save (Grade policy)",
        "変更保存時に再承認対象 (Grade ポリシー)",
        "变更保存时需重新审批 (Grade 政策)"),
    "dtable.refMacroTitle": ("Referencing Macro — 4 impacted", "参照 Macro — 影響度 4件", "引用 Macro — 影响 4件"),
    "dtable.screen": ("Screen", "画面", "画面"),
    "dtable.tableDef": ("Table Definition", "Table 定義", "Table 定义"),
    "dtable.unsaved": ("{n} changes unsaved", "変更 {n}件 未保存", "变更 {n}件 未保存"),
    "dtable.usage": ("Usage Formula", "使用式", "使用公式"),
    "duct.accessTurning": ("Access Door·Turning", "点検口・Turning", "检修口·Turning"),
    "duct.ach": ("Air Changes", "換気回数", "换气次数"),
    "duct.addDiffuser": ("Add Diffuser", "Diffuser 追加", "添加 Diffuser"),
    "duct.aiReadHint": ("AI reads architectural drawing: ramps·beams·fire zones·rooms → marks no-install areas (DUCT-001)",
        "建築図 AI 判読: ランプ・梁・防火区画・室区分 → 設置不可エリア表示 (DUCT-001)",
        "建筑图 AI 判读: 坡道·梁·消防分区·房间区分 → 标记不可安装区域 (DUCT-001)"),
    "duct.airCond": ("Air Conditions", "空気条件", "空气条件"),
    "duct.airflowBasis": ("Airflow Basis", "風量基準", "风量基准"),
    "duct.autoPlace": ("▶ Auto Place (shortest path·fluid flow)",
        "▶ 自動配置 (最短経路・流体フロー)",
        "▶ 自动布置 (最短路径·流体流动)"),
    "duct.basic": ("Basic", "基本", "基本"),
    "duct.calcHint": ("Calculates pressure loss·Leak·load after placement",
        "配置後に圧力損失・Leak・荷重を計算",
        "布置后计算压力损失·Leak·载荷"),
    "duct.ceiling": ("Ceiling Ht/Beam/Tile", "階高/梁/テックス", "层高/梁/吊顶板"),
    "duct.designCond": ("Design Conditions", "設計条件", "设计条件"),
    "duct.diffuserPlaced": ("{n} Diffusers auto-placed (qty adjustable)",
        "Diffuser {n}個を自動配置 (数量調整可)",
        "自动布置 Diffuser {n}个 (可调数量)"),
    "duct.drawingCall": ("Load Drawing (AI Read)", "図面呼出 (AI 判読)", "调用图纸 (AI 判读)"),
    "duct.edimHint1": ("Eng: BOM/Code · Mfg: min scrap", "技術: BOM/Code・製造: 最小スクラップ", "技术: BOM/Code·制造: 最少废料"),
    "duct.edimHint2": ("Material: purchasing · Sales: quote", "資材: 購買・営業: 見積", "物料: 采购·销售: 报价"),
    "duct.edimLink": ("EDIM Link", "EDIM 連携", "EDIM 关联"),
    "duct.equipment": ("Equipment", "機器", "设备"),
    "duct.exhaust": ("Exhaust", "排気", "排风"),
    "duct.floor": ("Floor", "階", "楼层"),
    "duct.heatLoad": ("Heat Load", "発熱", "发热"),
    "duct.highVel": ("High Vel.", "高速", "高速"),
    "duct.itemCol": ("Item", "項目", "项目"),
    "duct.lowVel": ("Low Vel.", "低速", "低速"),
    "duct.manualAdjust": ("Manual Adjust (Drag·Click)", "手動調整 (Drag・Click)", "手动调整 (Drag·Click)"),
    "duct.materialDb": ("Duct Material DB", "Duct 資材 DB", "Duct 材料 DB"),
    "duct.materialHint": ("Type·loss·weight·max length per Size",
        "種類・損失・重量・Size別最大長",
        "种类·损失·重量·按 Size 最大长度"),
    "duct.multiFloor": ("Multi Floor (Point XYZ)", "複数階 (Point XYZ)", "多楼层 (Point XYZ)"),
    "duct.occupancy": ("Occupancy", "人員", "人员"),
    "duct.room": ("Room", "室", "房间"),
    "duct.runAutoHint": ("▶ Run auto place", "▶ 自動配置を実行してください", "▶ 请执行自动布置"),
    "duct.scopeChip": ("Scope confirmation target (Suppl. Note §3.3)",
        "事業範囲確定対象 (補完ノート §3.3)",
        "业务范围待确定 (补充说明 §3.3)"),
    "duct.startEnd": ("Start–End", "始点–終点", "起点–终点"),
    "duct.stdSelect": ("Std Select", "Std 選択", "Std 选择"),
    "duct.supply": ("Supply Air", "給気", "送风"),
    "duct.techCalc": ("Technical Data Calc", "技術データ計算", "技术资料计算"),
    "duct.usage": ("Usage", "用途", "用途"),
    "duct.valueCol": ("Value", "値", "值"),
    "duct.velocityBasis": ("Velocity Basis", "流速基準", "流速基准"),
    "duct.vent": ("Ventilation", "換気", "通风"),
    "dwg.byCol": ("Handler", "処理者", "处理人"),
    "dwg.cancel": ("Cancel", "キャンセル", "取消"),
    "dwg.countChip": ("dwg_drawing {n} rows", "dwg_drawing {n}件", "dwg_drawing {n}件"),
    "dwg.dateCol": ("Date", "日付", "日期"),
    "dwg.dblOpenHint": ("Double-click = linked DXF CAD viewer",
        "ダブルクリック＝連結 DXF CAD ビューア",
        "双击＝关联 DXF CAD 查看器"),
    "dwg.drawingName": ("Drawing Name", "図面名", "图纸名称"),
    "dwg.drawingNo": ("Drawing No.", "図面番号", "图纸编号"),
    "dwg.fileCol": ("File (DXF)", "ファイル (DXF)", "文件 (DXF)"),
    "dwg.ledger": ("Drawing Ledger", "図面台帳", "图纸台账"),
    "dwg.listTitle": ("Drawing List — {n} (click = Rev history)",
        "図面一覧 — {n}件 (クリック＝Rev 履歴)",
        "图纸列表 — {n}件 (单击＝Rev 历史)"),
    "dwg.newNo": ("New Drawing", "新図面", "新图纸"),
    "dwg.nextRev": ("Next", "次", "下一"),
    "dwg.noPlaceholder": ("e.g. KDCR 3-15", "例: KDCR 3-15", "例: KDCR 3-15"),
    "dwg.noSup": ("No supersedure history", "代替履歴なし", "无替代历史"),
    "dwg.oldNo": ("Old Drawing", "旧図面", "旧图纸"),
    "dwg.queryF8": ("Query F8", "照会 F8", "查询 F8"),
    "dwg.reasonCol": ("Reason", "事由", "事由"),
    "dwg.regTitle": ("Drawing Registration — dwg_drawing", "図面登録 — dwg_drawing", "图纸注册 — dwg_drawing"),
    "dwg.registerF12": ("Register F12", "登録 F12", "注册 F12"),
    "dwg.registerF2": ("＋ Register Drawing F2", "＋ 図面登録 F2", "＋ 图纸注册 F2"),
    "dwg.revCount": ("Rev Count", "Rev 数", "Rev 数"),
    "dwg.revHistory": ("Rev History", "Rev 履歴", "Rev 历史"),
    "dwg.revReasonPh": ("Revision reason", "改訂事由", "修订事由"),
    "dwg.revUp": ("Rev Up", "Rev 上げ", "Rev 升版"),
    "dwg.selectHint": ("Select a drawing row on the left to view Rev history",
        "左の図面行を選択すると Rev 履歴が表示されます",
        "选择左侧图纸行即可显示 Rev 历史"),
    "dwg.selectOpt": ("(select)", "(選択)", "(选择)"),
    "dwg.statusCol": ("Status", "状態", "状态"),
    "dwg.supHint": ("Old drawing → new drawing supersede", "旧図面 → 新図面 代替", "旧图纸 → 新图纸 替代"),
    "dwg.supRegister": ("Register Supersedure", "代替登録", "替代注册"),
    "dwg.supTitle": ("Supersedure — {n} (dwg_supersedure)",
        "Supersedure — {n}件 (dwg_supersedure)",
        "Supersedure — {n}件 (dwg_supersedure)"),
    "dwg.superseded": ("Superseded", "代替済", "已替代"),
    "dwg.typeCol": ("Type", "種別", "类型"),
    "editor.asmSeq": ("Assembly Sequence", "組立順序", "装配顺序"),
    "editor.blockDblHint": ("Block double-click = part info detail",
        "Block ダブルクリック＝部品情報詳細",
        "Block 双击＝零件信息详情"),
    "editor.cadNeedsBackend": ("CAD server unavailable — please refresh (temporary connection error)",
        "CAD サーバー接続不可 — 更新してください (一時的な接続エラー)",
        "CAD 服务器不可用 — 请刷新 (临时连接错误)"),
    "editor.dblEdit": ("Double-click = edit", "ダブルクリック＝編集", "双击＝编辑"),
    "editor.designRule": ("Design Rule — Dimension Set-up",
        "Design Rule — 寸法 Set-up",
        "Design Rule — 尺寸 Set-up"),
    "editor.drawing": ("Drafting…", "作図中…", "绘图中…"),
    "editor.evaluated": ("Evaluated ✓", "評価 ✓", "评估 ✓"),
    "editor.exportDxf": ("Export DXF", "DXF エクスポート", "导出 DXF"),
    "editor.kindCol": ("Kind", "区分", "区分"),
    "editor.macroHint": ("EDIM Macro call → shows formula·direct input allowed",
        "EDIM Macro 呼出 → 計算式表示・直接入力可",
        "调用 EDIM Macro → 显示计算式·可直接输入"),
    "editor.openDxf": ("Open DXF", "DXF を開く", "打开 DXF"),
    "editor.relCond": ("Cond1: vertical·horizontal·center·middle / Cond2: contact(face·line·point)·coords·angle",
        "条件1: 垂直・水平・中心・中央 / 条件2: 接触(面・線・点)・座標・角度",
        "条件1: 垂直·水平·中心·中央 / 条件2: 接触(面·线·点)·坐标·角度"),
    "editor.relPriority": ("Priority: A/B ① → B/C ② (auto cycle check)",
        "優先順位: A/B ① → B/C ② (循環自動チェック)",
        "优先级: A/B ① → B/C ② (循环自动检查)"),
    "editor.relValue": ("Relation Value", "関係値", "关系值"),
    "editor.snapOn": ("Snap: endpoint·middle·center", "Snap: 端点・中央・中心", "Snap: 端点·中点·中心"),
    "editor.subItemDwg": ("Sub Item DWG · Assembly Sequence", "Sub Item DWG・組立順序", "Sub Item DWG·装配顺序"),
    "editor.toolCopy": ("Copy CO", "コピー CO", "复制 CO"),
    "editor.toolDim": ("Dimension DI", "寸法 DI", "尺寸 DI"),
    "editor.toolErase": ("Erase E", "削除 E", "删除 E"),
    "editor.toolExtend": ("Extend", "延長", "延伸"),
    "editor.toolMirror": ("Mirror", "反転", "镜像"),
    "editor.toolMove": ("Move", "移動", "移动"),
    "editor.toolProps": ("Properties CH", "属性 CH", "属性 CH"),
    "editor.toolRotate": ("Rotate RO", "回転 RO", "旋转 RO"),
    "editor.toolTrim": ("Trim TR", "トリム TR", "修剪 TR"),
    "editor.verifyMacro": ("Verify Macro", "検証 Macro", "验证 Macro"),
    "enum.active": ("Active", "適用中", "应用中"),
    "enum.all": ("All", "全体", "全部"),
    "enum.delayed": ("Delayed", "遅延", "延迟"),
    "enum.done": ("Done", "完了", "完成"),
    "enum.expired": ("Expired", "満了", "过期"),
    "enum.progress": ("In Progress", "進行", "进行"),
    "enum.purchase": ("Purchase", "購買", "采购"),
    "enum.quote": ("Quote", "見積", "报价"),
    "enum.quoteApplied": ("Quote Applied", "見積適用", "报价应用"),
    "enum.stock": ("Stock", "在庫", "库存"),
    "enum.waiting": ("Waiting", "待機", "待定"),
    "folder.action": ("Action", "作業", "操作"),
    "folder.actor": ("Actor", "作業者", "操作人"),
    "folder.at": ("Timestamp", "日時", "时间"),
    "folder.autoSaveHint": ("EDIM Run output auto-save convention (Overview §6) — dwg_file.folder CHECK 5 types",
        "EDIM Run 成果物自動保存規約 (概要 §6) — dwg_file.folder CHECK 5種",
        "EDIM Run 产出物自动保存规约 (概要 §6) — dwg_file.folder CHECK 5种"),
    "folder.batchOps": ("Batch Ops", "一括作業", "批量操作"),
    "folder.countDxfHint": ("{n} items (DXF double-click = CAD viewer)",
        "{n}件 (DXF ダブルクリック＝CAD ビューア)",
        "{n}件 (DXF 双击＝CAD 查看器)"),
    "folder.customerExport": ("Export for Customer", "顧客提出用エクスポート", "客户交付导出"),
    "folder.fileName": ("File Name", "ファイル名", "文件名"),
    "folder.historyTitle": ("History Query (sys_history) — diff = before/after JSON compare",
        "履歴照会 (sys_history) — diff = before/after JSON 比較",
        "历史查询 (sys_history) — diff = before/after JSON 比较"),
    "folder.linkedDrawing": ("Linked Drawing", "連結図面", "关联图纸"),
    "folder.receivedDesc": ("Received materials (S-3-5) + data migration originals preserved (Migration Plan §2-4)",
        "受付資料(S-3-5) + データ移行原本保存 (移行計画書 §2-4)",
        "接收资料(S-3-5) + 数据迁移原件保存 (迁移计划书 §2-4)"),
    "folder.receivedTitle": ("RECEIVED Folder", "RECEIVED フォルダ", "RECEIVED 文件夹"),
    "folder.selectFile": ("Select a file", "ファイルを選択してください", "请选择文件"),
    "folder.selectedFile": ("Selected File", "選択ファイル", "所选文件"),
    "folder.targetAll": ("Target: All", "対象: 全体", "对象: 全部"),
    "folder.zipDownload": ("ZIP Download", "ZIP ダウンロード", "ZIP 下载"),
    "mobile.approvalCaption": ("Approval Detail — QR entry", "承認詳細 — QR 進入", "审批详情 — QR 进入"),
    "mobile.arNote": ("AR view deferred until Digital Twin integration (APP-008)",
        "AR ビューは Digital Twin 連携後の対応 (APP-008)",
        "AR 视图待 Digital Twin 集成后处理 (APP-008)"),
    "mobile.arView": ("AR View", "AR ビュー", "AR 视图"),
    "mobile.attachPhoto": ("Attach Photo", "写真添付", "附加照片"),
    "mobile.designNote": ("Design Notes", "設計ノート", "设计笔记"),
    "mobile.designNoteBody": ("① QR entry (APP-001) ② Approvals share web inbox data (APP-002) ③ Project-centric chat History (APP-003) ④ Material·inspection with photo attach + offline cache (APP-004/005) — 32px touch-target exception noted",
        "① QR 進入 (APP-001) ② 承認はウェブ承認箱と同一データ (APP-002) ③ Project 中心の会話 History (APP-003) ④ 資材・検収は写真添付 + オフラインキャッシュ (APP-004/005) — タッチターゲット 32px 例外明記",
        "① QR 进入 (APP-001) ② 审批与网页审批箱同一数据 (APP-002) ③ 以 Project 为中心的对话 History (APP-003) ④ 物料·验收支持照片附件 + 离线缓存 (APP-004/005) — 明确 32px 触控目标例外"),
    "mobile.homeCaption": ("Home — Menu Grid", "ホーム — メニュー Grid", "首页 — 菜单 Grid"),
    "mobile.inspection": ("Inspection", "検収", "验收"),
    "mobile.maintenance": ("Maintenance", "保守", "维护"),
    "mobile.materialInOut": ("Material In/Out", "資材入出庫", "物料出入库"),
    "mobile.materialQrScan": ("Material QR Scan", "資材 QR スキャン", "物料 QR 扫描"),
    "mobile.notice": ("Notices", "お知らせ", "公告"),
    "mobile.projectChat": ("Project Chat", "Project コミュニケーション", "Project 沟通"),
    "mobile.projectChatHist": ("Project Chat (History)", "Project 会話 (History)", "Project 对话 (History)"),
    "mobile.projectInfo": ("Project Info", "Project 情報", "Project 信息"),
    "mobile.qrHint": ("QR is the single entry point — straight to drawings·documents·Project·tasks (for areas without PC access)",
        "QR がすべての入口 — 図面・書類・Project・業務へ直行 (PC 利用不可エリア対応)",
        "QR 是所有入口 — 直达图纸·文件·Project·业务 (应对无法使用电脑的区域)"),
    "mobile.qrScan": ("QR Scan", "QR スキャン", "QR 扫描"),
    "mobile.qrScanDesc": ("Access drawings·documents·Project·tasks",
        "図面・書類・Project・業務へアクセス",
        "访问图纸·文件·Project·业务"),
    "mobile.qty": ("Qty", "数量", "数量"),
    "mobile.receive": ("Receiving", "入庫処理", "入库处理"),
    "mobile.receiveCaption": ("Material Receiving — On-site", "資材入庫 — 現場処理", "物料入库 — 现场处理"),
    "mobile.request": ("Request", "依頼", "请求"),
    "mobile.taskApproval": ("Task Approval", "業務承認", "业务审批"),
    "mobile.warehouse": ("Warehouse", "倉庫", "仓库"),
    "price.addPrice": ("＋ Add Unit Price", "＋ 単価登録", "＋ 单价登记"),
    "price.applyDate": ("Apply Date", "適用日", "适用日"),
    "price.avg": ("Avg", "平均", "平均"),
    "price.baseDate": ("Base Date", "基準日", "基准日"),
    "price.cancel": ("Cancel", "キャンセル", "取消"),
    "price.currency": ("Currency", "通貨", "货币"),
    "price.last": ("Latest", "直近", "最近"),
    "price.ledger": ("Price Ledger — {n} rows (dblclick = code detail)",
        "単価台帳 — {n}件 (Wクリック＝コード詳細)",
        "单价台账 — {n}条 (双击=代码详情)"),
    "price.max": ("Max", "最高", "最高"),
    "price.min": ("Min", "最低", "最低"),
    "price.noExpiry": ("(no expiry)", "(無期限)", "(无期限)"),
    "price.noPrice": ("No unit price", "単価なし", "无单价"),
    "price.priceLbl": ("Unit Price", "単価", "单价"),
    "price.priceTable": ("Price Table", "単価 Table", "单价 Table"),
    "price.prio1": ("① Quote Applied", "① 見積適用", "① 报价适用"),
    "price.prio2": ("② Purchase History", "② 購買履歴", "② 采购记录"),
    "price.prio3": ("③ Stock Price", "③ 在庫単価", "③ 库存单价"),
    "price.prio4": ("④ Quote", "④ 見積", "④ 报价"),
    "price.priority": ("Apply Priority (Pricing Run resolve)",
        "適用優先順位 (Pricing Run resolve)",
        "适用优先级 (Pricing Run resolve)"),
    "price.priorityHint": ("Code·period match first — EXCLUDE constraint blocks period overlap (DB v0.5)",
        "Code・期間一致を優先 — EXCLUDE 制約で期間重複を遮断 (DB v0.5)",
        "Code·期间匹配优先 — EXCLUDE 约束阻止期间重叠 (DB v0.5)"),
    "price.queryF8": ("Query F8", "照会 F8", "查询 F8"),
    "price.regTitle": ("Add Unit Price — cst_price", "単価登録 — cst_price", "单价登记 — cst_price"),
    "price.registerF12": ("Register F12", "登録 F12", "登记 F12"),
    "price.resolveSim": ("Resolve Simulation", "Resolve シミュレーション", "Resolve 模拟"),
    "price.stockCalc": ("Stock Price Calc — {n} (auto from in/out, ERP-021)",
        "在庫単価算出 — {n} (入出庫ベース自動, ERP-021)",
        "库存单价计算 — {n} (基于出入库自动, ERP-021)"),
    "price.supplier": ("Supplier", "仕入先", "供应商"),
    "price.tableAll": ("All (4 types)", "全体 (4種)", "全部 (4种)"),
    "price.tableApplied": ("4. Quote Applied", "4. 見積適用", "4. 报价适用"),
    "price.tablePurchase": ("2. Purchase History", "2. 購買履歴", "2. 采购记录"),
    "price.tableQuote": ("1. Quote", "1. 見積", "1. 报价"),
    "price.tableStock": ("3. Stock Price", "3. 在庫単価", "3. 库存单价"),
    "price.validFrom": ("Valid From", "適用開始", "适用开始"),
    "price.validTo": ("Valid To", "適用終了", "适用结束"),
    "printsetup.a4Landscape": ("A4 Landscape", "A4 横", "A4 横向"),
    "printsetup.a4Portrait": ("A4 Portrait", "A4 縦", "A4 纵向"),
    "printsetup.approvalPending": ("Pending Approval", "承認待ち", "待审批"),
    "printsetup.color": ("Color", "色", "颜色"),
    "printsetup.colorOpt": ("Color", "カラー", "彩色"),
    "printsetup.dataBind": ("Data Placement", "Data 位置指定", "Data 位置指定"),
    "printsetup.dataCall": ("Data Call", "Data 呼出", "Data 调用"),
    "printsetup.dataCustomer": ("[Data] Customer·Date·Owner",
        "[Data] Customer·Date·担当",
        "[Data] Customer·Date·负责人"),
    "printsetup.defaultLayout": ("Default Form Layout", "基本様式配置", "默认样式布局"),
    "printsetup.export": ("Export", "エクスポート", "导出"),
    "printsetup.flowHint": ("Place placeholders → bind data paths → published Form rendered by SVC-11 (shared by quote·PCR·work order)",
        "プレースホルダー配置 → データパスバインド → 公開 Form は SVC-11 がレンダリング (見積書・PCR・作業指示書共通)",
        "放置占位符 → 绑定数据路径 → 已发布 Form 由 SVC-11 渲染 (报价单·PCR·工单通用)"),
    "printsetup.fontSize": ("Font / Size", "Font / サイズ", "Font / 大小"),
    "printsetup.footerPh": ("Footer — page · company info", "フッター — ページ・会社情報", "页脚 — 页码·公司信息"),
    "printsetup.gradeHint": ("Grade-controlled documents enforce watermark·print limits (DOC-002)",
        "Grade 統制文書は透かし・出力制限を強制 (DOC-002)",
        "Grade 管控文档强制水印·打印限制 (DOC-002)"),
    "printsetup.graphPerf": ("[Graph] Performance Curve", "[グラフ] 性能曲線", "[图表] 性能曲线"),
    "printsetup.headerFooter": ("Header·Footer", "ヘッダー・フッター", "页眉·页脚"),
    "printsetup.headerPh": ("Header — logo · Title · DOC No.",
        "ヘッダー — ロゴ・Title・DOC No.",
        "页眉 — 标志·Title·DOC No."),
    "printsetup.inspectReport": ("Inspection Report", "検査成績書", "检验报告"),
    "printsetup.loadGraph": ("Load Graph", "グラフ読込", "加载图表"),
    "printsetup.margin": ("Margin", "余白", "页边距"),
    "printsetup.monoOpt": ("B&W", "モノクロ", "黑白"),
    "printsetup.none": ("None", "なし", "无"),
    "printsetup.outputSettings": ("Output Settings", "出力設定", "输出设置"),
    "printsetup.paper": ("Paper", "用紙", "纸张"),
    "printsetup.quoteForm": ("Quote (CLT)", "見積書 (CLT)", "报价单 (CLT)"),
    "printsetup.requestPublish": ("Request Approval → Publish", "承認依頼 → 公開", "请求审批 → 发布"),
    "printsetup.stdTemplet": ("Standard Templet", "標準 Templet", "标准 Templet"),
    "printsetup.tableTech": ("[Table] Technical Data", "[Table] 技術 Data", "[Table] 技术 Data"),
    "printsetup.watermark": ("Watermark", "透かし", "水印"),
    "printsetup.workOrder": ("Work Order", "作業指示書", "工单"),
    "prj.addUpload": ("＋ Upload", "＋ アップロード", "＋ 上传"),
    "prj.approvalWaiting": ("Approval ☑ Pending", "Approval ☑ 待ち", "Approval ☑ 等待"),
    "prj.autoNumber": ("Auto Numbering (PS-)", "自動採番 (PS-)", "自动编号 (PS-)"),
    "prj.clientContact": ("Client Contact", "Client 担当者", "Client 负责人"),
    "prj.date": ("Date", "日付", "日期"),
    "prj.dupCheck": ("Duplicate Check", "重複確認", "重复检查"),
    "prj.fileName": ("File Name", "ファイル名", "文件名"),
    "prj.fileType": ("Type", "種類", "类型"),
    "prj.owner": ("Owner", "担当者", "负责人"),
    "prj.printSetup": ("Print Settings", "Print 設定", "Print 设置"),
    "prj.printSetupCall": ("🖨 Open Print Set-up", "🖨 Print Set-up 呼出", "🖨 调用 Print Set-up"),
    "prj.receivedFiles": ("Register Received Files (File)", "受付資料登録 (File)", "接收资料登记 (File)"),
    "prj.registeredAt": ("Registered", "登録日", "登记日"),
    "prj.registrant": ("Registered By", "登録者", "登记人"),
    "prj.requirements": ("Requirements·Pain Points", "要求事項・Pain Point", "需求·Pain Point"),
    "prj.salesStage": ("Sales Stage", "営業段階", "销售阶段"),
    "prj.saveF12": ("Save F12", "保存 F12", "保存 F12"),
    "prj.stageClosed": ("Closed", "終了", "结束"),
    "prj.stageContract": ("Contract", "契約", "合同"),
    "prj.stageContractChange": ("Contract Change", "契約変更", "合同变更"),
    "prj.stageHint": ("PS starts → then links to PCR→QCR→OR process state machine (ERP-001/002)",
        "PS 開始 → 以降 PCR→QCR→OR プロセス状態機械に連結 (ERP-001/002)",
        "PS 开始 → 之后连接 PCR→QCR→OR 流程状态机 (ERP-001/002)"),
    "prj.stageHistory": ("Sales Stage — change history logged", "営業段階 — 変更履歴記録", "销售阶段 — 记录变更历史"),
    "prj.stageNegotiation": ("Negotiation", "協議", "协商"),
    "prj.stageQuote": ("Quote", "見積", "报价"),
    "prj.stageTechProposal": ("Tech Proposal", "技術提案", "技术提案"),
    "prj.status": ("Status", "状態", "状态"),
    "prj.todoTitle": ("To-do (my processes)", "To-do (自分担当プロセス)", "To-do (本人负责流程)"),
    "prj.unsaved": ("Unsaved", "未保存", "未保存"),
    "procset.auto": ("Auto", "自動", "自动"),
    "procset.autoTransition": ("☑ Run·Event Transition", "☑ Run・イベント遷移", "☑ Run·事件转移"),
    "procset.caution": ("Caution", "注意", "注意"),
    "procset.cautionText": ("※ Changes affecting the System DB require Platform approval",
        "※ System DB に影響する変更は Platform 承認が必要",
        "※ 影响 System DB 的变更需 Platform 审批"),
    "procset.dbSetupHint": ("Define data fields per process", "プロセス別データ項目定義", "按流程定义数据项"),
    "procset.deadlineRule": ("Deadline Rule", "期限ルール", "期限规则"),
    "procset.defTitle": ("Process Definition (erp_process_def / erp_process_edge)",
        "プロセス定義 (erp_process_def / erp_process_edge)",
        "流程定义 (erp_process_def / erp_process_edge)"),
    "procset.editDef": ("Edit Definition — {n}", "定義編集 — {n}", "编辑定义 — {n}"),
    "procset.form": ("Processing Form", "処理 Form", "处理 Form"),
    "procset.formApproval": ("Approval Docs Form", "承認図書 Form", "审批文件 Form"),
    "procset.formOrder": ("Order Form v2", "受注 Form v2", "接单 Form v2"),
    "procset.formPr": ("PO Request Form", "発注依頼 Form", "下单申请 Form"),
    "procset.formSetupHint": ("Processing screens link to EDIM Toolbox UI Form",
        "処理画面は EDIM Toolbox UI Form に連結",
        "处理画面连接 EDIM Toolbox UI Form"),
    "procset.jsonbSchema": ("JSONB Schema", "JSONB スキーマ", "JSONB 模式"),
    "procset.mapHint": ("Select node → edit definition below · 40 preloaded (Slide 10) customized per tenant",
        "ノード選択 → 下段で定義編集・初期搭載 40種 (スライド10) テナント別カスタマイズ",
        "选择节点 → 下方编辑定义 · 初始加载 40种 (幻灯片10) 按租户自定义"),
    "procset.next": ("Successor", "後続", "后续"),
    "procset.notifyHint1": ("Set notification targets on state transition", "状態遷移時の通知対象設定", "设置状态转移时的通知对象"),
    "procset.notifyHint2": ("Overdue → anomaly alert (Dashboard rollup)",
        "期限超過 → 異常警告 (Dashboard 集計)",
        "超过期限 → 异常警告 (Dashboard 汇总)"),
    "procset.notifyRule": ("Notification Rule", "通知ルール", "通知规则"),
    "procset.ownerDeptHead": ("Dept. Head", "部門長", "部门主管"),
    "procset.ownerProject": ("Project Owner", "Project 担当者", "Project 负责人"),
    "procset.ownerPurchase": ("Purchase Owner", "購買担当", "采购负责人"),
    "procset.ownerRule": ("Owner Rule", "担当ルール", "负责规则"),
    "procset.ownerTech": ("Tech Owner", "技術担当", "技术负责人"),
    "procset.precondition": ("Precondition", "先行条件", "前置条件"),
    "procset.prev": ("Predecessor", "先行", "前置"),
    "procset.processMap": ("Process Map — {n}", "プロセスマップ — {n}", "流程图 — {n}"),
    "procset.processName": ("Process Name", "プロセス名", "流程名称"),
    "procset.saveApprovalF12": ("Save → Request Approval F12", "保存 → 承認依頼 F12", "保存 → 请求审批 F12"),
    "purch.createPoF12": ("Create PO → PO-61313-2 F12", "発注作成 → PO-61313-2 F12", "创建 PO → PO-61313-2 F12"),
    "purch.filterGeneral": ("General Orders", "一般発注", "普通订单"),
    "purch.filterIncoming": ("Incoming (5)", "入庫予定 (5)", "待入库 (5)"),
    "purch.filterPoDone": ("Ordered (PO 12)", "発注完了 (PO 12)", "已下单 (PO 12)"),
    "purch.filterPrWait": ("Pending Order (PR 3)", "発注待ち (PR 3)", "待下单 (PR 3)"),
    "purch.flowOrder": ("Order", "発注", "下单"),
    "purch.flowQuoteReq": ("Quote Request", "見積依頼", "报价请求"),
    "purch.poCreated": ("PO-61313-2 created — awaiting RA approval",
        "PO-61313-2 作成 — RA 承認待ち",
        "PO-61313-2 已创建 — 等待 RA 审批"),
    "purch.prTitle": ("Purchase Request", "発注依頼", "采购申请"),
    "purch.priceResolve": ("Price Resolve (CST-001)", "単価 Resolve (CST-001)", "单价 Resolve (CST-001)"),
    "purch.priorityHint": ("Priority: quote-applied → purchase → stock → quote (Price Mgmt M-12-5)",
        "優先順位: 見積適用→購買→在庫→見積 (単価管理 M-12-5)",
        "优先级: 报价应用→采购→库存→报价 (单价管理 M-12-5)"),
    "purch.processTitle": ("Process (per W-14 definition)", "プロセス (W-14 定義準拠)", "流程 (遵循 W-14 定义)"),
    "purch.purchaseTerms": ("Purchase Terms (ERP-017)", "購買条件 (ERP-017)", "采购条件 (ERP-017)"),
    "purch.qcrBtn": ("Quote Request (QCR)", "見積依頼 (QCR)", "报价请求 (QCR)"),
    "purch.selectedCount": ("{n} selected", "選択 {n}件", "已选 {n}项"),
    "purch.stockOk": ("Stock OK", "在庫充足", "库存充足"),
    "purch.supplierCode": ("Supplier Code", "仕入先コード", "供应商代码"),
    "purch.supplierMap": ("Supplier Code Mapping (ERP-018)", "仕入先コードマッピング (ERP-018)", "供应商代码映射 (ERP-018)"),
    "purch.supplierMapHint": ("Show supplier-side code on the PO", "発注書に仕入先側コードを表記", "在采购单上标注供应商侧代码"),
    "purch.termsDelivery": ("Delivery: EXW / FOB / CIP · named place",
        "納品: EXW / FOB / CIP・指定場所",
        "交货: EXW / FOB / CIP · 指定地点"),
    "purch.termsPayment": ("Payment · currency · MOQ · certificates", "支払・通貨・最小数量・証明書要求", "付款·货币·最小数量·证书要求"),
    "run.apRequest": ("AP Request", "AP 依頼", "AP 请求"),
    "run.custApprovalWait": ("Awaiting Customer Approval", "顧客承認待ち", "等待客户批准"),
    "run.elapsed": ("Elapsed", "所要", "耗时"),
    "run.erpSend": ("ERP Send", "ERP 送信", "ERP 传送"),
    "run.execLog": ("Run Log", "実行ログ", "执行日志"),
    "run.file": ("File", "ファイル", "文件"),
    "run.folder": ("Folder", "フォルダ", "文件夹"),
    "run.generated": ("Generated", "生成", "生成"),
    "run.measured": ("Measured", "実測", "实测"),
    "run.message": ("Message", "メッセージ", "消息"),
    "run.nextAction": ("Next Action", "次のアクション", "下一步操作"),
    "run.open": ("Open", "開く", "打开"),
    "run.openFolder": ("Open Folder", "フォルダを開く", "打开文件夹"),
    "run.outputsTitle": ("Outputs — PS-61313-5 (double-click = doc detail)",
        "成果物 — PS-61313-5 (Wクリック＝文書詳細)",
        "产出物 — PS-61313-5 (双击=文档详情)"),
    "run.qcrIssue": ("Issue QCR", "QCR 発行", "签发 QCR"),
    "run.rerunF5": ("Rerun F5", "再実行 F5", "重新执行 F5"),
    "run.running": ("Running", "実行中", "执行中"),
    "run.status": ("Status", "状態", "状态"),
    "run.step": ("Step", "段階", "阶段"),
    "run.successChip": ("SUCCESS 8m 32s · -86% vs 1h target",
        "SUCCESS 8m 32s・目標 1h 比 -86%",
        "SUCCESS 8m 32s · 较目标 1h -86%"),
    "run.task": ("Task", "作業", "作业"),
    "run.time": ("Time", "時刻", "时刻"),
    "run.type": ("Type", "種別", "类型"),
    "run.waitPipeline": ("Shown after the pipeline completes…", "パイプライン完了後に表示されます…", "流水线完成后显示…"),
    "studio.findFeature": ("[ Find Feature ]", "[ 機能検索 ]", "[ 查找功能 ]"),
    "studio.fnWizard": ("[ Function Wizard ]", "[ 関数ウィザード ]", "[ 函数向导 ]"),
    "studio.generateAi": ("▶ Generate (AI)", "▶ 生成 (AI)", "▶ 生成 (AI)"),
    "studio.generating": ("Generating…", "生成中…", "生成中…"),
    "studio.macroTitle": ("Macro — Excel-compatible syntax (editable)",
        "Macro — Excel 互換構文 (編集可)",
        "Macro — Excel 兼容语法 (可编辑)"),
    "studio.notTested": ("Not Tested", "未検証", "未验证"),
    "studio.saveVer": ("Save (v0.3)", "保存 (v0.3)", "保存 (v0.3)"),
    "studio.searchNl": ("Search features in natural language…", "自然言語で機能検索…", "用自然语言搜索功能…"),
    "studio.syncHint": ("4-Way Sync — editing one side suggests syncing the rest · simple calc = Macro / complex = Coding(AI) (TBX-008/010)",
        "4-Way Sync — 一方修正時に残りの同期を提案・簡易計算＝Macro / 複雑＝Coding(AI) (TBX-008/010)",
        "4-Way Sync — 修改一侧时建议同步其余 · 简单计算=Macro / 复杂=Coding(AI) (TBX-008/010)"),
    "studio.syncSuggest": ("Mismatch with Prompt — sync suggested",
        "Prompt と不一致 — 同期を提案",
        "与 Prompt 不一致 — 建议同步"),
    "studio.verifyApprove": ("Verify · Request Approval", "検証・承認依頼", "验证·请求审批"),
    "subcode.addValue": ("＋ Add Value", "＋ 値追加", "＋ 添加值"),
    "subcode.apprStatus": ("Approval Status", "承認状態", "审批状态"),
    "subcode.approved": ("Approved", "承認", "已批准"),
    "subcode.codeAsset": ("Code Assets — KDCR 3-13", "コード資産 — KDCR 3-13", "代码资产 — KDCR 3-13"),
    "subcode.count": ("Count", "件数", "件数"),
    "subcode.desc": ("Description", "説明", "说明"),
    "subcode.dupCheck": ("Duplicate Check", "重複検討", "重复检查"),
    "subcode.item": ("Item", "項目", "项目"),
    "subcode.newF2": ("New F2", "新規 F2", "新建 F2"),
    "subcode.newItemTitle": ("New Item ({n}) — required = yellow cells",
        "新規項目 ({n}) — 必須は黄色セル",
        "新建项目 ({n}) — 必填为黄色单元格"),
    "subcode.none": ("— None", "— なし", "— 无"),
    "subcode.open": ("Open", "開く", "打开"),
    "subcode.queryF8": ("Query F8", "照会 F8", "查询 F8"),
    "subcode.refTable": ("Ref Table", "参照 Table", "引用 Table"),
    "subcode.saveF12": ("Save F12", "保存 F12", "保存 F12"),
    "subcode.status": ("Status", "状態", "状态"),
    "subcode.valueList": ("Value List", "値一覧", "值列表"),
    "taskbox.alerts": ("Anomaly Alerts", "異常警告", "异常警告"),
    "taskbox.apprBox": ("Approval Request Box", "承認依頼箱", "审批请求箱"),
    "taskbox.code": ("Code", "コード", "代码"),
    "taskbox.completeDone": ("Mark Complete (DONE)", "完了処理 (DONE)", "完成处理 (DONE)"),
    "taskbox.content": ("Content", "内容", "内容"),
    "taskbox.deadline": ("Due", "期限", "期限"),
    "taskbox.deadlineRule": ("Due rule: OR+7 days (per W-14)",
        "期限ルール: OR+7日 (W-14 定義)",
        "期限规则: OR+7天 (W-14 定义)"),
    "taskbox.deptAll": ("All Departments", "部署全体", "全部门"),
    "taskbox.filter": ("Filter", "フィルタ", "筛选"),
    "taskbox.fri": ("Fri", "金", "周五"),
    "taskbox.gotoInbox": ("→ Go to Approval Inbox", "→ 承認箱へ移動", "→ 转到审批箱"),
    "taskbox.kind": ("Kind", "区分", "类别"),
    "taskbox.mon": ("Mon", "月", "周一"),
    "taskbox.mrProc": ("MR Production Request", "MR 製作依頼", "MR 制作委托"),
    "taskbox.mySchedule": ("My Schedule (Weekly)", "マイスケジュール (週間)", "我的日程 (周)"),
    "taskbox.myTasks": ("My Tasks", "マイ業務", "我的任务"),
    "taskbox.noAlerts": ("No alerts", "警告なし", "无警告"),
    "taskbox.openForm": ("Open Handling Form (Toolbox)", "処理 Form を開く (Toolbox)", "打开处理 Form (Toolbox)"),
    "taskbox.orDone": ("OR Order DONE", "OR 受注 DONE", "OR 接单 DONE"),
    "taskbox.overdueWarn": ("Over 2 days — Dashboard anomaly alert raised",
        "2日超過、Dashboard 異常警告発生",
        "超过2天，触发 Dashboard 异常警告"),
    "taskbox.owner": ("Owner", "担当", "负责人"),
    "taskbox.plOverdue": ("PL overdue 2 days", "PL 期限超過 2日", "PL 逾期 2天"),
    "taskbox.process": ("Process", "プロセス", "流程"),
    "taskbox.tasksN": ("Tasks — {n}", "業務 — {n}件", "任务 — {n}项"),
    "taskbox.thu": ("Thu", "木", "周四"),
    "taskbox.timeKind": ("Time", "時間", "时间"),
    "taskbox.title": ("Subject", "件名", "标题"),
    "taskbox.tue": ("Tue", "火", "周二"),
    "taskbox.wed": ("Wed", "水", "周三"),
    "techdata.densityCalc": ("Density Correction Sheet", "密度補正計算書", "密度修正计算书"),
    "techdata.designOptions": ("Design Options — approved Sub Code values only (CODE-003)",
        "設計オプション — 承認済 Sub Code 値のみ (CODE-003)",
        "设计选项 — 仅限已批准 Sub Code 值 (CODE-003)"),
    "techdata.eff": ("Efficiency", "効率", "效率"),
    "techdata.fanPerfTable": ("Fan Performance Table (PDF)", "Fan 性能表 (PDF)", "Fan 性能表 (PDF)"),
    "techdata.generated": ("Generated", "生成", "生成"),
    "techdata.graphWizard": ("Graph Wizard Templet (TBX-011)",
        "グラフウィザード Templet (TBX-011)",
        "图表向导 Templet (TBX-011)"),
    "techdata.notSelected": ("Not Selected", "未選定", "未选定"),
    "techdata.perfCurve": ("Performance Curve — selection point highlighted",
        "性能曲線 — 選定点ハイライト",
        "性能曲线 — 高亮选定点"),
    "techdata.queryF8": ("Query F8", "照会 F8", "查询 F8"),
    "techdata.selFanDrawing": ("Selected Fan Drawing — {n}", "選定 Fan 図面 — {n}", "选定 Fan 图纸 — {n}"),
    "techdata.selPoint": ("Selection Point", "選定点", "选定点"),
    "techdata.soundForecast": ("Sound Forecast (Sound {n} dB)", "騒音予測 (Sound {n} dB)", "噪音预测 (Sound {n} dB)"),
    "techdata.techDataTitle": ("Technical Data — Table range query + Macro (TBL-004)",
        "Technical Data — Table 範囲照会 + Macro (TBL-004)",
        "Technical Data — Table 范围查询 + Macro (TBL-004)"),
    "techdata.valid": ("Valid", "有効", "有效"),
    "uidsn.aiDraft": ("UI Draft Proposal", "UI 草案提案", "UI 草案建议"),
    "uidsn.aiHint": ("→ Organize purpose / items / required DB Tables, then propose Templet · invoke for Customizing",
        "→ 用途 / 項目 / 必要 DB Table 整理後 Templet 提案・呼び出して Customizing",
        "→ 整理用途 / 项目 / 所需 DB Table 后建议 Templet · 调用后 Customizing"),
    "uidsn.aiPlaceholder": ("Describe the Application to develop…",
        "開発する Application の説明を入力…",
        "输入要开发的 Application 说明…"),
    "uidsn.aiTitle": ("[ UI Dev AI ]", "[ UI 開発 AI ]", "[ UI 开发 AI ]"),
    "uidsn.bindHint": ("Button → Command Templet (copy · target · Data) · Combo → Data Set-up (Table binding)",
        "Button → Command Templet (コピー・対象・Data)・Combo → Data Set-up (Table バインド)",
        "Button → Command Templet (复制·目标·Data) · Combo → Data Set-up (Table 绑定)"),
    "uidsn.flowHint": ("Click palette to place → edit props → bind action Templet → save·version → approve·publish",
        "パレットクリック配置 → 属性編集 → 動作 Templet バインド → 保存・バージョン → 承認・公開",
        "点击面板放置 → 编辑属性 → 绑定动作 Templet → 保存·版本 → 审批·发布"),
    "uidsn.publish": ("Publish (after approval)", "公開 (承認後)", "发布 (审批后)"),
    "uidsn.saveF12": ("Save F12", "保存 F12", "保存 F12"),
    "uidsn.unsaved": ("Unsaved Changes", "未保存の変更", "未保存更改"),
    "uidsn.widgetBox": ("Widget Box — click = place", "Widget Box — クリック＝配置", "Widget Box — 单击=放置"),
    "wp.buyPath": ("BUY {n} → purchase price resolve", "BUY {n}件 → 購買単価 resolve", "BUY {n}项 → 采购单价 resolve"),
    "wp.costPath": ("Cost Path (Pricing Run)", "原価経路 (Pricing Run)", "成本路径 (Pricing Run)"),
    "wp.makeBuy": ("Make/Buy (double-click to toggle)", "Make/Buy (Wクリック切替)", "Make/Buy (双击切换)"),
    "wp.makePath": ("MAKE {n} → mfg cost (time × labor rate)",
        "MAKE {n}件 → 製造費 (時間×賃率)",
        "MAKE {n}项 → 制造费 (时间×工时费率)"),
    "wp.processDef": ("Process Definition — KDCR 3-13 · {p} @ {w}",
        "工程定義 — KDCR 3-13・{p} @ {w}",
        "工序定义 — KDCR 3-13 · {p} @ {w}"),
    "wp.saveF12": ("Save F12", "保存 F12", "保存 F12"),
    "wp.supplier": ("Supplier", "仕入先", "供应商"),
    "wp.timeMin": ("Time(min)", "Time(分)", "Time(分)"),
    "wp.toggleHint": ("Toggle MAKE/BUY by double-clicking Material Data",
        "MAKE/BUY 切替は Material Data をWクリック",
        "双击 Material Data 切换 MAKE/BUY"),
    "wp.unsaved": ("Unsaved Changes", "未保存の変更", "未保存更改"),
    "menu.plm-drawings": ("Drawing Ledger (M-4-1)", "図面台帳 (M-4-1)", "图纸台账 (M-4-1)"),
    "menu.erp-project": ("Project Registration (S-3-5)", "Project 登録 (S-3-5)", "Project 注册 (S-3-5)"),
    "screen.plm-drawings": ("Drawing Ledger", "図面台帳", "图纸台账"),
}


def seed_v9(cur, tid: int) -> None:
    # 키 단위 멱등 — v7 과 동일 방식 (누락 키만 삽입)
    cur.execute(
        """SELECT DISTINCT field FROM sys_translation
           WHERE tenant_id=%s AND entity_type='UI' AND locale='en'""", (tid,))
    have = {r[0] for r in cur.fetchall()}
    n = 0
    for key, (en, ja, zh) in UI_TRANSLATIONS_V9.items():
        if key in have:
            continue
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                   VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))
            n += 1
    if n:
        logger.info("seed v9 — UI 번역 전면 확장 %d행 삽입 (24화면 크롬, B9)", n)


# ── seed v10 — B13: Arrangement·Templet 샘플 + 메뉴 라벨 갱신 ──

ARRANGEMENTS_V10 = [
    ('ARR-DD2', 'Double Deck 2 표준 구성', 'AHU', '좌우 대칭·상부 배기', '실내 설치·방진 마운트',
     [('KAD 900 FW', 'CENTER', 1), ('KDP 1-21', 'LEFT', 1), ('H 22 380', 'RIGHT', 1)]),
    ('ARR-SD1', 'Single Deck 표준 구성', 'AHU', '단층·전면 흡입', '옥상 설치·방수 커버',
     [('KAD 900 FW', 'CENTER', 1), ('KDP 9', 'REAR', 2)]),
]

TEMPLETS_V10 = [
    ('CMD-COPY', 'COMMAND', {'action': 'copy', 'target': 'selection', 'data': 'clipboard'}),
    ('DATA-TBL12', 'DATA', {'table': 'Table12', 'binding': 'combo', 'keyColumn': 'Key'}),
    ('FORM-QUOTE', 'FORM', {'form': 'CLT', 'placeholders': ['project.no', 'customer', 'bom']}),
]

MENU_UPDATES_V10 = {
    'menu.plm-arr': ('Arrangement Set-Up (M-4-2)', 'Arrangement Set-Up (M-4-2)', 'Arrangement Set-Up (M-4-2)'),
    'menu.tbx-templet': ('Templet Mgmt (S-2-3)', 'Templet 管理 (S-2-3)', 'Templet 管理 (S-2-3)'),
    'screen.plm-arr': ('Arrangement Set-Up', 'Arrangement Set-Up', 'Arrangement Set-Up'),
    'screen.tbx-templet': ('Templet Mgmt', 'Templet 管理', 'Templet 管理'),
}


def seed_v10(cur, tid: int) -> None:
    cur.execute('SELECT 1 FROM arrangement_code WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        for code, name, family, direction, install, comps in ARRANGEMENTS_V10:
            cur.execute(
                """INSERT INTO arrangement_code (tenant_id, arrangement_code, arrangement_name,
                   product_family, direction_option, install_option, approval_status)
                   VALUES (%s,%s,%s,%s,%s,%s,'APPROVED') RETURNING arrangement_id""",
                (tid, code, name, family, direction, install))
            arr_id = cur.fetchone()[0]
            for i, (pc_code, pos, qty) in enumerate(comps):
                cur.execute(
                    'SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s',
                    (tid, pc_code))
                pc = cur.fetchone()
                if pc:
                    cur.execute(
                        """INSERT INTO arrangement_component (arrangement_id, product_code_id,
                           position_key, quantity, sort_order) VALUES (%s,%s,%s,%s,%s)""",
                        (arr_id, pc[0], pos, qty, i))
        logger.info('seed v10 — arrangement %d건', len(ARRANGEMENTS_V10))
    cur.execute('SELECT 1 FROM tbx_templet WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        for name, ttype, definition in TEMPLETS_V10:
            cur.execute(
                """INSERT INTO tbx_templet (tenant_id, templet_name, templet_type, definition,
                   approval_status) VALUES (%s,%s,%s,%s,'APPROVED')""",
                (tid, name, ttype, json.dumps(definition)))
        logger.info('seed v10 — templet %d건', len(TEMPLETS_V10))
    # 메뉴 라벨 갱신 (— 예정 해제) + 신규 화면 키 — 키 단위 멱등
    for key, (en, ja, zh) in MENU_UPDATES_V10.items():
        for locale, text in (('en', en), ('ja', ja), ('zh', zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v11 — B13-2: 재질·검증 규칙 샘플 + 메뉴 라벨 갱신 ──

MATERIALS_V11 = [
    ('SS400', '일반 구조용 압연강', 'STEEL', 7.85, 'KS D 3503', None),
    ('STS304', '스테인리스 강판', 'STEEL', 7.93, 'KS D 3698', None),
    ('AL6061', '알루미늄 합금', 'ALUMINUM', 2.70, 'KS D 6701', None),
    ('SPHC', '열간압연 강판', 'STEEL', 7.85, 'KS D 3501', None),
]

VERIFICATIONS_V11 = [
    ('B 치수 상한 검증', 'DIM B (KDCR 3-13)', 'B(H) 가 900 을 초과하면 Casing 표준 강판 폭 초과 — 설계 재검토'),
    ('K 전장 간섭 검증', 'DIM K (KDCR 3-13)', 'K 전장이 1,500 초과 시 표준 베이스 프레임 간섭 — Arrangement 확인'),
]

MENU_UPDATES_V11 = {
    'menu.code-variant': ('Variant·Constant (S-1-2)', 'Variant·Constant (S-1-2)', 'Variant·Constant (S-1-2)'),
    'menu.code-raw': ('Raw Material·GPI (M-3-2)', 'Raw Material·GPI (M-3-2)', 'Raw Material·GPI (M-3-2)'),
    'menu.plm-material': ('Material (M-4-4)', 'Material (M-4-4)', 'Material (M-4-4)'),
    'menu.plm-quality': ('Quality (M-4-5)', 'Quality (M-4-5)', 'Quality (M-4-5)'),
    'screen.code-variant': ('Variant·Constant', 'Variant·Constant', 'Variant·Constant'),
    'screen.code-raw': ('Raw Material·GPI', 'Raw Material·GPI', 'Raw Material·GPI'),
    'screen.plm-material': ('Material', 'Material', 'Material'),
    'screen.plm-quality': ('Quality', 'Quality', 'Quality'),
    'menu.com-search': ('Global Search (⌘K)', '統合検索 (⌘K)', '全局搜索 (⌘K)'),
}


def seed_v11(cur, tid: int) -> None:
    cur.execute('SELECT 1 FROM mat_material WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        for code, name, mtype, density, std, hazard in MATERIALS_V11:
            cur.execute(
                """INSERT INTO mat_material (tenant_id, material_code, material_name,
                   material_type, density, standard, hazard_class)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (tid, code, name, mtype, density, std, hazard))
        logger.info('seed v11 — mat_material %d건', len(MATERIALS_V11))
    cur.execute('SELECT 1 FROM dwg_verification WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        cur.execute(
            """SELECT drawing_id FROM dwg_drawing
               WHERE tenant_id=%s AND drawing_no='KDCR 3-13' LIMIT 1""", (tid,))
        d = cur.fetchone()
        if d:
            n = 0
            for rule, macro_name, warning in VERIFICATIONS_V11:
                cur.execute(
                    'SELECT macro_id FROM tbx_macro WHERE tenant_id=%s AND macro_name=%s',
                    (tid, macro_name))
                m = cur.fetchone()
                if m:
                    cur.execute(
                        """INSERT INTO dwg_verification (tenant_id, drawing_id, rule_name,
                           macro_id, warning_message) VALUES (%s,%s,%s,%s,%s)""",
                        (tid, d[0], rule, m[0], warning))
                    n += 1
            logger.info('seed v11 — dwg_verification %d건', n)
    for key, (en, ja, zh) in MENU_UPDATES_V11.items():
        for locale, text in (('en', en), ('ja', ja), ('zh', zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v12 — B14: 역할·권한 매트릭스 + Hierarchy 주소 체계 ──

ROLES_V12 = [
    ('PLATFORM', '플랫폼 관리 — 시스템 정의 변경'),
    ('ADMIN', '관리자 — 사용자·권한·잠금해제'),
    ('SETUP', '설계 Set-up — 코드·도면·Macro 편집'),
    ('GENERAL', '일반 — 조회·업무 처리'),
]

# (role, screenId, action) — WRITE ⊃ READ
PERMS_V12 = [
    ('PLATFORM', '*', 'WRITE'),
    ('ADMIN', 'erp-access', 'WRITE'), ('ADMIN', 'com-approval', 'WRITE'),
    ('ADMIN', 'erp-dashboard', 'READ'), ('ADMIN', 'cpq-selection', 'READ'),
    ('SETUP', 'cpq-selection', 'WRITE'), ('SETUP', 'plm-design', 'WRITE'),
    ('SETUP', 'code-subcode', 'WRITE'), ('SETUP', 'code-datatable', 'WRITE'),
    ('SETUP', 'tbx-macro', 'WRITE'), ('SETUP', 'erp-price', 'WRITE'),
    ('SETUP', 'com-approval', 'WRITE'), ('SETUP', 'erp-access', 'READ'),
    ('GENERAL', 'cpq-selection', 'READ'), ('GENERAL', 'erp-dashboard', 'READ'),
    ('GENERAL', 'com-tasks', 'WRITE'), ('GENERAL', 'com-folder', 'READ'),
]

# (tree_type, name, symbol, address, parent_address)
HIERARCHY_V12 = [
    ('PRODUCT', 'Code', 'C', '/C', None),
    ('PRODUCT', 'Engineering', 'ENG', '/C/ENG', '/C'),
    ('PRODUCT', 'Fan', 'FAN', '/C/ENG/FAN', '/C/ENG'),
    ('PRODUCT', 'Macro', 'M', '/M', None),
    ('PRODUCT', 'ENG Macro', 'ENG', '/M/ENG', '/M'),
    ('PRODUCT', 'Fan Macro', 'FAN', '/M/ENG/FAN', '/M/ENG'),
    ('GENERAL_DB', 'Table', 'T', '/T', None),
    ('GENERAL_DB', 'ENG Table', 'ENG', '/T/ENG', '/T'),
    ('GENERAL_DB', 'Variant', 'VAR', '/T/ENG/VARIANT', '/T/ENG'),
]


def seed_v12(cur, tid: int) -> None:
    cur.execute('SELECT 1 FROM sys_role WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        role_ids = {}
        for name, desc in ROLES_V12:
            cur.execute(
                """INSERT INTO sys_role (tenant_id, role_name, description)
                   VALUES (%s,%s,%s) RETURNING role_id""", (tid, name, desc))
            role_ids[name] = cur.fetchone()[0]
        for role, key, action in PERMS_V12:
            cur.execute(
                """INSERT INTO sys_role_permission (role_id, resource_type, resource_key, action)
                   VALUES (%s,'MENU',%s,%s)""", (role_ids[role], key, action))
        logger.info('seed v12 — sys_role %d + permission %d', len(ROLES_V12), len(PERMS_V12))
    cur.execute('SELECT 1 FROM sys_hierarchy WHERE tenant_id=%s LIMIT 1', (tid,))
    if not cur.fetchone():
        ids = {}
        for ttype, name, symbol, address, parent in HIERARCHY_V12:
            cur.execute(
                """INSERT INTO sys_hierarchy (tenant_id, parent_id, tree_type, node_name,
                   symbol, address, approval_status)
                   VALUES (%s,%s,%s,%s,%s,%s,'APPROVED') RETURNING hierarchy_id""",
                (tid, ids.get(parent), ttype, name, symbol, address))
            ids[address] = cur.fetchone()[0]
        logger.info('seed v12 — sys_hierarchy %d', len(HIERARCHY_V12))


# ── seed v13 — B13/B14 신규 화면 메뉴·화면 번역 키 (sys_translation) ──

MENU_UPDATES_V13 = {
    'menu.code-hierarchy': ('Hierarchy Address (M-3-1)', 'Hierarchy アドレス (M-3-1)', 'Hierarchy 地址 (M-3-1)'),
    'menu.erp-company-master': ('Suppliers & Customers (M-14-2)', '仕入先·取引先 (M-14-2)', '供应商·客户 (M-14-2)'),
    'screen.code-hierarchy': ('Hierarchy Address', 'Hierarchy アドレス', 'Hierarchy 地址'),
    'screen.erp-company-master': ('Suppliers & Customers', '仕入先·取引先', '供应商·客户'),
}


def seed_v13(cur, tid: int) -> None:
    # 키 단위 멱등 — UPDATE 후 미존재 시 INSERT (v10/v11 과 동일 패턴)
    for key, (en, ja, zh) in MENU_UPDATES_V13.items():
        for locale, text in (('en', en), ('ja', ja), ('zh', zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v14 — B16: 도면 블록(dwg_document)·단계별 승인(dwg_approval)·부품 관계(dwg_part_relation) ──

# Design Editor Block 패널 원천 (KDCR 3-13) — content = 캔버스 좌표/치수
BLOCKS_V14 = [
    ('Casing', {'x': 190, 'y': 60, 'w': 220, 'h': 180}, 190, 60),
    ('Impeller', {'x': 230, 'y': 80, 'w': 140, 'h': 100, 'sub': 'Airfoil 900'}, 230, 80),
    ('Shaft', {'x': 80, 'y': 150, 'w': 440, 'h': 12}, 80, 150),
    ('Brg-L', {'x': 96, 'y': 138, 'w': 26, 'h': 34}, 96, 138),
    ('Brg-R', {'x': 478, 'y': 138, 'w': 26, 'h': 34}, 478, 138),
    ('Inlet Cone-L', {'x': 150, 'y': 96, 'w': 40, 'h': 110, 'dashed': True}, 150, 96),
    ('Inlet Cone-R', {'x': 410, 'y': 96, 'w': 40, 'h': 110, 'dashed': True}, 410, 96),
]

# (block_a, block_b, align, contact, macro_name, priority)
RELATIONS_V14 = [
    ('Impeller', 'Shaft', 'center', 'face', 'Shaft 길이 계산', 1),
    ('Casing', 'Inlet Cone-L', 'vertical', 'line', None, 2),
    ('Casing', 'Inlet Cone-R', 'vertical', 'line', None, 2),
]

TAB_LABELS_V14 = {
    'dwg.detailTitle': ('Drawing Detail', '図面詳細', '图纸详情'),
    'dwg.tabRev': ('Rev History', 'Rev 履歴', 'Rev 历史'),
    'dwg.tabApproval': ('Approval Steps', '承認ステップ', '审批步骤'),
    'dwg.tabVariants': ('Variants', 'Variants', 'Variants'),
    'dwg.tabReferencers': ('Referencers', 'Referencers', 'Referencers'),
    'dwg.tabAttachment': ('Attachment', '添付', '附件'),
    'dwg.needBackend': ('Backend connection required', 'バックエンド接続が必要', '需要后端连接'),
    'dwg.noVariants': ('No drawings in the same family', '同一ファミリの図面なし', '无同族图纸'),
    'dwg.noRefs': ('No parent references this drawing (code)', 'この図面(コード)を参照する上位なし', '无上级引用此图纸(代码)'),
    'dwg.noFiles': ('No linked files (auto-linked when Run outputs are generated)',
                    'リンクされたファイルなし (Run 生成時に自動リンク)', '无关联文件 (Run 生成时自动关联)'),
    'dwg.motherCol': ('Parent Code', '上位コード', '上级代码'),
    'dwg.descCol': ('Description', '説明', '说明'),
    'dwg.stepCol': ('Step', 'ステップ', '步骤'),
    'dwg.resultCol': ('Result', '結果', '结果'),
    'dwg.chainDone': ('Approval chain complete', '承認チェーン完了', '审批链完成'),
    'dwg.noSteps': ('No approval history — start from WRITE step', '承認履歴なし — 作成から進行', '无审批记录 — 从编写开始'),
    'dwg.stepCommentPh': ('Comment (required on reject)', 'コメント (却下時必須)', '备注 (驳回时必填)'),
    'dwg.approveBtn': ('Approve', '承認', '批准'),
    'dwg.rejectBtn': ('Reject', '却下', '驳回'),
    'editor.simPanel': ('Simulation', 'シミュレーション', '仿真'),
    'editor.simHint': ('Change a VARIANT dim — MACRO dims re-evaluate instantly (no save)',
                       'VARIANT 寸法を変更 — MACRO 寸法が即時再計算 (保存なし)',
                       '修改 VARIANT 尺寸 — MACRO 尺寸即时重算 (不保存)'),
    'editor.simApply': ('Apply (commit dims)', '適用 (寸法反映)', '应用 (提交尺寸)'),
    'editor.relAlign': ('Align', '整列', '对齐'),
    'editor.relContact': ('Contact', '接触', '接触'),
}


def seed_v14(cur, tid: int) -> None:
    cur.execute(
        """SELECT drawing_id FROM dwg_drawing WHERE tenant_id=%s AND drawing_no='KDCR 3-13'""",
        (tid,))
    d = cur.fetchone()
    if d:
        did = d[0]
        cur.execute('SELECT 1 FROM dwg_document WHERE tenant_id=%s LIMIT 1', (tid,))
        if not cur.fetchone():
            for name, content, ox, oy in BLOCKS_V14:
                cur.execute(
                    """INSERT INTO dwg_document (tenant_id, drawing_id, block_name, content,
                       origin_x, origin_y) VALUES (%s,%s,%s,%s,%s,%s)""",
                    (tid, did, name, json.dumps(content), ox, oy))
            logger.info('seed v14 — dwg_document %d블록', len(BLOCKS_V14))
        cur.execute('SELECT 1 FROM dwg_approval WHERE drawing_id=%s LIMIT 1', (did,))
        if not cur.fetchone():
            cur.execute("SELECT user_id FROM sys_user WHERE tenant_id=%s AND login_id='edim'", (tid,))
            uid = cur.fetchone()[0]
            for step in ('WRITE', 'REVIEW', 'APPROVE'):
                cur.execute(
                    """INSERT INTO dwg_approval (drawing_id, step, approver_id, approval_date,
                       result, comment) VALUES (%s,%s,%s,CURRENT_DATE,'APPROVED','최초 발행 승인 체인')""",
                    (did, step, uid))
            logger.info('seed v14 — dwg_approval 3단계 (KDCR 3-13)')
        cur.execute('SELECT 1 FROM dwg_part_relation WHERE tenant_id=%s LIMIT 1', (tid,))
        if not cur.fetchone():
            for a, b, align, contact, macro_name, prio in RELATIONS_V14:
                mid = None
                if macro_name:
                    cur.execute('SELECT macro_id FROM tbx_macro WHERE tenant_id=%s AND macro_name=%s',
                                (tid, macro_name))
                    m = cur.fetchone()
                    mid = m[0] if m else None
                cur.execute(
                    """INSERT INTO dwg_part_relation (tenant_id, drawing_id, block_a, block_b,
                       condition_align, condition_contact, value_macro_id, priority, approval_status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'APPROVED')""",
                    (tid, did, a, b, align, contact, mid, prio))
            logger.info('seed v14 — dwg_part_relation %d건', len(RELATIONS_V14))
    for key, (en, ja, zh) in TAB_LABELS_V14.items():
        for locale, text in (('en', en), ('ja', ja), ('zh', zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v18 — F1 프로젝트 도메인: 접수 자료 실데이터화 + 신규 UI 키 ──

UI_TRANSLATIONS_V18: dict[str, tuple[str, str, str]] = {
    "prj.name": ("Project Name", "プロジェクト名", "项目名称"),
    "prj.newF2": ("＋ New F2", "＋ 新規 F2", "＋ 新建 F2"),
    "prj.ledger": ("Project Ledger — {n}", "プロジェクト台帳 — {n}件", "项目台账 — {n}件"),
    "prj.activeCtx": ("Selection = titlebar context", "選択 = タイトルバーのコンテキスト", "选择 = 标题栏上下文"),
    "prj.noFiles": ("No received files — register via + Upload (MinIO RECEIVED + dwg_file)",
                    "受領資料なし — ＋アップロードで登録 (MinIO RECEIVED + dwg_file)",
                    "暂无接收资料 — 通过＋上传登记 (MinIO RECEIVED + dwg_file)"),
    "prj.regTitle": ("Register Project — prj_project", "プロジェクト登録 — prj_project", "项目登记 — prj_project"),
    "prj.regNeedName": ("Enter the project name", "プロジェクト名を入力してください", "请输入项目名称"),
    "prj.regClientPh": ("Client — auto-created if absent (com_company)",
                        "顧客 — 未登録なら自動作成 (com_company)",
                        "客户 — 不存在时自动创建 (com_company)"),
    "prj.regSubmit": ("Register F12", "登録 F12", "登记 F12"),
    "common.needBackend": ("Backend connection required (mock mode)",
                           "バックエンド接続が必要 (mock モード)", "需要后端连接 (mock 模式)"),
    "shell.noProject": ("No project selected", "プロジェクト未選択", "未选择项目"),
}


def seed_v18(cur, tid: int) -> None:
    # 신규 UI 키 업서트 (키 단위 멱등)
    for key, (en, ja, zh) in UI_TRANSLATIONS_V18.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))
    # 접수 자료 실데이터화 — mock RECEIVED_FILES → dwg_file + MinIO 실객체
    cur.execute(
        """SELECT 1 FROM dwg_file WHERE tenant_id=%s AND folder='RECEIVED'
           AND file_name='Micron7_사양서_v2.xlsx'""", (tid,))
    if cur.fetchone():
        return
    cur.execute(
        "SELECT project_id FROM prj_project WHERE tenant_id=%s AND project_no='PS-61313-5'",
        (tid,))
    prj = cur.fetchone()
    if not prj:
        return
    try:
        import io

        from openpyxl import Workbook
        from reportlab.pdfgen import canvas

        from app.services import storage

        wb = Workbook()
        ws = wb.active
        ws.title = "사양"
        for row in (["항목", "값"], ["풍량", "690 m3/min"], ["정압", "85 mmAq"],
                    ["전원", "440V 60Hz"], ["비고", "Micron #7 Pre-Sales 접수 사양"]):
            ws.append(row)
        xbuf = io.BytesIO()
        wb.save(xbuf)

        pbuf = io.BytesIO()
        c = canvas.Canvas(pbuf, pagesize=(595, 842))
        c.setFont("Helvetica-Bold", 14)
        c.drawString(80, 780, "Site Layout - Micron #7 (received document)")
        c.setFont("Helvetica", 10)
        c.rect(80, 400, 430, 320)
        c.rect(100, 560, 140, 110)
        c.drawString(110, 610, "AHU #1")
        c.rect(280, 560, 140, 110)
        c.drawString(290, 610, "Fan Room")
        c.drawString(90, 380, "Received 2026-07-07 / Pre-Sales")
        c.showPage()
        c.save()

        objects = (
            ("Micron7_사양서_v2.xlsx", "XLSX", xbuf.getvalue(),
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            ("현장 배치도.pdf", "PDF", pbuf.getvalue(), "application/pdf"),
        )
        # 스토리지 업로드 먼저 전부 성공해야 INSERT (부분 등재 방지)
        for fname, _t, data, ctype in objects:
            storage.put_object(f"PS-61313-5/RECEIVED/{fname}", data, ctype)
        for fname, ftype, data, _c in objects:
            cur.execute(
                """INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type,
                   file_path, file_size, uploaded_date)
                   VALUES (%s,%s,'RECEIVED',%s,%s,%s,%s,'2026-07-07')""",
                (tid, prj[0], fname, ftype, f"PS-61313-5/RECEIVED/{fname}", len(data)))
        logger.info("seed v18 — 접수 자료 2건 실데이터화 (RECEIVED, MinIO)")
    except Exception as e:  # noqa: BLE001 — storage 불가 시 다음 기동에서 재시도
        logger.warning("seed v18 skip: %s", e)


# ── seed v19 — F2 사용자 등록·수정 UI 키 ──

UI_TRANSLATIONS_V19: dict[str, tuple[str, str, str]] = {
    "access.editUser": ("Edit Info", "情報修正", "编辑信息"),
    "access.regTitle": ("Register User — sys_user", "ユーザー登録 — sys_user", "用户登记 — sys_user"),
    "access.regLoginPh": ("lowercase·digits·._- min 3 chars", "小文字・数字・._- 3文字以上", "小写·数字·._- 至少3位"),
    "access.email": ("Email", "メール", "邮箱"),
    "access.initPw": ("Initial Password", "初期パスワード", "初始密码"),
    "access.initPwPh": ("min 4 chars — change after handover", "4文字以上 — 引き渡し後に変更推奨", "至少4位 — 交付后建议修改"),
    "access.regNeedFields": ("login, name and initial password are required",
                             "login・氏名・初期パスワードは必須です", "login·姓名·初始密码为必填"),
    "access.regNeedName": ("Name cannot be empty", "氏名は空にできません", "姓名不能为空"),
    "access.editTitle": ("Edit Info — {n}", "情報修正 — {n}", "编辑信息 — {n}"),
    "access.editSubmit": ("Save F12", "保存 F12", "保存 F12"),
}


def seed_v19(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V19.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v20 — F3 권한 게이팅 UI 키 ──

UI_TRANSLATIONS_V20: dict[str, tuple[str, str, str]] = {
    "perm.needSetup": ("Insufficient permission — SETUP or higher required (SYS-005)",
                       "権限不足 — SETUP 以上が必要 (SYS-005)", "权限不足 — 需要 SETUP 及以上 (SYS-005)"),
    "perm.needAdmin": ("Insufficient permission — ADMIN only (SYS-005)",
                       "権限不足 — ADMIN 専用 (SYS-005)", "权限不足 — 仅限 ADMIN (SYS-005)"),
    "perm.deniedTitle": ("Access denied (403)", "アクセス権限なし (403)", "无访问权限 (403)"),
    "perm.deniedBody": ("{s} is accessible to {n} or higher — request permission from an administrator (SYS-005)",
                        "{s} は {n} 以上のみアクセス可能 — 管理者に権限を申請してください (SYS-005)",
                        "{s} 仅限 {n} 及以上访问 — 请向管理员申请权限 (SYS-005)"),
    "appr.myReqsN": ("My Requests — {n}", "自分の申請 — {n}件", "我的申请 — {n}件"),
    "appr.noMine": ("No pending requests of mine (requester = me)",
                    "自分が申請した保留中の件はありません (requester = 本人)",
                    "没有我提交的待处理申请 (requester = 本人)"),
    "appr.noPending": ("No pending requests", "保留中の申請はありません", "没有待处理的申请"),
    "appr.readOnly": ("Read-only — no decision permission", "読み取り専用 — 決裁権限なし", "只读 — 无审批权限"),
}


def seed_v20(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V20.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v21 — F4 무반응 일소 UI 키 ──

UI_TRANSLATIONS_V21: dict[str, tuple[str, str, str]] = {
    "subcode.addValueHint": ('Add value — type the new value at the end of Sub Item (separated by ·)', '値追加 — Sub Item 末尾に新しい値を入力 (·区切り)', '添加值 — 在 Sub Item 末尾输入新值 (·分隔)'),
    "dtable.editNeedRow": ('Edit — select a row first', '編集 — 行を先に選択してください', '编辑 — 请先选择行'),
    "printsetup.bindNeedSel": ('Bind data — select a widget on the canvas first', 'Data 位置指定 — キャンバスでウィジェットを先に選択', '数据绑定 — 请先在画布中选择控件'),
    "printsetup.defaultDone": ('Default layout ✓ — 6 widgets (header·Data×2·graph·table·footer)', '基本様式配置 ✓ — 6ウィジェット', '默认版式 ✓ — 6个控件'),
    "printsetup.dataAdded": ("Data widget added ✓ — bind a path via [Bind Data]", 'Data ウィジェット追加 ✓ — Data 位置指定でパスをバインド', '已添加数据控件 ✓ — 通过数据绑定指定路径'),
    "printsetup.graphAdded": ('Graph widget added ✓ — [graph:performance]', 'グラフウィジェット追加 ✓ — [グラフ:performance]', '已添加图表控件 ✓ — [图表:performance]'),
    "printsetup.printerHint": ('Real render in new window — print via browser (Ctrl+P)', '実レンダー新ウィンドウ — ブラウザ印刷 (Ctrl+P)', '新窗口实渲染 — 浏览器打印 (Ctrl+P)'),
    "printsetup.officeHint": ('After customer templates are finalized (P4-1 — DOCX/XLSX forms)', '顧客様式確定後 (P4-1 — DOCX/XLSX)', '客户模板确认后 (P4-1 — DOCX/XLSX)'),
    "printsetup.bindTitle": ('Bind Data — placeholder binding', 'Data 位置指定 — バインディング', '数据绑定 — 占位符绑定'),
    "printsetup.bindTarget": ('Target widget', '対象ウィジェット', '目标控件'),
    "printsetup.bindPath": ('Data path', 'データパス', '数据路径'),
    "printsetup.bindSubmit": ('Bind F12', 'バインド F12', '绑定 F12'),
}


def seed_v21(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V21.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v22 — F5 마스터 수정 UI 키 ──

UI_TRANSLATIONS_V22: dict[str, tuple[str, str, str]] = {
    "qedit.required": ('Required: {n}', '必須入力: {n}', '必填: {n}'),
    "qedit.saveF12": ('Save F12', '保存 F12', '保存 F12'),
    "parts.editBtn": ('Edit', '修正', '编辑'),
    "wh.editBtn": ('Edit', '修正', '编辑'),
    "price.closeBtn": ('Close Validity', '適用終了', '结束适用'),
    "price.closeSubmit": ('Close F12', '締切 F12', '结束 F12'),
    "docmgmt.editMeta": ('Edit Meta', 'メタ修正', '编辑元数据'),
    "docmgmt.title": ('Title', 'タイトル', '标题'),
}


def seed_v22(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V22.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v23 — F6 통합 검색 확장 UI 키 ──

UI_TRANSLATIONS_V23: dict[str, tuple[str, str, str]] = {
    "search.parts": ('Parts', '部品', '零件'),
    "search.companies": ('Companies', '取引先', '供应商·客户'),
    "search.warehouses": ('Warehouse·Location', '倉庫・位置', '仓库·位置'),
    "search.projects": ('Projects', 'プロジェクト', '项目'),
    "search.users": ('Users', 'ユーザー', '用户'),
    "shell.searchPh": ('Search screens·codes·parts·companies·docs (⌘K)', '画面・コード・部品・取引先・文書検索 (⌘K)', '搜索画面·代码·零件·供应商·文档 (⌘K)'),
}


def seed_v23(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V23.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v24 — F7 이력 diff 뷰어 UI 키 ──

UI_TRANSLATIONS_V24: dict[str, tuple[str, str, str]] = {
    "folder.diffNoPayload": ('diff — this action has no change payload (read-only event)', 'diff — この操作には変更ペイロードがありません (照会イベント)', 'diff — 此操作没有变更载荷 (查询类事件)'),
    "folder.diffTitle": ('diff — {t} · {a}', 'diff — {t} · {a}', 'diff — {t} · {a}'),
    "folder.diffField": ('Field', 'フィールド', '字段'),
    "folder.diffEmpty": ('No recorded fields', '記録されたフィールドなし', '无记录字段'),
}


def seed_v24(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V24.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


# ── seed v25 — F10 조회 UX 소품 UI 키 ──

UI_TRANSLATIONS_V25: dict[str, tuple[str, str, str]] = {
    "dash.kpiDrillHint": ('Click = open the owning screen', 'クリック = 担当画面を開く', '点击 = 打开对应画面'),
    "appr.etcTypes": ('Relation·Doc·Others', '関係・文書・その他', '关系·文档·其他'),
    "appr.searchPh": ('Search target·requester', '対象・申請者検索', '搜索对象·申请人'),
}


def seed_v25(cur, tid: int) -> None:
    for key, (en, ja, zh) in UI_TRANSLATIONS_V25.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


UI_TRANSLATIONS_V27: dict[str, tuple[str, str, str]] = {
    "menu.common": ('Common', '共通', '公共'),
    "menu.cpq-run": ('Run Pipeline (C-1)', 'Run パイプライン (C-1)', 'Run 流水线 (C-1)'),
    "menu.tbx-assistant": ('Internal Q&A (AI-08)', '社内 Q&A (AI-08)', '内部 Q&A (AI-08)'),
    "menu.com-detail": ('Detail Views (Drill-down)', '詳細照会 (ドリルダウン)', '详情查询 (下钻)'),
    "menu.detail-code": ('Code Detail', 'コード詳細', '代码详情'),
    "menu.detail-part": ('Part Detail (G3-b)', '部品詳細 (G3-b)', '部件详情 (G3-b)'),
    "menu.detail-event": ('Event Detail (E-4)', 'イベント詳細 (E-4)', '事件详情 (E-4)'),
    "menu.detail-output": ('Output Doc Detail (G3-a)', '成果物文書詳細 (G3-a)', '产出文档详情 (G3-a)'),
    "shell.logout": ('Logout', 'ログアウト', '登出'),
    "login.title": ('EDIM Login', 'EDIM ログイン', 'EDIM 登录'),
    "login.userId": ('Login ID', '社員番号', '工号'),
    "login.password": ('Password', 'パスワード', '密码'),
    "login.submit": ('Login (Enter)', 'ログイン (Enter)', '登录 (Enter)'),
    "login.checking": ('Checking…', '確認中…', '验证中…'),
    "editor.blockNone": ('(no registered blocks)', '(登録 Block なし)', '(无已注册 Block)'),
    "editor.blockTitle": ('Block — save unit · call from parent', 'Block — 単位保存・上位呼び出し', 'Block — 单元保存·上级调用'),
    "editor.blockNamePh": ('Block name (alphanumeric)', 'Block 名 (英数字)', 'Block 名称 (字母/数字)'),
    "macro.namePh": ('Macro name (TBX-…)', 'Macro 名 (TBX-…)', 'Macro 名称 (TBX-…)'),
    "macro.promptPh": ('Prompt (natural language)', 'Prompt (自然言語説明)', 'Prompt (自然语言说明)'),
    "macro.varsPh": ('Test vars: A=560, B=2', 'Test 変数: A=560, B=2', '测试变量: A=560, B=2'),
    "macro.descCol": ('Description', '説明', '说明'),
    "macro.exprCol": ('Expression', '数式', '公式'),
    "macro.saveF12": ('Save (F12)', '保存 (F12)', '保存 (F12)'),
    "templet.namePh": ('Templet name', 'Templet 名', 'Templet 名称'),
    "templet.sysCol": ('System', 'システム', '系统'),
    "templet.custom": ('Custom', 'カスタム', '自定义'),
    "templet.saveDraft": ('Save (DRAFT)', '保存 (DRAFT)', '保存 (DRAFT)'),
    "docmgmt.keepGrade": ('Keep grade', 'Grade 維持', '保持 Grade'),
    "docmgmt.docNo": ('Doc No', '文書番号', '文档编号'),
    "docmgmt.appDate": ('Approved on', '承認日', '批准日'),
    "docmgmt.approver": ('Approver', '承認者', '批准人'),
    "docmgmt.newTitlePh": ('New title (meta edit)', '新タイトル (メタ修正)', '新标题 (元数据修改)'),
    "printsetup.publish": ('Publish (after approval)', '公開 (承認後)', '发布 (审批后)'),
    "printsetup.form": ('Form', '様式', '表单'),
    "printsetup.canvasTitle": ('Form canvas — [Data]/[Chart]/[Table] placeholders', '様式キャンバス — [Data]/[グラフ]/[Table] プレースホルダ', '表单画布 — [Data]/[图表]/[Table] 占位符'),
    "printsetup.placeholderList": ('Placeholder list', 'プレースホルダ一覧', '占位符列表'),
    "uidsn.publish": ('Publish (after approval)', '公開 (承認後)', '发布 (审批后)'),
    "cpq.quoteLoad": ('Load quotation…', '見積案読込…', '加载报价方案…'),
    "cpq.quoteSave": ('Save F12', '保存 F12', '保存 F12'),
    "cpq.unitPriceK": ('Unit (K)', '単価(K)', '单价(K)'),
    "cpq.liveDb": ('Live DB', '実 DB', '实库'),
    "cpq.block": ('Block', 'ブロック', '块'),
    "techdata.totalPt": ('Total Pt', '全圧 Pt', '全压 Pt'),
    "techdata.staticPd": ('Static Pd', '静圧 Pd', '静压 Pd'),
    "approval.commentPh": ('Comment (required to reject)', '決裁意見 (差戻し時必須)', '审批意见 (驳回时必填)'),
    "approval.testFail": ('Fail', '未通過', '未通过'),
    "appr.drawing": ('Drawing', '図面', '图纸'),
    "appr.filterOff": ('Hide type', '種別非表示', '隐藏类型'),
    "appr.filterOn": ('Show type', '種別表示', '显示类型'),
    "task.commentPh": ('Comment (optional)', '処理意見 (任意)', '处理意见 (可选)'),
    "folder.uploadBtn": ('⬆ Upload', '⬆ アップロード', '⬆ 上传'),
    "folder.zipAll": ('⬇ ZIP (all)', '⬇ ZIP (全体)', '⬇ ZIP (全部)'),
    "folder.registrant": ('Registrant', '登録者', '登记人'),
    "folder.dateCol": ('Date', '日付', '日期'),
    "folder.kindCol": ('Kind', '種別', '种类'),
    "mobile.qty": ('Qty', '数量', '数量'),
    "mobile.complete": ('Mark complete', '完了処理', '完成处理'),
    "mobile.delayed": ('Delayed', '遅延', '延迟'),
    "enum.delayed": ('Delayed', '遅延', '延迟'),
    "panel.upload": ('Upload', 'アップロード', '上传'),
    "detail.supplier": ('Supplier', '仕入先', '供应商'),
    "detail.procCol": ('Process', '工程', '工序'),
    "detail.process": ('Process', '工程', '工序'),
    "detail.unit": ('Unit', '単位', '单位'),
    "detail.qty": ('Qty', '数量', '数量'),
    "detail.spec": ('Spec', '規格', '规格'),
    "detail.kindCol": ('Kind', '種別', '种类'),
    "detail.dateCol": ('Date', '日付', '日期'),
    "detail.completeEvent": ('Mark complete', '完了処理', '完成处理'),
    "hier.address": ('Hierarchy address', '階層アドレス', '层级地址'),
    "hier.groupCode": ('Group code', 'グループコード', '组代码'),
    "hier.groupName": ('Group name', 'グループ名', '组名'),
    "hier.groupType": ('Type', '種類', '类型'),
    "hier.status": ('Status', '状態', '状态'),
    "hier.groupUnit": ('groups', 'グループ', '组'),
    "subcode.groupNamePh": ('Group name', 'グループ名', '组名'),
    "subcode.newGroupCodePh": ('New group code', '新規グループコード', '新组代码'),
    "subcode.valuesPh": ('Values (· or , separated)', '値リスト (・/ , 区切り)', '值列表 (· 或 , 分隔)'),
    "subcode.saveF12": ('Save (F12)', '保存 (F12)', '保存 (F12)'),
    "subcode.item": ('Item', '項目名', '项目名'),
    "raw.addBtn": ('＋ Add material', '＋ 材質登録', '＋ 新增材质'),
    "raw.codeCol": ('Material code', '材質コード', '材质代码'),
    "raw.name": ('Material', '材質名', '材质名称'),
    "raw.type": ('Type', '種類', '类型'),
    "raw.density": ('Density', '密度', '密度'),
    "raw.standard": ('Spec', '規格', '规格'),
    "raw.hazardCol": ('Hazard', '危険', '危险'),
    "raw.editNamePh": ('New material name (edit)', '新しい材質名 (修正)', '新材质名 (修改)'),
    "raw.editDensityPh": ('New density', '新しい密度', '新密度'),
    "variant.addBtn": ('＋ Add value', '＋ 値登録', '＋ 新增值'),
    "variant.itemName": ('Item', '項目名', '项目名'),
    "variant.valueCode": ('Value code', '値コード', '值代码'),
    "variant.valueName": ('Value name', '値名', '值名称'),
    "variant.editNamePh": ('New value name (edit)', '新しい値名 (修正)', '新值名称 (修改)'),
    "dtable.addRow": ('＋ Add row', '＋ 行追加', '＋ 添加行'),
    "dtable.newKeyPh": ('New key', '新規 Key', '新 Key'),
    "di18n.statusCol": ('Status', '状態', '状态'),
    "master.group": ('Group', 'グループ', '组'),
    "master.approve": ('Approve', '承認', '批准'),
    "master.inactive": ('Deactivate', '非活性', '停用'),
    "quality.ruleCol": ('Rule', 'ルール', '规则'),
    "quality.macroCol": ('Macro expr', 'マクロ式', '宏表达式'),
    "quality.warningCol": ('Warning message', '警告メッセージ', '警告消息'),
    "quality.ruleNamePh": ('Rule name', 'ルール名', '规则名'),
    "quality.macroPh": ('Macro expr (=A>=…)', 'Macro 式 (=A>=…)', 'Macro 表达式 (=A>=…)'),
    "wp.minStockCol": ('Safety stock', '安全在庫', '安全库存'),
    "dwg.registerBtn": ('＋ Add drawing', '＋ 図面登録', '＋ 新增图纸'),
    "dwg.kindCol": ('Kind', '種別', '种类'),
    "dwg.dateCol": ('Date', '日付', '日期'),
    "parts.registerBtn": ('＋ Add part', '＋ 部品登録', '＋ 新增部件'),
    "grid.rowSelect": ('Select', '選択', '选择'),
    "purch.poConfirm": ('Confirm PO', 'PO 発注確定', 'PO 下单确认'),
    "purch.qcrNotePh": ('QCR note', 'QCR 備考', 'QCR 备注'),
    "purch.available": ('Avail', '利用可', '可用'),
    "purch.onHand": ('On hand', '保有', '在库'),
    "purch.reqDate": ('Req. date', '所要日', '需求日'),
    "purch.stockJudge": ('Stock check', '在庫判定', '库存判定'),
    "inv.onHand": ('On hand', '保有', '在库'),
    "wh.addLoc": ('＋ Add location', '＋ 位置登録', '＋ 新增位置'),
    "wh.locCodeCol": ('Loc code', '位置コード', '位置代码'),
    "wh.name": ('Location', '位置名', '位置名称'),
    "wh.hazardChip": ('Hazard', '危険', '危险'),
    "wh.hazardShort": ('Hazmat', '危険物', '危险品'),
    "company.registerBtn": ('＋ Add company', '＋ 取引先登録', '＋ 新增往来单位'),
    "company.importBtn": ('⬆ Bulk import', '⬆ 一括登録', '⬆ 批量导入'),
    "company.name": ('Company', '会社名', '公司名'),
    "company.nation": ('Country', '国', '国家'),
    "supp.delivery": ('Delivery', '納期', '交期'),
    "supp.note": ('Note', '備考', '备注'),
    "access.levelChange": ('Change level', 'レベル変更', '级别变更'),
    "access.inactivate": ('Deactivate', '非活性', '停用'),
    "access.addRole": ('＋ Role', '＋ ロール', '＋ 角色'),
    "access.newRolePh": ('New role name', '新しいロール名', '新角色名'),
    "price.closeToPh": ('End date YYYY-MM-DD', '終了日 YYYY-MM-DD', '结束日期 YYYY-MM-DD'),
    "procset.manual": ('Manual', '手動', '手动'),
    "audit.login": ('Login ID', '社員番号', '工号'),
    "ms.note": ('Note', '備考', '备注'),
    "ms.complete": ('Mark complete', '完了処理', '完成处理'),
    "act.qty": ('Qty', '数量', '数量'),
    "prj.addBtn": ('＋ Add project', '＋ プロジェクト登録', '＋ 新增项目'),
    "po.supplier": ('Supplier', '仕入先', '供应商'),
    "run.elapsed": ('Elapsed', '所要', '耗时'),
    "rel.addCodePh": ('e.g. KDI 21', '例: KDI 21', '例: KDI 21'),
    "rpt.catalog": ('Report catalog', 'レポートカタログ', '报表目录'),
}

def seed_v27(cur, tid: int) -> None:
    """N7 — Next 크롬 EN/JA/ZH 커버리지 1차 (라이브 스캔 잔존분)."""
    for key, (en, ja, zh) in UI_TRANSLATIONS_V27.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


UI_TRANSLATIONS_V28: dict[str, tuple[str, str, str]] = {
    # Next 포팅기(P1~P3)에 bundles.ts 에 직접 추가됐던 키 회수분 — 단일 진실(시드) 복원
    "arr.installNone": ('— none —', '— 未指定 —', '— 未指定 —'),
    "audit.action": ('Action', '操作', '操作'),
    "audit.after": ('After', '変更後', '变更后'),
    "audit.at": ('Timestamp', '日時', '时间'),
    "audit.before": ('Before', '変更前', '变更前'),
    "audit.by": ('Actor', '実行者', '执行者'),
    "audit.detail": ('Change detail — before / after', '変更詳細 — before / after', '变更详情 — before / after'),
    "audit.empty": ('No results — adjust filters and press F8', '結果なし — フィルタ調整後 F8', '无结果 — 调整筛选后按 F8'),
    "audit.period": ('Period', '期間', '期间'),
    "audit.reset": ('Reset', 'リセット', '重置'),
    "audit.selectedCsv": ('Selected CSV', '選択 CSV', '所选 CSV'),
    "audit.target": ('Target', '対象', '对象'),
    "audit.title": ('Audit log — sys_history (all-domain change history)', '監査ログ — sys_history (全ドメイン変更履歴)', '审计日志 — sys_history (全域变更历史)'),
    "audit.top500": ('top 500', '上位 500', '前 500'),
    "audit.user": ('User', 'ユーザー', '用户'),
    "codrel.ebomHint": ('EBOM Run — expands BOM-related items only (slide 70)', 'EBOM Run — BOM関連のみ展開（スライド70）', 'EBOM Run — 仅展开BOM相关项（幻灯片70）'),
    "codrel.openDetail": ('Code detail (Tech / Variant / Drawing)', 'コード詳細（Tech・Variant・図面）', '代码详情（Tech·Variant·图纸）'),
    "common.xlsxExport": ('Export full ledger to XLSX', '台帳全体をXLSXでエクスポート', '将台账导出为XLSX'),
    "cpq.detailSelect": ('Module detail selection', 'モジュール詳細選定', '模块详细选定'),
    "cpq.mirrorHint": ('Mirror selected block (MI)', '選択ブロック左右反転 (MI)', '镜像所选块 (MI)'),
    "cpq.rotateHint": ('Rotate selected block 90\\u00b0 (RO)', '選択ブロック90\\u00b0回転 (RO)', '旋转所选块90\\u00b0 (RO)'),
    "cpq.snapOff": ('Snap OFF', 'スナップ OFF', '捕捉 OFF'),
    "dash.deptDrillHint": ('Click = department task box (M-15-3)', 'クリック = 部門業務箱 (M-15-3)', '点击 = 部门任务箱 (M-15-3)'),
    "docmgmt.alloc": ('Auto number', '自動採番', '自动编号'),
    "docmgmt.allocHint": ('Rule-based auto numbering — {DEPT}·{TYPE}·{YYYY}·{SEQ} (slide 53)', 'ルールベース自動採番 — {DEPT}・{TYPE}・{YYYY}・{SEQ}（スライド53）', '基于规则的自动编号 — {DEPT}·{TYPE}·{YYYY}·{SEQ}（幻灯片53）'),
    "docmgmt.numberingRule": ('Numbering rule', '採番ルール', '编号规则'),
    "duct.airflow": ('Unit airflow', '装置風量', '设备风量'),
    "duct.bomItem": ('Item', '品目', '品目'),
    "duct.calcPdf": ('Calc sheet PDF', '計算書 PDF', '计算书 PDF'),
    "duct.calcTitle": ('Engineering calc sheet', '技術計算表', '技术计算表'),
    "duct.condensation": ('Condensation', '結露', '结露'),
    "duct.dewPoint": ('dew pt', '露点', '露点'),
    "duct.flowCompare": ('Flow compare', '風量比較', '风量对比'),
    "duct.hanger": ('hanger', 'ハンガー', '吊架'),
    "duct.load": ('Load', '荷重', '荷载'),
    "duct.perDiff": ('Per diffuser', 'ディフューザ当り', '每散流器'),
    "duct.pressureLoss": ('Pressure loss', '圧力損失', '压力损失'),
    "duct.purchaseLink": ('to purchasing', '購買連携', '采购联动'),
    "duct.risk": ('RISK', '危険', '风险'),
    "duct.safe": ('Safe', '安全', '安全'),
    "duct.size": ('Duct W\\u00d7H', 'ダクト W\\u00d7H', '风管 W\\u00d7H'),
    "duct.supplyT": ('Supply temp', '給気温度', '送风温度'),
    "duct.toPr": ('Material PR screen', '資材発注要請画面', '物料请购画面'),
    "duct.totalLen": ('Total duct length', 'ダクト総延長', '风管总长'),
    "duct.velocity": ('Velocity', '風速', '风速'),
    "editor.cycleFound": ('Cycle {n}', '循環 {n}', '循环 {n}'),
    "editor.cycleWarn": ('Circular reference \\u2014 wrong data extraction risk (slide 67)', '循環参照 \\u2014 誤データ抽出リスク', '循环引用 \\u2014 错误数据提取风险'),
    "editor.evalOrder": ('Eval order', '評価順序', '求值顺序'),
    "editor.noCycle": ('No cycle', '循環なし', '无循环'),
    "editor.priorityCheck": ('Priority / cycle check (U2)', '優先順位・循環点検 (U2)', '优先级·循环检查 (U2)'),
    "editor.priorityNote": ('Refs are token heuristics \\u2014 may include same-name Table column args', '参照はトークン推定 \\u2014 同名Table列引数を含む場合あり', '引用为令牌推定 \\u2014 可能包含同名Table列参数'),
    "inv.balance": ('Balance', '残量', '余量'),
    "inv.expiry": ('Expiry', '有効期限', '有效期'),
    "inv.lotPanel": ('Lot expiry', 'ロット有効期限', '批次有效期'),
    "inv.noLots": ('No lot stock', 'ロット在庫なし', '无批次库存'),
    "menu.common-direct": ('Common', '共通', '通用'),
    "menu.erp-mrp": ('MRP Requirements (M-8-5)', 'MRP 所要計画 (M-8-5)', 'MRP 需求计划 (M-8-5)'),
    "menu.erp-tenant-menu": ('Tenant Menu Admin (M-14-6B)', 'テナントメニュー管理 (M-14-6B)', '租户菜单管理 (M-14-6B)'),
    "menu.plm-direct": ('PLM Set-up', 'PLM Set-up', 'PLM Set-up'),
    "menu.toolbox-direct": ('EDIM Toolbox', 'EDIM Toolbox', 'EDIM Toolbox'),
    "mrp.code": ('Item code', '資材コード', '物料代码'),
    "mrp.dueDate": ('Earliest due', '最短納期', '最早交期'),
    "mrp.empty": ('No ORDERED material lines — convert a quotation in Sales Orders', 'ORDERED 資材ラインなし', '无 ORDERED 物料行'),
    "mrp.leadDays": ('Lead (days)', 'リード(日)', '提前期(天)'),
    "mrp.name": ('Name', '品名', '品名'),
    "mrp.onHand": ('On hand', '在庫', '库存'),
    "mrp.orderBy": ('Order by', '発注推奨日', '建议下单日'),
    "mrp.orderCount": ('Orders', '受注', '订单'),
    "mrp.orders": ('Orders', '関連受注', '相关订单'),
    "mrp.recalc": ('Recalculate', '再計算', '重新计算'),
    "mrp.required": ('Required', '所要量', '需求量'),
    "mrp.shortCount": ('Short items', '不足品目', '短缺品目'),
    "mrp.shortage": ('Short', '不足', '短缺'),
    "mrp.title": ('MRP Material Requirements', 'MRP 資材所要計画', 'MRP 物料需求计划'),
    "mrp.toPurchase": ('To purchase', '発注画面', '采购画面'),
    "panel.dept": ('Dept.', '部門', '部门'),
    "panel.file": ('File', 'ファイル', '文件'),
    "panel.name": ('Name', '名前', '名称'),
    "panel.preview": ('Preview (top 4)', 'プレビュー (上位4行)', '预览 (前4行)'),
    "panel.tools": ('Tools', 'ツール', '工具'),
    "panel.type": ('Type', '種類', '类型'),
    "parts.noSubst": ('No substitutes', '代替関係なし', '无替代关系'),
    "parts.note": ('Note', '備考', '备注'),
    "parts.substLink": ('Link', '連結', '关联'),
    "parts.substNo": ('Substitute', '代替品番', '替代件号'),
    "parts.substPh": ('Substitute part no', '代替部品番号', '替代件号'),
    "parts.substTitle": ('Substitute parts', '代替部品', '替代物料'),
    "printsetup.applyHint": ('Applied to Print Test·PDF·Office instantly', '設定は出力に即時反映', '设置即时应用于输出'),
    "printsetup.colorful": ('Color', 'カラー', '彩色'),
    "printsetup.footer": ('Footer', 'フッター', '页脚'),
    "printsetup.grayscale": ('Grayscale', 'モノクロ', '黑白'),
    "printsetup.landscape": ('Landscape', '横', '横向'),
    "printsetup.orientation": ('Orientation', '方向', '方向'),
    "printsetup.portrait": ('Portrait', '縦', '纵向'),
    "printsetup.printDialog": ('Print', '印刷', '打印'),
    "prj.commentPh": ('Write a comment (Enter)', 'コメント入力 (Enter)', '输入评论 (Enter)'),
    "prj.commentTitle": ('Project chat', 'プロジェクト対話', '项目沟通'),
    "prj.noComments": ('No comments yet', 'コメントなし', '暂无评论'),
    "prj.send": ('Post', '登録', '发布'),
    "qr.hint": ('QR for on-site scan — open this screen on mobile', '現場スキャン用QR — モバイルでこの画面を開く', '现场扫码QR — 在手机打开此画面'),
    "qr.scanHint": ('Scan with a mobile camera to open this screen (login required)', 'モバイルカメラでスキャンするとこの画面へ (ログイン必要)', '用手机相机扫码即可打开此画面 (需登录)'),
    "shell.addItem": ('Add items', '項目追加', '添加项目'),
    "shell.collapse": ('Collapse', '折りたたむ', '折叠'),
    "shell.doneItems": ('Done items', 'Done items', 'Done items'),
    "shell.expand": ('Expand', '展開', '展开'),
    "shell.favAdd": ('Add current screen to favorites', '現在の画面をお気に入りに追加', '收藏当前画面'),
    "shell.favNoScreen": ('Favorites — open a screen first', 'お気に入り — 先に画面を開いてください', '收藏 — 请先打开画面'),
    "shell.favRemove": ('Remove from favorites', 'お気に入り解除', '取消收藏'),
    "shell.favorite": ('Favorite', 'お気に入り', '收藏'),
    "shell.headEdit": ('Edit header menu — add / remove / reorder Head items', 'ヘッダーメニュー編集 — Head Item の追加・削除・並べ替え', '编辑标题菜单 — 添加·删除·重新排序 Head Item'),
    "shell.headEditTitle": ('Edit Header Menu', 'ヘッダーメニュー編集', '标题菜单编辑'),
    "shell.leftNavEmpty": ('No menus to show — ✎ Edit menu', '表示するメニューがありません — ✎ メニュー編集', '没有可显示的菜单 — ✎ 菜单编辑'),
    "shell.logoHint": ('Logo image for the title bar (PNG/SVG, under 48KB, height 18px scale)', 'タイトルバーのロゴ画像 (PNG/SVG, 48KB以下)', '标题栏Logo图片 (PNG/SVG, 48KB以下)'),
    "shell.logoRemove": ('Remove logo (default E mark)', 'ロゴ削除 (既定 E マーク)', '移除Logo (默认 E 标记)'),
    "shell.logoSetting": ('Company logo', '会社ロゴ設定', '公司Logo设置'),
    "shell.menuEdit": ('Edit menu', 'メニュー編集', '菜单编辑'),
    "shell.menuEditTitle": ('Edit left menu', '左メニュー編集', '左侧菜单编辑'),
    "shell.restoreDefault": ('Restore default', '既定に戻す', '恢复默认'),
    "shell.saveTenant": ('Save as tenant default', 'テナント既定として保存', '保存为租户默认'),
    "shell.saveTenantHint": ('Save this list as the tenant default — applied to all users without a personal setting (admin)', 'このリストをテナント既定として保存 — 個人設定のない全ユーザーに適用（管理者）', '将此列表保存为租户默认 — 应用于所有无个人设置的用户（管理员）'),
    "shell.scEsc": ('Close dialog', 'ダイアログを閉じる', '关闭对话框'),
    "shell.scFkeyCrud": ('New \\u00b7 Delete \\u00b7 Query (active screen)', '新規\\u00b7削除\\u00b7照会', '新建\\u00b7删除\\u00b7查询'),
    "shell.scFkeyRun": ('Run \\u00b7 Save (active screen)', 'Run\\u00b7保存', 'Run\\u00b7保存'),
    "shell.scGlobalSearch": ('Focus global search', '統合検索フォーカス', '聚焦全局搜索'),
    "shell.scGridFind": ('Find in grid', 'グリッド内検索', '网格内查找'),
    "shell.scTabClose": ('Close tab', 'タブを閉じる', '关闭标签'),
    "shell.scTabJump": ('Jump to tab N', 'タブN選択', '跳转标签N'),
    "shell.scTabMove": ('Move MDI tab', 'MDIタブ移動', '切换MDI标签'),
    "shell.schedule": ('Schedule', 'Schedule', 'Schedule'),
    "shell.scheduleHint": ('Open milestones', 'マイルストーンを開く', '打开里程碑'),
    "shell.shortcuts": ('Keyboard shortcuts', 'ショートカット', '快捷键'),
    "shell.shownItems": ('Shown items', '表示項目', '显示项目'),
    "shell.theme": ('Color theme', 'カラーテーマ', '颜色主题'),
    "shell.todoApprovalHint": ('Open approval inbox', '承認箱を開く', '打开审批箱'),
    "shell.todoPlHint": ('Open dashboard', 'ダッシュボードを開く', '打开仪表板'),
    "techdata.curveHint": ('Click a point to select the model (selected in red)', '点クリック=モデル選定 (選定点は赤)', '点击圆点=选定型号 (选定点红色)'),
    "techdata.curveTitle": ('Performance curve', '性能曲線', '性能曲线'),
    "uidsn.bindEmpty": ('No values', '値なし', '无值'),
    "uidsn.bindTest": ('Query', '照会', '查询'),
    "uidsn.columnPh": ('(column)', '（列）', '（列）'),
    "uidsn.dataPh": ('Data (field / parameter)', 'Data（フィールド・パラメータ）', 'Data（字段·参数）'),
    "uidsn.dblSetup": ('Double-click = Set-up (action / binding)', 'ダブルクリック＝Set-up（動作・バインディング）', '双击＝Set-up（动作·绑定）'),
    "uidsn.opNone": ('(none)', '（なし）', '（无）'),
    "uidsn.setupAction": ('Action (Commend set-up macro)', '動作（Commend set-up macro）', '动作（Commend set-up macro）'),
    "uidsn.setupBind": ('Combo Data set-up — table column binding', 'Combo Data set-up — テーブル列バインディング', 'Combo Data set-up — 表列绑定'),
    "uidsn.setupBtn": ('Set-up (action / binding)', 'Set-up（動作・バインディング）', 'Set-up（动作·绑定）'),
    "uidsn.setupTitle": ('Widget Set-up', 'Widget Set-up', 'Widget Set-up'),
    "uidsn.tablePh": ('(table)', '（テーブル）', '（表）'),
    "uidsn.targetPh": ('Target (table / screen / URL)', '対象（テーブル・画面・URL）', '目标（表·画面·URL）'),
    "wh.inspAdd": ('Record', '記録', '记录'),
    "wh.inspAt": ('At', '日時', '时间'),
    "wh.inspBy": ('By', '点検者', '巡检人'),
    "wh.inspNotePh": ('Inspection note', '点検備考', '巡检备注'),
    "wh.inspResult": ('Result', '判定', '判定'),
    "wh.inspTitle": ('Inspection records', '点検実績', '巡检记录'),
    "wh.noInsp": ('No inspections', '点検記録なし', '无巡检记录'),
    "wo.age": ('Age', '経過', '经过'),
    "wo.capBasis": ('persons\\u00d7480min/day approx.', '人員\\u00d7480分/日 近似', '人数\\u00d7480分/天 近似'),
    "wo.capTitle": ('Workshop capacity', '作業場 Capacity', '车间产能'),
    "wo.days": ('d', '日', '天'),
    "wo.daysNeeded": ('Needs', '所要', '需'),
    "wo.drawing": ('Drawing', '図面', '图纸'),
    "wo.min": ('min', '分', '分'),
    "wo.noCap": ('No load \\u2014 aggregated when Work Process times (U3) are set', '負荷なし \\u2014 工程工数(U3) 入力時に集計', '无负荷 \\u2014 录入工艺工时(U3)后汇总'),
    "wo.noOpen": ('No open work orders', '未完了作業指示なし', '无未完工单'),
    "wo.persons": ('p', '名', '人'),
    "wo.schedTitle": ('Open WO schedule', '未完了WOスケジュール', '未完工单排程'),
    "wo.workMin": ('Work', '工数', '工时'),
    "wp.designPriorityTitle": ('Design priority (slide 44)', '設計優先順位', '设计优先级'),
    "wp.dpBase": ('Base point', '設計基準点', '设计基准点'),
    "wp.dpError": ('Error check', '設計エラーチェック', '设计错误检查'),
    "wp.dpKind": ('Kind', '区分', '区分'),
    "wp.dpPriority": ('Design priority', '設計優先順位', '设计优先级'),
    "wp.dpUpper": ('Upper-design data', '上位設計優先資料', '上级设计优先资料'),
    "wp.paramHint": ('Inline-edit process params (workshop·persons·skill·W.Time·warehouse·stock) — F12 to save', '工程パラメータをインライン編集 — F12 保存', '内联编辑工艺参数 — F12 保存'),
    "wp.personCol": ('Persons', '人員', '人数'),
    "wp.workshopCol": ('Workshop', '作業場', '车间'),
}

def seed_v28(cur, tid: int) -> None:
    """N7 — Next 포팅기 직접 추가 번역 회수분 (bundles.ts → 시드 단일화)."""
    for key, (en, ja, zh) in UI_TRANSLATIONS_V28.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


UI_TRANSLATIONS_V29: dict[str, tuple[str, str, str]] = {
    "hier.title": ('Hierarchy Address (M-3-1)', '階層アドレス (M-3-1)', '层级地址 (M-3-1)'),
    "hier.nodeUnit": (' nodes', 'ノード', '节点'),
    "hier.parentPh": ('Parent address (empty=root)', '上位アドレス (なし=ルート)', '上级地址 (空=根)'),
    "hier.addressPh": ('Address (1.2.3)', 'アドレス (1.2.3)', '地址 (1.2.3)'),
    "hier.namePh": ('Node name', 'ノード名', '节点名称'),
    "hier.addNode": ('＋ Node', '＋ ノード', '＋ 节点'),
    "hier.searchPh": ('Search (name·address)', '検索 (名前・アドレス)', '搜索 (名称·地址)'),
    "hier.validateHint": ('Pre-save consistency check — dup address · orphan · parent mismatch (57-⑧)', '保存前整合チェック — アドレス重複・孤児・親不一致 (57-⑧)', '保存前一致性检查 — 地址重复·孤儿·父级不一致 (57-⑧)'),
    "hier.validate": ('Check', 'チェック', '检查'),
    "hier.renamePh": ('New name (rename)', '新しい名前 (改名)', '新名称 (改名)'),
    "hier.rename": ('Rename', '改名', '改名'),
    "po.collect": ('Collect', '着払い', '到付'),
    "po.land": ('Land', '陸上', '陆运'),
    "po.sea": ('Sea', '海上', '海运'),
    "po.air": ('Air', '航空', '空运'),
    "purch.code": ('Code', 'コード', '代码'),
    "purch.reqQty": ('Req', '所要', '需求'),
}

def seed_v29(cur, tid: int) -> None:
    """N7 2차 — 하드코딩 래핑분 (Hierarchy·발주 조건 옵션)."""
    for key, (en, ja, zh) in UI_TRANSLATIONS_V29.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


UI_TRANSLATIONS_V31: dict[str, tuple[str, str, str]] = {
    "kind.dwgApproval": ('Approval dwg', '承認図', '批准图'),
    "kind.quoteCost": ('Quote/Cost', '見積/原価', '报价/成本'),
    "kind.techData": ('Tech data', '技術資料', '技术资料'),
    "kind.received": ('Received', '受領資料', '接收资料'),
    "kind.upload": ('Upload', 'アップロード', '上传'),
    "kind.quoteApplied": ('Quote-applied', '見積適用', '报价适用'),
    "kind.quote": ('Quote', '見積', '报价'),
    "kind.stock": ('Stock', '在庫', '库存'),
    "kind.purchase": ('Purchase', '購買', '采购'),
    "stage.proposal": ('Proposal', '技術提案', '技术提案'),
    "stage.negotiation": ('Negotiation', '協議', '协商'),
    "stage.contract": ('Contract', '契約', '合同'),
    "stage.contractChange": ('Contract change', '契約変更', '合同变更'),
    "stage.execution": ('Execution', '遂行', '执行'),
    "stage.closed": ('Closed', '終了', '结束'),
    "stage.review": ('Review', '検討', '评审'),
    "enum.inProgress": ('In progress', '進行', '进行中'),
    "docstat.waitApprove": ('Awaiting approve', 'Approve 待ち', '待批准'),
    "docstat.drafting": ('Drafting', '作成中', '编写中'),
    "access.personUnit": (' users', '名', '名'),
}

def seed_v31(cur, tid: int) -> None:
    """N7 3차 — 서버 데이터 값(단계·종류·상태) 클라이언트 표시 매핑 키."""
    for key, (en, ja, zh) in UI_TRANSLATIONS_V31.items():
        for locale, text in (("en", en), ("ja", ja), ("zh", zh)):
            cur.execute(
                """UPDATE sys_translation SET text=%s
                   WHERE tenant_id=%s AND entity_type='UI' AND locale=%s AND field=%s""",
                (text, tid, locale, key))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO sys_translation (tenant_id, locale, entity_type, entity_id, field, text)
                       VALUES (%s,%s,'UI',0,%s,%s)""", (tid, locale, key, text))


def seed_v26(cur, tid: int) -> None:
    """D2 — 데모 재고 (inv_stock, 멱등: 마이그레이션 0004 후·비어있을 때만)."""
    cur.execute("SELECT to_regclass('public.inv_stock')")
    if not cur.fetchone()[0]:
        return
    cur.execute("SELECT 1 FROM inv_stock WHERE tenant_id=%s LIMIT 1", (tid,))
    if cur.fetchone():
        return
    for code, name, loc, qty in [("EWT-3", "Water Trap", "GEN-A01", 5),
                                 ("KDC-1", "Casing 강판", "WH-A-GEN", 2)]:
        cur.execute(
            """INSERT INTO inv_stock (tenant_id, item_code, item_name, location_code, quantity)
               VALUES (%s,%s,%s,%s,%s)""", (tid, code, name, loc, qty))
        cur.execute(
            """INSERT INTO inv_movement (tenant_id, item_code, location_code, movement_type,
               quantity, ref_type) VALUES (%s,%s,%s,'IN',%s,'SEED')""", (tid, code, loc, qty))
    logger.info("seed v26 — 데모 재고 2건")

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
            logger.info("base seed exists (tenant_id=%s)", row[0])
            _seed_v2(cur, row[0])
            seed_v3(cur, row[0])
            seed_v4(cur, row[0])
            seed_v5(cur, row[0])
            seed_v6(cur, row[0])
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

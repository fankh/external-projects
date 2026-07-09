"""EDIM Run 실 파이프라인 (P3-1) — BOM 전개 → 치수 Macro → 도면(DXF) →
원가(resolve) → 견적서 PDF(P2-4) → BOM XLSX → Project Folder 저장.

산출물은 MinIO(버킷 edim) + dwg_file 레지스트리 — Folder 화면·다운로드에 즉시 노출.
"""
from __future__ import annotations

import io
import json
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.services import storage
from app.services.macro_engine import Evaluator, MacroError

SOURCE_PRIORITY = ["APPLIED", "PURCHASE", "STOCK", "QUOTE"]

# 치수 Macro 정의 (Design Editor W-06 과 동일 체계 — dwg_dimension 이행 전 상수)
RUN_DIMS = [
    ("A", "670"), ("B", "=A+56"), ("C", "45"),
    ("D", "=Table12(B,710)"), ("E", "320"), ("K", "=A*1.62"),
]


@dataclass
class PipelineResult:
    items: list[dict[str, Any]] = field(default_factory=list)
    depth: int = 0
    dims: dict[str, float] = field(default_factory=dict)
    total_k: float = 0
    resolved: int = 0
    warn: list[str] = field(default_factory=list)
    files: list[tuple[str, str, str, bytes]] = field(default_factory=list)
    # (folder, file_name, file_type, data)


def _resolved_code(main: str, slots: dict[str, str]) -> str:
    parts = [v for _, v in sorted((slots or {}).items()) if v]
    return f"{main}-{'-'.join(parts)}" if parts else main


def step_bom(cur, tid: int, expand_rows, root: str, slot_values: dict[str, str],
             selection_id: int, r: PipelineResult) -> str:
    rows = expand_rows(cur, tid, root, slot_values)
    # cpq_selection_item 영속 (재실행 시 교체)
    cur.execute("DELETE FROM cpq_selection_item WHERE selection_id=%s", (selection_id,))
    for row in rows:
        code = _resolved_code(row[0], row[4] or {})
        item = {
            "level": row[3], "mainCode": row[0], "resolvedCode": code,
            "name": row[1], "quantity": float(row[2]),
            "priceK": round(float(row[6]) / 1000) if row[6] is not None else None,
            "path": row[5],
        }
        r.items.append(item)
        cur.execute(
            """INSERT INTO cpq_selection_item (selection_id, resolved_code, resolved_slots,
               item_name, quantity, bom_level)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (selection_id, code, json.dumps(row[4] or {}), row[1], float(row[2]), row[3]))
    r.depth = max((i["level"] for i in r.items), default=0)
    return f"{len(r.items)} 파트 · 깊이 {r.depth}"


def step_dims(cur, tid: int, table_resolver, r: PipelineResult) -> str:
    ev = Evaluator({}, table_resolver)
    n = 0
    for no, expr in RUN_DIMS:
        try:
            if expr.startswith("="):
                ev.vars.update({k.upper(): v for k, v in r.dims.items()})
                r.dims[no] = ev.run(expr)
                n += 1
            else:
                r.dims[no] = float(expr)
        except MacroError as e:
            r.warn.append(f"치수 {no}: {e}")
    return f"{n} 식 평가 (엔진 v1)"


def step_drawing(r: PipelineResult) -> str:
    """제작도면 DXF — 계산 치수로 Casing 외형 작도 (ezdxf, ENG-03 경로 재사용)."""
    import ezdxf
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    a = r.dims.get("A", 670)
    b = r.dims.get("B", 726)
    k = r.dims.get("K", 1085)
    # casing 외형 + 치수 텍스트
    msp.add_lwpolyline([(0, 0), (k, 0), (k, b), (0, b), (0, 0)])
    msp.add_lwpolyline([(k * 0.25, b * 0.2), (k * 0.75, b * 0.2),
                        (k * 0.75, b * 0.8), (k * 0.25, b * 0.8), (k * 0.25, b * 0.2)])
    msp.add_circle((k / 2, b / 2), a / 4)
    for label, x, y in [(f"A={a:g}", k / 2, b / 2), (f"B={b:g}", 10, b + 20),
                        (f"K={k:g}", k / 2, -30)]:
        msp.add_text(label, height=18).set_placement((x, y))
    buf = io.StringIO()
    doc.write(buf)
    r.files.append(("DWG", "KDCR3-13_mfg_RevB.dxf", "DXF", buf.getvalue().encode()))
    return "1 파일 (DXF R2010 · 치수 반영)"


def step_pricing(r: PipelineResult) -> str:
    r.total_k = sum((i["priceK"] or 0) * i["quantity"] for i in r.items)
    r.resolved = sum(1 for i in r.items if i["priceK"] is not None)
    missing = [i["resolvedCode"] for i in r.items if i["priceK"] is None]
    for code in missing:
        r.warn.append(f"{code}: 단가 없음 → 견적단가 협의 대상")
    return f"단가 resolve {r.resolved}/{len(r.items)}"


def step_quotation(r: PipelineResult, project_no: str) -> str:
    """견적서 PDF (P2-4) — reportlab, CJK CID 폰트 + CONFIDENTIAL 워터마크."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfgen import canvas

    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    # 워터마크 (DOC-002)
    c.saveState()
    c.setFont("Helvetica-Bold", 44)
    c.setFillColor(colors.Color(0.8, 0.3, 0.3, alpha=0.12))
    c.translate(w / 2, h / 2)
    c.rotate(30)
    c.drawCentredString(0, 0, "CONFIDENTIAL - NOVA")
    c.restoreState()
    # 머리글
    c.setFont("HYSMyeongJo-Medium", 16)
    c.drawString(50, h - 60, "견적서 (Quotation)")
    c.setFont("HYSMyeongJo-Medium", 9)
    c.drawString(50, h - 80, f"Project: {project_no} · Micron #7 · {date.today().isoformat()}")
    c.drawString(50, h - 93, "Doc No: QR-61216-01 · EDIM Run 자동 생성")
    # BOM 표
    y = h - 125
    c.setFont("HYSMyeongJo-Medium", 8.5)
    c.drawString(50, y, "Code")
    c.drawString(210, y, "품명")
    c.drawRightString(420, y, "수량")
    c.drawRightString(520, y, "금액(천원)")
    c.line(50, y - 3, 545, y - 3)
    y -= 16
    for i in r.items:
        amt = "-" if i["priceK"] is None else f"{i['priceK'] * i['quantity']:,.0f}"
        c.drawString(50, y, i["resolvedCode"][:34])
        c.drawString(210, y, i["name"][:24])
        c.drawRightString(420, y, f"{i['quantity']:g}")
        c.drawRightString(520, y, amt)
        y -= 14
    c.line(50, y - 1, 545, y - 1)
    c.setFont("HYSMyeongJo-Medium", 10)
    c.drawRightString(520, y - 16, f"합계  {r.total_k:,.0f} 천원")
    c.setFont("HYSMyeongJo-Medium", 7.5)
    c.drawString(50, 40, "EDIM Tool System — 승인 전 배포 금지 (Management Grade)")
    c.showPage()
    c.save()
    r.files.append(("PRICE", "QR-61216-01_quotation.pdf", "PDF", buf.getvalue()))
    return f"견적서 PDF · 합계 {r.total_k:,.0f}K"


def step_bom_xlsx(r: PipelineResult) -> str:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "BOM"
    ws.append(["Lv", "Code", "품명", "수량", "단가(천원)", "금액(천원)", "Path"])
    for i in r.items:
        ws.append([i["level"], i["resolvedCode"], i["name"], i["quantity"],
                   i["priceK"], (i["priceK"] or 0) * i["quantity"], i["path"]])
    ws.append([])
    ws.append(["", "", "합계", "", "", r.total_k, ""])
    buf = io.BytesIO()
    wb.save(buf)
    r.files.append(("BOM", "BOM_BM21456.xlsx", "XLSX", buf.getvalue()))
    return f"BOM {len(r.items)}행 XLSX"


def persist_outputs(cur, tid: int, run_id: int, project_no: str, r: PipelineResult) -> list[int]:
    """MinIO 업로드 + dwg_file + cpq_output(file_id) — Folder 화면 즉시 노출."""
    cur.execute("SELECT project_id FROM prj_project WHERE tenant_id=%s AND project_no=%s",
                (tid, project_no))
    prj = cur.fetchone()
    file_ids: list[int] = []
    ctypes = {"PDF": "application/pdf", "DXF": "application/dxf",
              "XLSX": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
    for folder, fname, ftype, data in r.files:
        key = f"{project_no}/{folder}/run{run_id}_{fname}"
        storage.put_object(key, data, ctypes.get(ftype, "application/octet-stream"))
        cur.execute(
            """INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type,
               file_path, file_size)
               VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING file_id""",
            (tid, prj[0] if prj else None, folder, fname, ftype, key, len(data)))
        fid = cur.fetchone()[0]
        file_ids.append(fid)
        cur.execute(
            """INSERT INTO cpq_output (run_id, output_type, file_id, data)
               VALUES (%s,%s,%s,%s)""",
            (run_id, folder, fid,
             json.dumps({"file": fname, "fileType": ftype, "size": len(data)})))
    return file_ids

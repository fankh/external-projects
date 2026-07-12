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


def _load_dims(cur, tid: int) -> list[tuple[str, str]]:
    """dwg_dimension + tbx_macro (seed v5) — 없으면 상수 폴백."""
    cur.execute(
        """SELECT d.dim_label,
                  COALESCE(m.macro_expr, d.variant_value::text)
           FROM dwg_dimension d
           JOIN dwg_drawing g ON g.drawing_id=d.drawing_id
           LEFT JOIN tbx_macro m ON m.macro_id=d.macro_id
           WHERE d.tenant_id=%s AND g.drawing_no='KDCR 3-13'
           ORDER BY d.dim_label""", (tid,))
    rows = [(r[0], r[1]) for r in cur.fetchall() if r[1]]
    return rows or list(RUN_DIMS)


def step_dims(cur, tid: int, table_resolver, r: PipelineResult) -> str:
    dims = _load_dims(cur, tid)
    ev = Evaluator({}, table_resolver)
    n = 0
    # 1차: Variant(숫자) → 2차 반복: Macro(=식) 의존 해소까지
    pending = []
    for no, expr in dims:
        if expr.startswith("="):
            pending.append((no, expr))
        else:
            r.dims[no] = float(expr)
    for _ in range(len(pending) + 1):
        remain = []
        for no, expr in pending:
            try:
                ev.vars = {k.upper(): v for k, v in r.dims.items()}
                r.dims[no] = ev.run(expr)
                n += 1
            except MacroError:
                remain.append((no, expr))
        if not remain:
            break
        if len(remain) == len(pending):
            for no, expr in remain:
                r.warn.append(f"치수 {no}: 평가 불가 ({expr})")
            break
        pending = remain
    return f"{n} 식 평가 (엔진 v1 · dwg_dimension)"


def build_part_dxf(dims: dict[str, float]) -> bytes:
    """Fan 원심 Casing 부품도 — Design Editor CAD 모드·Run 제작도면 공용 정본 (W-06 배치)."""
    import ezdxf
    from ezdxf.enums import TextEntityAlignment as TA
    a = float(dims.get("A", 670))
    b = float(dims.get("B", 726))
    k = float(dims.get("K", 1085))
    c = float(dims.get("C", 45))
    e = float(dims.get("E", 320))

    doc = ezdxf.new("R2010")
    doc.layers.add("CASING", color=5)     # blue
    doc.layers.add("PART", color=3)       # green
    doc.layers.add("CONE", color=8)       # gray (설치 참조)
    doc.layers.add("DIM", color=1)        # red
    msp = doc.modelspace()

    def rect(x, y, w, h, layer):
        msp.add_lwpolyline([(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
                           close=True, dxfattribs={"layer": layer})

    # Casing 외형 (K × B) + Impeller (A 폭) + Shaft/Bearing/Inlet Cone — W-06 배치
    rect(0, 0, k, b, "CASING")
    rect((k - a * 0.7) / 2, b * 0.25, a * 0.7, b * 0.5, "PART")           # impeller box
    msp.add_circle((k / 2, b / 2), a / 4, dxfattribs={"layer": "PART"})
    msp.add_line((-e * 0.5, b / 2), (k + e * 0.5, b / 2),
                 dxfattribs={"layer": "PART"})                            # shaft
    rect(-e * 0.5 - c, b / 2 - c, c, c * 2, "PART")                       # bearing L
    rect(k + e * 0.5, b / 2 - c, c, c * 2, "PART")                        # bearing R
    rect(-e * 0.35, b * 0.2, e * 0.35, b * 0.6, "CONE")                   # inlet cone L
    rect(k, b * 0.2, e * 0.35, b * 0.6, "CONE")                           # inlet cone R

    # 치수선 + 라벨 (KEY: A/B/K · DETAIL: C/E)
    def dim_h(x0, x1, y, label):
        msp.add_line((x0, y), (x1, y), dxfattribs={"layer": "DIM"})
        msp.add_text(label, height=b * 0.045, dxfattribs={"layer": "DIM"}) \
            .set_placement(((x0 + x1) / 2, y + b * 0.02), align=TA.MIDDLE_CENTER)

    dim_h((k - a * 0.7) / 2, (k + a * 0.7) / 2, b + b * 0.08, f"A = {a:g}")
    dim_h(0, k, b + b * 0.16, f"B(H) = {b:g}")
    dim_h(-e * 0.5 - c, k + e * 0.5 + c, -b * 0.1, f"K = {k:g}")
    msp.add_text(f"C = {c:g}", height=b * 0.04, dxfattribs={"layer": "DIM"}) \
        .set_placement((-e * 0.5 - c, b / 2 + c * 2.4))
    msp.add_text(f"E = {e:g}", height=b * 0.04, dxfattribs={"layer": "DIM"}) \
        .set_placement((k + e * 0.1, b * 0.12))
    msp.add_text("KDCR 3-13 · Fan 원심 Casing (Rev.B)", height=b * 0.05,
                 dxfattribs={"layer": "DIM"}).set_placement((0, -b * 0.2))

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode()


def step_drawing(r: PipelineResult) -> str:
    """제작도면 DXF — Design Editor 와 동일한 정본 작도 재사용 (ENG-03)."""
    r.files.append(("DWG", "KDCR3-13_mfg_RevB.dxf", "DXF", build_part_dxf(r.dims)))
    return "1 파일 (DXF R2010 · 치수 반영)"


# AHU 구성(Arrangement) 실도면 — C-1 캔버스의 CAD 정본 (mm, y-up)
ARRANGEMENT_BLOCKS = [
    # (name, sub, x, y, w, h)
    ("Filter", "EFP 55·3EA", 360, 860, 1100, 1000),
    ("Cooling Coil", "ECC 55·6R", 1460, 860, 1100, 1000),
    ("SF Fan", "KAD 900 FW", 2560, 1120, 2100, 740),
    ("Mixing Box", "EMX 55", 2560, 320, 2100, 800),
    ("Heating Coil", "EHC 55·2R", 360, 320, 2200, 540),
]


def build_arrangement_dxf(title: str = "AHU 5 — Double Deck 2") -> bytes:
    """구성 배치를 실 DXF 로 작도 — C-1 CAD 모드·DXF Export 공용 (INT-04)."""
    import ezdxf
    doc = ezdxf.new("R2010")
    doc.layers.add("ARRANGEMENT", color=5)   # blue
    doc.layers.add("LABEL", color=250)
    doc.layers.add("DIM", color=3)           # green
    msp = doc.modelspace()
    for name, sub, x, y, w, h in ARRANGEMENT_BLOCKS:
        msp.add_lwpolyline(
            [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)],
            dxfattribs={"layer": "ARRANGEMENT"})
        msp.add_text(name, height=90, dxfattribs={"layer": "LABEL"}) \
            .set_placement((x + w / 2, y + h / 2 + 30), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
        msp.add_text(sub, height=60, dxfattribs={"layer": "LABEL"}) \
            .set_placement((x + w / 2, y + h / 2 - 90), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    # 전체 치수 (4504 × 3254 — 슬라이드 표기)
    msp.add_line((360, 2050), (4660, 2050), dxfattribs={"layer": "DIM"})
    msp.add_text("4504", height=100, dxfattribs={"layer": "DIM"}) \
        .set_placement((2510, 2110), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    msp.add_line((4800, 320), (4800, 1860), dxfattribs={"layer": "DIM"})
    msp.add_text("3254", height=100, dxfattribs={"layer": "DIM"}) \
        .set_placement((4900, 1090), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    msp.add_text(title, height=120, dxfattribs={"layer": "LABEL"}) \
        .set_placement((360, 60))
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode()


def step_pricing(r: PipelineResult) -> str:
    r.total_k = sum((i["priceK"] or 0) * i["quantity"] for i in r.items)
    r.resolved = sum(1 for i in r.items if i["priceK"] is not None)
    missing = [i["resolvedCode"] for i in r.items if i["priceK"] is None]
    for code in missing:
        r.warn.append(f"{code}: 단가 없음 → 견적단가 협의 대상")
    return f"단가 resolve {r.resolved}/{len(r.items)}"


def _draw_watermark(c, w: float, h: float, text: str) -> None:
    """대외비 워터마크 — 페이지 전면 대각 타일 반복 (크롭·부분 캡처 방지, DOC-002 강화)."""
    from reportlab.lib import colors
    c.saveState()
    c.setFont("Helvetica-Bold", 26)
    c.setFillColor(colors.Color(0.80, 0.30, 0.30, alpha=0.10))
    c.translate(w / 2, h / 2)
    c.rotate(35)
    c.translate(-w / 2, -h / 2)
    step_x, step_y = 300, 165
    y = -int(h)
    while y < int(2 * h):
        x = -int(w)
        while x < int(2 * w):
            c.drawString(x, y, text)
            x += step_x
        y += step_y
    c.restoreState()


def build_doc_pdf(*, doc_no: str, title: str, doc_type: str, status: str, version: str,
                  person: str, grade: str, created: str, confidential: bool) -> bytes:
    """문서 관리 PDF 실렌더 (B4 · SVC-11) — Grade S-1/S-2 는 CONFIDENTIAL 워터마크 강제."""
    import os

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    font_name = "HYSMyeongJo-Medium"
    ttf = "/app/fonts/NanumGothic.ttf"
    if os.path.exists(ttf):
        if "NanumGothic" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("NanumGothic", ttf))
        font_name = "NanumGothic"
    else:
        pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    if confidential:
        _draw_watermark(c, w, h, f"CONFIDENTIAL · {grade}")
    c.setFont(font_name, 16)
    c.drawString(50, h - 60, title)
    c.setFont(font_name, 9)
    c.drawString(50, h - 80, f"DOC No: {doc_no} · {doc_type} · Ver {version}")
    c.drawString(50, h - 93, f"작성 {person} · {created} · 상태 {status} · Grade {grade}")
    c.setStrokeColor(colors.HexColor("#1F4E8C"))
    c.line(50, h - 102, w - 50, h - 102)
    y = h - 130
    c.setFont(font_name, 9.5)
    for line in [
        "본 문서는 EDIM 문서 관리(doc_control)에서 자동 렌더된 게시본이다.",
        f"Management Grade {grade} — 열람·출력 통제 대상" + (" (워터마크 강제)" if confidential else ""),
        "승인 완료(Accepted) 전 판은 DRAFT 로 간주한다 (DOC-002).",
    ]:
        c.drawString(50, y, line)
        y -= 16
    c.setFont(font_name, 7.5)
    c.drawString(50, 40, f"EDIM Tool System · NOVA Solution · {date.today().isoformat()} 자동 생성")
    c.showPage()
    c.save()
    return buf.getvalue()


def build_lines_pdf(*, title: str, subtitle: str = "", lines: list[str],
                    confidential: bool = False) -> bytes:
    """범용 라인 PDF (B4 · SVC-11) — Print Set-up Test·Doc Templet Print 공용."""
    import os

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    font_name = "HYSMyeongJo-Medium"
    ttf = "/app/fonts/NanumGothic.ttf"
    if os.path.exists(ttf):
        if "NanumGothic" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("NanumGothic", ttf))
        font_name = "NanumGothic"
    else:
        pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    if confidential:
        _draw_watermark(c, w, h, "CONFIDENTIAL · NOVA")
    c.setFont(font_name, 15)
    c.drawString(50, h - 58, title[:70])
    if subtitle:
        c.setFont(font_name, 9)
        c.drawString(50, h - 76, subtitle[:110])
    c.setStrokeColor(colors.HexColor("#1F4E8C"))
    c.line(50, h - 86, w - 50, h - 86)
    y = h - 112
    c.setFont(font_name, 9.5)
    for line in lines[:44]:
        c.drawString(50, y, str(line)[:110])
        y -= 15
    c.setFont(font_name, 7.5)
    c.drawString(50, 40, f"EDIM Tool System · NOVA Solution · {date.today().isoformat()} 자동 생성")
    c.showPage()
    c.save()
    return buf.getvalue()


def step_quotation(r: PipelineResult, project_no: str) -> str:
    """견적서 PDF (P2-4) — reportlab, CJK CID 폰트 + CONFIDENTIAL 워터마크."""
    import os

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    # TTF 임베드 우선 (뷰어 무관 한글 렌더) — 없으면 CID 폴백
    font_name = "HYSMyeongJo-Medium"
    ttf = "/app/fonts/NanumGothic.ttf"
    if os.path.exists(ttf):
        pdfmetrics.registerFont(TTFont("NanumGothic", ttf))
        font_name = "NanumGothic"
    else:
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
    c.setFont(font_name, 16)
    c.drawString(50, h - 60, "견적서 (Quotation)")
    c.setFont(font_name, 9)
    c.drawString(50, h - 80, f"Project: {project_no} · Micron #7 · {date.today().isoformat()}")
    c.drawString(50, h - 93, "Doc No: QR-61216-01 · EDIM Run 자동 생성")
    # BOM 표
    y = h - 125
    c.setFont(font_name, 8.5)
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
    c.setFont(font_name, 10)
    c.drawRightString(520, y - 16, f"합계  {r.total_k:,.0f} 천원")
    c.setFont(font_name, 7.5)
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
    # 제작 DXF 는 KDCR 3-13 부품도(build_part_dxf) — 도면 대장(dwg_drawing) 연결 (B7)
    cur.execute("SELECT drawing_id FROM dwg_drawing WHERE tenant_id=%s AND drawing_no=%s",
                (tid, "KDCR 3-13"))
    dwg = cur.fetchone()
    file_ids: list[int] = []
    ctypes = {"PDF": "application/pdf", "DXF": "application/dxf",
              "XLSX": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
    for folder, fname, ftype, data in r.files:
        key = f"{project_no}/{folder}/run{run_id}_{fname}"
        storage.put_object(key, data, ctypes.get(ftype, "application/octet-stream"))
        cur.execute(
            """INSERT INTO dwg_file (tenant_id, project_id, folder, drawing_id, file_name,
               file_type, file_path, file_size)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING file_id""",
            (tid, prj[0] if prj else None, folder,
             dwg[0] if (dwg and ftype == "DXF") else None, fname, ftype, key, len(data)))
        fid = cur.fetchone()[0]
        file_ids.append(fid)
        cur.execute(
            """INSERT INTO cpq_output (run_id, output_type, file_id, data)
               VALUES (%s,%s,%s,%s)""",
            (run_id, folder, fid,
             json.dumps({"file": fname, "fileType": ftype, "size": len(data)})))
    return file_ids

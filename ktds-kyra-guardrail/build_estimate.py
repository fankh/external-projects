# -*- coding: utf-8 -*-
"""KT DS AI 가드레일 견적서 생성 — 씨커스 표준 견적 양식(05_견적서_표준양식_씨커스.xlsx)
견적서(업무) 시트 기준. 제품(모듈) 단위 정액 견적이며 재경비·기술료는 0원이다."""
import math

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

OUT = r"C:\repos\external-projects\ktds-kyra-guardrail\[KT DS] AI가드레일_구축_견적서_20260828.xlsx"

GULIM = "굴림체"
DARK = "FF333333"
GRAY = "FF969696"
LIME = "FF99CC00"
WHITE = "FFFFFFFF"
BAND = "FFF2F2F2"

_S = {"thin": Side(style="thin"), "medium": Side(style="medium"), None: Side()}


def B(l=None, r=None, t=None, b=None):
    return Border(left=_S[l], right=_S[r], top=_S[t], bottom=_S[b])


def put(ws, coord, value=None, *, sz=10, bold=False, color=None, fill=None,
        h=None, v="center", wrap=True, nf="General", bd=None, indent=0):
    c = ws[coord]
    if value is not None:
        c.value = value
    c.font = Font(name=GULIM, size=sz, bold=bold, color=color)
    if fill:
        c.fill = PatternFill("solid", fgColor=fill)
    c.alignment = Alignment(horizontal=h, vertical=v, wrap_text=wrap, indent=indent)
    c.number_format = nf
    if bd:
        c.border = bd
    return c


def est_height(text, width, sz=10, line=14.0, pad=10.0, minimum=0.0):
    """열 너비에 맞춰 줄바꿈을 감안한 행 높이를 추정한다."""
    cap = max(4.0, width * 11.0 / sz - 2.0)
    n = 0
    for ln in text.splitlines() or [""]:
        w = sum(2 if ord(ch) > 0x1100 else 1 for ch in ln)
        n += max(1, int(math.ceil(w / cap)))
    return max(minimum, n * line + pad)


# ---------------------------------------------------------------- 견적 데이터
ITEMS = [
    ("KYRA\nAI Guardrail",
     "- AI 가드레일 구축 (KYRA AI Guardrail 1식)\n"
     "  · 입력 · AI모델 동작 · 출력 3단계 다중화 가드레일\n"
     "    (민감정보 필터링, 적대적 공격 방어, 서비스 거부 공격 대응, 응답 결과 변형)\n"
     "  · 프롬프트 인젝션 방어, 유해 콘텐츠 · 개인정보 · 기밀데이터 자동 검출 및 마스킹\n"
     "  · 응답 범위 제한(Topic Restriction), 사용자 권한별 기능 접근통제, 통합 관리 콘솔\n"
     "  · 비정상 쿼리 패턴 · 반복적 우회 시도 · 과도한 요청(Rate Abuse) 탐지 및 관리자 경보\n"
     "  · 전체 입·출력 이력 보존, 원인 추적 · 감사 기능, Syslog / SIEM 연동\n"
     "  · 다중망(AI망 · 운영망 · 개발망 · DMZ · AI개발망) 설치 · 구성,\n"
     "    운영자 교육 및 기술 이전",
     70_000_000, "SEC-006\nSEC-008"),
]

TOTAL = sum(a for _, _, a, _ in ITEMS)
assert TOTAL == 70_000_000, TOTAL

E_W = 66.0

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "견적서"
ws.sheet_view.showGridLines = False
ws.page_setup.orientation = "portrait"
ws.page_setup.paperSize = 9
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1

for col, w in {"A": 1.77, "B": 5.55, "C": 17.0, "D": 1.0, "E": E_W,
               "F": 13.32, "G": 10.55, "H": 14.5, "I": 14.5, "J": 12.0,
               "K": 1.77}.items():
    ws.column_dimensions[col].width = w

# 표제부
ws.merge_cells("B1:J1")
put(ws, "B1", "견    적    서", sz=34, h="center", wrap=False)
ws.row_dimensions[1].height = 43.5
ws.row_dimensions[2].height = 31.5
ws.row_dimensions[3].height = 31.5

ws.merge_cells("B4:F5")
put(ws, "B4", "주식회사 케이티디에스 귀중", sz=18, bold=True, color="FF000000", h="left")
ws.row_dimensions[4].height = 31.5
ws.row_dimensions[5].height = 13.5

LEFT = [
    "견  적   명 : AI 가드레일 구축 (RFI 요건 SEC-006 · SEC-008 대응)",
    "참       조 : AX솔루션개발팀 박준현 님",
    "견 적 일 자 : 2026년 8월 28일",
    "유 효 기 간 : 견적일로부터 30일",
    "견 적 번 호 : SKS-20260828-01",
]
RIGHT = [
    "주식회사 씨커스(Seekers Inc.)",
    "대 표 이 사 : 최  경  호 (직인생략)",
    "전       화 : 02) 2039-8160",
    "팩       스 : 02) 2039-8161",
    "주       소 : 경상북도 포항시 북구 흥해읍 융합기술로66, ",
    "              포항지식산업센터 408~409호",
]
for i, txt in enumerate(LEFT):
    put(ws, "B%d" % (6 + i), txt, sz=12, color="FF000000", h="left", wrap=False)
for i, txt in enumerate(RIGHT):
    put(ws, "G%d" % (6 + i), txt, sz=10.5, color="FF000000", h="left", wrap=False)
ws.row_dimensions[6].height = 23.25
for r in range(7, 14):
    ws.row_dimensions[r].height = 14.25

put(ws, "B12", "아래와 같이 견적합니다.", sz=12, color="FF000000", h="left", wrap=False)

ws.merge_cells("B14:J14")
put(ws, "B14", "최종 견적 금액 : 일금 칠천만원 정(70,000,000원) (VAT 별도)",
    sz=14, bold=True, h="left", wrap=False)
ws.row_dimensions[14].height = 36.0

# 표 머리
ws.merge_cells("C15:D15")
for col in "BCDEFGHIJ":
    put(ws, "%s15" % col, None, sz=11, bold=True, color=WHITE, fill=DARK, h="center",
        bd=B("medium" if col == "B" else "thin",
             "medium" if col == "J" else "thin", "medium", "medium"))
for col, label in (("B", "SEQ"), ("C", "구분"), ("E", "세부내용"), ("F", "단가"),
                   ("G", "모듈(식)"), ("H", "금액"), ("I", "할인금액"), ("J", "비고")):
    ws["%s15" % col].value = label
ws.row_dimensions[15].height = 39.95

# 과업명 밴드
ws.merge_cells("B16:J16")
for col in "BCDEFGHIJ":
    put(ws, "%s16" % col, None, sz=12, bold=True, color="FF808080", fill=LIME, h="center",
        bd=B("medium" if col == "B" else None,
             "medium" if col == "J" else None, "medium", "medium"))
ws["B16"].value = "AI 가드레일 구축 — KYRA AI Guardrail (다중화 가드레일 1식)"
ws.row_dimensions[16].height = 39.95

# 품목 행
row = 17
item_first = row
for seq, (name, detail, amount, note) in enumerate(ITEMS, start=1):
    put(ws, "B%d" % row, seq, sz=10, color="FF000000", fill=WHITE, h="center",
        bd=B("medium", "thin", "thin", "thin"))
    ws.merge_cells("C%d:D%d" % (row, row))
    for col in "CD":
        put(ws, "%s%d" % (col, row), None, sz=10, bold=True, fill=WHITE, h="center",
            bd=B("thin", "thin", "thin", "thin"))
    ws["C%d" % row].value = name
    put(ws, "E%d" % row, detail, sz=10, fill=WHITE, h="left", indent=1,
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "F%d" % row, amount, sz=10, fill=WHITE, h="right", nf="#,##0",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "G%d" % row, 1, sz=10, fill=WHITE, h="center",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "H%d" % row, "=F%d*G%d" % (row, row), sz=10, fill=WHITE, h="right",
        nf="#,##0", bd=B("thin", "thin", "thin", "thin"))
    put(ws, "I%d" % row, 0, sz=10, fill=WHITE, h="right", nf="#,##0",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "J%d" % row, note, sz=10, fill=WHITE, h="center",
        bd=B("thin", "medium", "thin", "thin"))
    ws.row_dimensions[row].height = est_height(detail, E_W, minimum=40.0)
    row += 1
item_last = row - 1


def subtotal_row(r, label, formula, bottom="thin"):
    ws.merge_cells("B%d:E%d" % (r, r))
    for col in "BCDE":
        put(ws, "%s%d" % (col, r), None, sz=11, bold=True, color="FF000000", fill=BAND,
            h="center", bd=B("medium" if col == "B" else None, None, "thin", bottom))
    ws["B%d" % r].value = label
    for col, val, nf in (("F", "-", "General"), ("G", "-", "General"),
                         ("H", formula, "#,##0"), ("I", 0, "#,##0"),
                         ("J", None, "General")):
        put(ws, "%s%d" % (col, r), val, sz=11, bold=True, fill=BAND,
            h="right" if col in "HI" else "center", nf=nf,
            bd=B("thin", "medium" if col == "J" else "thin", "thin", bottom))
    ws.row_dimensions[r].height = 28.0


r_sub1 = row
subtotal_row(r_sub1, "소계", "=SUM(H%d:H%d)" % (item_first, item_last))
row += 1

# 재경비 · 기술료 (0원)
for seq, (name, detail) in enumerate(
        [("재경비", "- 제공 기술에 대한 일반 재경비 (본 견적 미적용)"),
         ("기술료", "- 제공 기술료 (본 견적 미적용)")],
        start=len(ITEMS) + 1):
    put(ws, "B%d" % row, seq, sz=10, color="FF000000", fill=WHITE, h="center",
        bd=B("medium", "thin", "thin", "thin"))
    ws.merge_cells("C%d:D%d" % (row, row))
    for col in "CD":
        put(ws, "%s%d" % (col, row), None, sz=10, bold=True, fill=WHITE, h="center",
            bd=B("thin", "thin", "thin", "thin"))
    ws["C%d" % row].value = name
    put(ws, "E%d" % row, detail, sz=10, fill=WHITE, h="left", indent=1,
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "F%d" % row, "-", sz=10, fill=WHITE, h="center",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "G%d" % row, "-", sz=10, fill=WHITE, h="center",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "H%d" % row, 0, sz=10, fill=WHITE, h="right", nf="#,##0",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "I%d" % row, 0, sz=10, fill=WHITE, h="right", nf="#,##0",
        bd=B("thin", "thin", "thin", "thin"))
    put(ws, "J%d" % row, "0원", sz=10, fill=WHITE, h="center",
        bd=B("thin", "medium", "thin", "thin"))
    ws.row_dimensions[row].height = 26.0
    row += 1

r_sub2 = row
subtotal_row(r_sub2, "소계", "=SUM(H%d:H%d)" % (r_sub2 - 2, r_sub2 - 1), bottom="medium")
row += 1

# 합계
r_tot = row
ws.merge_cells("B%d:E%d" % (r_tot, r_tot))
for col in "BCDE":
    put(ws, "%s%d" % (col, r_tot), None, sz=11, color=WHITE, fill=GRAY, h="center",
        bd=B("medium" if col == "B" else None, None, "medium", "medium"))
ws["B%d" % r_tot].value = "합계"
for col, val, nf in (("F", "-", "General"), ("G", "-", "General"),
                     ("H", "=H%d+H%d" % (r_sub1, r_sub2), "#,##0"),
                     ("I", "=I%d+I%d" % (r_sub1, r_sub2), "#,##0"),
                     ("J", None, "General")):
    put(ws, "%s%d" % (col, r_tot), val, sz=11, bold=col in "HI",
        color="FF000000" if col in "HI" else WHITE, fill=GRAY,
        h="right" if col in "HI" else "center", nf=nf,
        bd=B("thin", "medium" if col == "J" else "thin", "medium", "medium"))
ws.row_dimensions[r_tot].height = 30.0
row += 1

# 특별 견적 금액
r_sp = row
for pair in ("B%d:E%d", "F%d:F%d", "G%d:G%d", "H%d:H%d", "I%d:I%d"):
    ws.merge_cells(pair % (r_sp, r_sp + 1))
for rr in (r_sp, r_sp + 1):
    for col in "BCDEFGHIJ":
        put(ws, "%s%d" % (col, rr), None, sz=11, bold=True, color=WHITE, fill=DARK,
            h="center",
            bd=B("medium" if col == "B" else "thin",
                 "medium" if col == "J" else "thin",
                 "medium" if rr == r_sp else None,
                 "medium" if rr == r_sp + 1 else None))
    ws.row_dimensions[rr].height = 20.1
ws["B%d" % r_sp].value = "특별 견적 금액"
put(ws, "H%d" % r_sp, "=H%d" % r_tot, sz=11, bold=True, color=WHITE, fill=DARK,
    h="right", nf="#,##0", bd=B("thin", "thin", "medium", "medium"))
put(ws, "I%d" % r_sp, "=H%d" % r_tot, sz=11, bold=True, color=WHITE, fill=DARK,
    h="right", nf="#,##0", bd=B("thin", "thin", "medium", "medium"))
ws["J%d" % r_sp].value = "*할인률"
put(ws, "J%d" % (r_sp + 1), "=100%%-(I%d/H%d)" % (r_sp, r_sp), sz=11, color=WHITE,
    fill=DARK, h="center", nf="0.00%", bd=B("thin", "medium", None, "medium"))
row += 2

# 비고
NOTE = (
    "※ 비 고\n"
    "   - 본 견적은 RFI 요건 SEC-006(AI시스템 가드레일 다중화 구성) 및 SEC-008 "
    "대응 범위에 대한 견적입니다.\n"
    "   - 당사 KYRA AI Guardrail 1식 정액으로 산정하였으며, "
    "재경비 및 기술료는 적용하지 않았습니다.\n"
    "   - 상기 금액은 부가가치세(VAT) 별도 금액이며, 계약 조건은 계약서에 따릅니다.\n"
    "   - 서버·스토리지 등 하드웨어, 상용 LLM API 사용료, 타사 솔루션 라이선스 비용은 "
    "본 견적에 포함되어 있지 않습니다."
)
r_note = row
ws.merge_cells("B%d:J%d" % (r_note, r_note + 1))
for rr in (r_note, r_note + 1):
    for col in "BCDEFGHIJ":
        put(ws, "%s%d" % (col, rr), None, sz=11, h="left",
            bd=B("medium" if col == "B" else None,
                 "medium" if col == "J" else None,
                 "medium" if rr == r_note else None,
                 "medium" if rr == r_note + 1 else None))
ws["B%d" % r_note].value = NOTE
ws.row_dimensions[r_note].height = est_height(NOTE, 145.0, sz=11, line=16.0, pad=14.0)
ws.row_dimensions[r_note + 1].height = 12.0
ws.print_area = "A1:K%d" % (r_note + 1)

wb.save(OUT)
print("saved:", OUT)
print("items=%d  TOTAL=%d  재경비=0  기술료=0" % (len(ITEMS), TOTAL))

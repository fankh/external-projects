# -*- coding: utf-8 -*-
"""EDIM 산출물 다운로드 포털 생성 — Dense(B안) 스타일.

파일 크기·수정일을 실제 스캔하여 docs/portal.html 생성.
배포: /var/www/edim/docs/index.html + files/ (서버 pull 후 copy)
실행: py docs/tools/make_docs_portal.py
"""
import html
import os
from datetime import datetime

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(BASE, "portal.html")

# (그룹, 파일 상대경로, 표시명, 설명)
FILES = [
 ("기준·관리", "EDIM_개요.md", "시스템 개요서", "발표자료 78슬라이드 분석 — 전 문서의 기준 (Mermaid 8)"),
 ("기준·관리", "README.md", "문서 관리 요약", "문서 지도·추적 체계·관리 규칙 — 단일 진입점"),
 ("기준·관리", "EDIM_산출물목록.xlsx", "산출물목록", "37종 레지스터 — 상태·작업자·우선 권고"),
 ("기준·관리", "EDIM_요구사항_보완노트.md", "요구사항 보완노트", "PPT 재검토 발견·고객 협의 필요 항목"),

 ("요구·기능", "02_요구사항/EDIM_요구사항정의서.xlsx", "요구사항정의서", "기능 50 · 비기능 22(i18n 확정) · 인터페이스 8 · 용어 16"),
 ("요구·기능", "EDIM_기능정의서.xlsx", "기능정의서", "14모듈 179기능 — 컴포넌트·DB·Phase·작업자 추적"),
 ("요구·기능", "EDIM_메뉴정의서.xlsx", "메뉴정의서", "98메뉴 — 화면·기능·권한 매핑 (PPT 3차 전수 대조)"),
 ("요구·기능", "EDIM_요구사항추적표.xlsx", "요구사항추적표 (RTM)", "REQ→기능→메뉴→화면→컴포넌트→DB 180행 · 커버리지 179/179"),
 ("요구·기능", "03_기능확인서_FVT/EDIM_기능확인서.xlsx", "기능확인서 (FVT)", "검수용 — 기능 179·비기능 22 확인 항목·승인란"),

 ("DB·스키마", "EDIM_DB_정의서.md", "DB 정의서 (MD)", "54테이블 462컬럼 — 설계 원칙·제약·리뷰 이력 v0.5"),
 ("DB·스키마", "EDIM_DB정의서.xlsx", "DB 정의서 (Excel)", "테이블목록·컬럼정의·공통코드 시트"),
 ("DB·스키마", "ddl/edim_schema.sql", "DB Schema DDL", "PostgreSQL 16 — 실 DB 적용 검증 완료 (54테이블·제약·인덱스)"),
 ("DB·스키마", "ddl/verify_runtime.sql", "런타임 검증 SQL", "BOM 재귀 전개·제약 6종 위반 테스트 스위트"),

 ("설계", "EDIM_컴포넌트_정의서.md", "컴포넌트 정의서 (MD)", "39컴포넌트 — 아키텍처 결정·구축 현황"),
 ("설계", "EDIM_컴포넌트정의서.xlsx", "컴포넌트 정의서 (Excel)", "컴포넌트 목록 + API 108"),
 ("설계", "api/edim-openapi.yaml", "OpenAPI 3.1 스펙", "107 오퍼레이션 · 52 스키마 — 검증 통과 (자동 생성)"),
 ("설계", "EDIM_인터페이스정의서.md", "인터페이스 정의서", "공통 규약·오류 카탈로그·외부 연계 8종"),
 ("설계", "EDIM_클래스정의서.md", "클래스 정의서", "언어 중립 도메인 모델 — 11도메인·인바리언트 대응표"),
 ("설계", "EDIM_권한승인정의서.xlsx", "권한·승인 정의서", "권한 매트릭스(98메뉴)·승인 상태기계 13·Grade"),
 ("설계", "EDIM_개발표준정의서.md", "개발 표준 정의서", "명명·API 규약·FE/BE·Git·테스트·보안·i18n"),

 ("화면·디자인", "EDIM_화면설계서.html", "화면설계서 (와이어프레임)", "24화면 W-01~W-24 + 설계 노트 — /design/ 에서 열람 가능"),
 ("화면·디자인", "EDIM_디자인시안.html", "디자인 시안 A (Modern)", "브랜드 접점용 — /design/hifi/"),
 ("화면·디자인", "EDIM_디자인시안_B_dense.html", "디자인 시안 B (Dense) ★", "레거시 문법 — 업무 화면 권고안 · /design/dense/"),

 ("계획·이행", "04_WBS/EDIM_WBS.xlsx", "WBS·일정표", "38 Task · 44주 간트 · 마일스톤 4 (시작일 가정)"),
 ("계획·이행", "EDIM_데이터이행계획서.md", "데이터 이행 계획서", "이행 대상 9종·5단계·검증 6기준·AI 학습 연계"),

 ("근거 자료", "reference/EDIM Tool System EP2.pptx", "원본 발표자료 (PPTX)", "NOVA Solution · 78슬라이드 — 대용량"),
 ("근거 자료", "reference/EDIM Tool System EP2.pdf", "발표자료 렌더링 (PDF)", "슬라이드 시각 확인용 — 대용량"),
 ("근거 자료", "reference/EDIM_EP2_slide_text.txt", "슬라이드 텍스트 추출", "전 슬라이드 텍스트"),
 ("근거 자료", "reference/EDIM_EP2_speaker_notes.txt", "발표자 노트 추출", "표준 워크플로우 원문 51장"),
]

TYPE_BADGE = {".md": ("MD", "#1F4E8C"), ".xlsx": ("XLSX", "#1E7A4E"), ".html": ("HTML", "#B45309"),
              ".sql": ("SQL", "#6B4FA1"), ".yaml": ("YAML", "#B3372F"), ".pptx": ("PPTX", "#C2410C"),
              ".pdf": ("PDF", "#B3372F"), ".txt": ("TXT", "#5A6270")}


def fsize(n):
    if n >= 1 << 20:
        return f"{n / (1 << 20):.1f} MB"
    return f"{n / 1024:.0f} KB"


def main():
    groups = {}
    total = 0
    for grp, rel, title, desc in FILES:
        p = os.path.join(BASE, rel.replace("/", os.sep))
        if not os.path.exists(p):
            print(f"  !! 누락: {rel}")
            continue
        st = os.stat(p)
        ext = os.path.splitext(rel)[1].lower()
        badge, color = TYPE_BADGE.get(ext, ("FILE", "#5A6270"))
        groups.setdefault(grp, []).append({
            "rel": rel, "title": title, "desc": desc, "badge": badge, "color": color,
            "size": fsize(st.st_size), "big": st.st_size > 5 << 20,
            "date": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d"),
        })
        total += 1

    rows_html = ""
    for grp, items in groups.items():
        rows_html += f'''
    <div class="gb"><div class="gt">{html.escape(grp)}<span class="sp"></span><span class="cnt">{len(items)}건</span></div>
    <table class="g">
      <tr><th style="width:56px">유형</th><th style="width:230px">산출물</th><th>설명</th><th style="width:72px">크기</th><th style="width:86px">수정일</th><th style="width:88px"></th></tr>'''
        for it in items:
            fname = html.escape(os.path.basename(it["rel"]))
            href = "files/" + html.escape(it["rel"].replace(" ", "%20"))
            warn = ' <span class="st warn">대용량</span>' if it["big"] else ""
            rows_html += f'''
      <tr><td class="c"><span class="tb2" style="background:{it["color"]}">{it["badge"]}</span></td>
      <td><b>{html.escape(it["title"])}</b></td>
      <td class="dim2">{html.escape(it["desc"])}{warn}</td>
      <td class="num">{it["size"]}</td><td class="c">{it["date"]}</td>
      <td class="c"><a class="b" href="{href}" download="{fname}">⬇ 다운로드</a></td></tr>'''
        rows_html += "\n    </table></div>\n"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    page = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EDIM 산출물 다운로드</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
<style>
:root{{--chrome:#E9EBEE;--line-strong:#9AA2AF;--line:#C2C8D2;--line-soft:#E1E5EB;--grid-head:#DCE3EE;
--grid-head-txt:#2B3A55;--title-navy:#1F4E8C;--sel:#FFF3C2;--txt:#1E222A;--dim:#5A6270;--mute:#8B93A1;
--warn:#B45309;--warn-bg:#FCF3DF;--btn-face:linear-gradient(180deg,#FDFDFE,#EDF0F4);--btn-border:#A9B0BC}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:Pretendard,'Malgun Gothic',sans-serif;background:#F2F3F6;color:var(--txt);font-size:11.5px}}
.app{{max-width:1180px;margin:26px auto 60px;border:1px solid var(--line-strong);background:var(--chrome);box-shadow:0 3px 14px rgba(20,26,40,.18)}}
.titlebar{{display:flex;align-items:center;gap:8px;background:linear-gradient(180deg,#26406E,#17376B);color:#fff;padding:7px 12px;font-size:12px}}
.titlebar .lg{{width:18px;height:18px;background:#2F9463;border-radius:2px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px}}
.titlebar .sp{{flex:1}}
.titlebar a{{color:#B9C7E2;text-decoration:none;font-size:11px;margin-left:12px}}
.titlebar a:hover{{color:#fff}}
.body2{{background:#fff;padding:12px;display:flex;flex-direction:column;gap:10px}}
.gb{{border:1px solid var(--line);background:#fff}}
.gt{{background:linear-gradient(180deg,#F2F5FA,#E5EAF2);border-bottom:1px solid var(--line);padding:4px 9px;font-size:11.5px;font-weight:700;color:var(--grid-head-txt);display:flex;align-items:center}}
.gt .sp{{flex:1}} .gt .cnt{{font-weight:500;color:var(--mute);font-size:10.5px}}
.g{{width:100%;border-collapse:collapse;font-size:11.5px}}
.g th{{background:var(--grid-head);color:var(--grid-head-txt);font-weight:700;font-size:11px;padding:0 7px;height:24px;border:1px solid var(--line);text-align:center}}
.g td{{padding:2px 7px;height:26px;border:1px solid var(--line-soft)}}
.g tr:nth-child(even) td{{background:#F7F9FC}}
.g tr:hover td{{background:#FDF6DE}}
.g td.c{{text-align:center}} .g td.num{{text-align:right;font-variant-numeric:tabular-nums}}
.g td.dim2{{color:var(--dim)}}
.tb2{{display:inline-block;color:#fff;font-size:9.5px;font-weight:800;padding:1px 7px;border-radius:2px;letter-spacing:.03em}}
.b{{display:inline-flex;align-items:center;gap:4px;height:21px;padding:0 9px;font-size:11px;font-weight:600;color:#333A46;background:var(--btn-face);border:1px solid var(--btn-border);border-radius:2px;text-decoration:none;white-space:nowrap}}
.b:hover{{border-color:#7d8592;background:#fff}}
.st{{font-size:10px;font-weight:700;padding:0 5px;border:1px solid #EBD3A8;border-radius:2px}}
.st.warn{{color:var(--warn);background:var(--warn-bg)}}
.statusbar{{display:flex;align-items:center;background:#EDF0F4;border-top:1px solid var(--line-strong);padding:3px 8px;font-size:10.5px;color:var(--dim)}}
.statusbar .cell{{padding:1px 10px;border-right:1px solid var(--line)}}
.statusbar .grow{{flex:1}}
.note{{font-size:10.5px;color:var(--mute);padding:2px 4px}}
</style>
</head>
<body>
<div class="app">
  <div class="titlebar"><span class="lg">E</span><b>EDIM</b><span style="color:#8FA5CC">산출물 다운로드 — NOVA Solution</span>
    <span class="sp"></span>
    <a href="/design/">화면설계서</a><a href="/design/hifi/">디자인 A</a><a href="/design/dense/">디자인 B ★</a><a href="/">프로토타입 앱</a></div>
  <div class="body2">
    <div class="note">완료 산출물 {total}종 — 문서 체계·재생성 규칙은 「문서 관리 요약(README)」 참조. Excel/OpenAPI는 생성 스크립트가 원본이므로 직접 수정 금지.</div>
{rows_html}
  </div>
  <div class="statusbar"><span class="cell">생성 {now}</span><span class="cell">저장소 fankh/external-projects · edim-ai-blueprint/docs</span><span class="grow"></span><span class="cell">EDIM 문서 포털 v0.1</span></div>
</div>
</body>
</html>
'''
    io = open(OUT, "w", encoding="utf-8")
    io.write(page)
    io.close()
    print(f"saved: {OUT}  ({total}개 파일 링크)")


if __name__ == "__main__":
    main()

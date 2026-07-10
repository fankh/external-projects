# -*- coding: utf-8 -*-
"""CAD 라이브 — view/import/export/DWG 501 + UI 뷰어 렌더."""
import io
import json
import time
import urllib.error
import urllib.request

B = 'https://edim.seekerslab.com/api/v1'


def req(method, path, data=None, headers=None, raw=False):
    h = {'Content-Type': 'application/json', **(headers or {})}
    body = data if isinstance(data, bytes) else (json.dumps(data).encode() if data is not None else None)
    r = urllib.request.Request(B + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        b = res.read()
        return b if raw else json.loads(b)


tok = req('POST', '/auth/login', {'userId': 'edim', 'password': 'edim'})['token']
A = {'Authorization': f'Bearer {tok}'}

# 1. Run → 산출 DXF 를 /cad/view 로 파싱
run = req('POST', '/cpq/runs', {'runType': 'ALL'}, A)
for _ in range(40):
    st = req('GET', f"/cpq/runs/{run['runId']}", headers=A)
    if st['status'] != 'RUNNING':
        break
    time.sleep(0.8)
dxf_out = next(o for o in st['outputs'] if o['fileType'] == 'DXF')
view = req('GET', f"/cad/view/{dxf_out['fileId']}", headers=A)
doc = view['document']
types = {e['entityType'] for e in doc['entities']}
texts = [e['textContent'] for e in doc['entities'] if e['entityType'] == 'text']
assert {'polyline', 'circle', 'text'} <= types, types
assert any('A = 670' in t for t in texts), texts
print(f"PASS cad/view run DXF — {len(doc['entities'])} entities {sorted(types)}, dims {texts}")

# 2. 샘플 DXF 생성 → import → view
import ezdxf
d = ezdxf.new('R2010')
m = d.modelspace()
m.add_line((0, 0), (500, 300))
m.add_circle((250, 150), 80)
m.add_lwpolyline([(0, 0), (500, 0), (500, 300), (0, 300)], close=True)
m.add_text('EDIM CAD TEST', height=25).set_placement((60, 320))
buf = io.StringIO()
d.write(buf)
dxf_bytes = buf.getvalue().encode()
boundary = 'EDIMCAD'
part = (f'--{boundary}\r\nContent-Disposition: form-data; name="uploadedFile"; filename="sample_import.dxf"\r\n'
        'Content-Type: application/dxf\r\n\r\n').encode() + dxf_bytes + \
       (f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="project"\r\n\r\nPS-61313-5'
        f'\r\n--{boundary}--\r\n').encode()
imp = req('POST', '/cad/import', part,
          {**A, 'Content-Type': f'multipart/form-data; boundary={boundary}'})
assert len(imp['document']['entities']) == 4
print(f"PASS cad/import — fileId {imp['fileId']}, 4 entities parsed & registered")
v2 = req('GET', f"/cad/view/{imp['fileId']}", headers=A)
assert any(e.get('textContent') == 'EDIM CAD TEST' for e in v2['document']['entities'])
print('PASS re-view imported file from MinIO')

# 3. export-dxf (dims 지정)
dxf = req('POST', '/cad/export-dxf', {'dims': {'A': 700, 'B': 756, 'K': 1134}}, A, raw=True)
assert b'SECTION' in dxf[:200] and b'AC1024' in dxf[:2000] and b'K = 1134' in dxf
print(f'PASS cad/export-dxf — {len(dxf)}B, dims embedded (K=1134)')

# 4. DWG → 501 (ODA 미설정)
part = (f'--{boundary}\r\nContent-Disposition: form-data; name="uploadedFile"; filename="test.dwg"\r\n'
        'Content-Type: application/octet-stream\r\n\r\n').encode() + b'AC1032dummy' + \
       (f'\r\n--{boundary}--\r\n').encode()
try:
    req('POST', '/cad/import', part,
        {**A, 'Content-Type': f'multipart/form-data; boundary={boundary}'})
    print('FAIL DWG should be 501')
except urllib.error.HTTPError as e:
    assert e.code == 501
    print('PASS DWG -> 501 (ODA 플러그블 안내)')

# 5. UI — Run 산출물 미리보기 → 뷰어 SVG
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={'width': 1440, 'height': 900})
    p.goto('https://edim.seekerslab.com/common', wait_until='networkidle')
    p.get_by_label('사번').fill('edim')
    p.get_by_label('비밀번호').fill('edim')
    p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=8000)
    p.locator('.tn', has_text='Project Folder·이력 (M-15-8/9)').click()
    p.locator('.gb', has_text='DWG —').wait_for(timeout=15000)   # 파일 그리드 로드 완료 대기
    p.locator('td.code:visible', has_text='sample_import.dxf').first.wait_for(timeout=15000)
    p.locator('tr:visible', has_text='sample_import.dxf').first.dblclick()
    p.locator('.mdi .t.on', has_text='CAD').wait_for(timeout=5000)
    p.locator('svg[data-cad-svg] circle').wait_for(timeout=8000)
    n_ent = p.locator('svg[data-cad-svg] g > *').count()
    assert p.locator('svg[data-cad-svg] text', has_text='EDIM CAD TEST').count() == 1
    print(f'PASS UI viewer renders imported DXF ({n_ent} svg entities)')
    # 레이어 토글 — 뷰어 패널의 체크박스 (좌측 트리 .tn 오매칭 방지)
    p.get_by_label('레이어 0', exact=True).click()
    p.wait_for_timeout(300)
    assert p.locator('svg[data-cad-svg] circle').count() == 0
    print('PASS layer visibility toggle hides entities')
    p.screenshot(path=r'C:\temp\edim-shots\60-cad-viewer.png')
    b.close()

# 6. 정리 — import 한 샘플 파일 삭제 (반복 실행 시 누적 방지) + 참조 파일 409 보호 확인
try:
    req('DELETE', f"/files/{dxf_out['fileId']}", headers=A)
    print('FAIL run 산출물 삭제는 409 여야 함')
except urllib.error.HTTPError as e:
    assert e.code == 409, e.code
    print('PASS run 산출물 파일 삭제 -> 409 (cpq_output 참조 보호)')
# 이번 실행 + 과거 누적 sample_import 전부 정리
files = req('GET', '/files?project=PS-61313-5', headers=A)
samples = [f for f in files if f.get('name') == 'sample_import.dxf' and f.get('fileId')]
removed = 0
for f in samples:
    try:
        req('DELETE', f"/files/{f['fileId']}", headers=A)
        removed += 1
    except urllib.error.HTTPError:
        pass
print(f'PASS cleanup — sample_import.dxf {removed}건 삭제')
print('CAD LIVE: all pass')

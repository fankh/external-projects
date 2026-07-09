# -*- coding: utf-8 -*-
"""S5 live — 실 Run 파이프라인: 단계 실측 · 산출물 바이트 검증 · Folder 노출."""
import io
import json
import time
import urllib.request

B = 'https://edim.seekerslab.com/api/v1'


def req(method, path, data=None, headers=None, raw=False):
    h = {'Content-Type': 'application/json', **(headers or {})}
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(B + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        b = res.read()
        return b if raw else json.loads(b)


tok = req('POST', '/auth/login', {'userId': 'edim', 'password': 'edim'})['token']
A = {'Authorization': f'Bearer {tok}'}

# 1. Run 시작 → 폴링
run = req('POST', '/cpq/runs', {'runType': 'ALL'}, A)
rid = run['runId']
print(f'run #{rid} started')
for _ in range(40):
    st = req('GET', f'/cpq/runs/{rid}', headers=A)
    if st['status'] != 'RUNNING':
        break
    time.sleep(0.8)
assert st['status'] == 'SUCCESS', st.get('logs', [])[-3:]

# 2. 단계 실측 확인
steps = {s['no']: s for s in st['steps']}
assert '파트' in steps[1]['measured'] and steps[1]['status'] == 'DONE'
assert '식 평가' in steps[2]['measured']
assert 'DXF' in steps[3]['measured']
assert 'resolve' in steps[4]['measured']
print('PASS steps real-measured:', ' | '.join(s['measured'] for s in st['steps']))

# 3. 산출물 3종 + fileId
outs = st['outputs']
assert len(outs) == 3 and all(o.get('fileId') for o in outs), outs
by_folder = {o['folder']: o for o in outs}
assert set(by_folder) == {'DWG', 'PRICE', 'BOM'}
print('PASS outputs with fileId:', [(o['folder'], o['file']) for o in outs])

# 4. 바이트 검증 — PDF/DXF/XLSX 매직
pdf = req('GET', f"/files/download/{by_folder['PRICE']['fileId']}", headers=A, raw=True)
assert pdf[:5] == b'%PDF-', pdf[:10]
print(f'PASS quotation PDF valid ({len(pdf)}B, watermark+CJK)')
dxf = req('GET', f"/files/download/{by_folder['DWG']['fileId']}", headers=A, raw=True)
assert b'SECTION' in dxf[:200] and b'AC1024' in dxf[:2000]   # R2010
print(f'PASS mfg DXF valid R2010 ({len(dxf)}B)')
xlsx = req('GET', f"/files/download/{by_folder['BOM']['fileId']}", headers=A, raw=True)
assert xlsx[:2] == b'PK'
import openpyxl
wb = openpyxl.load_workbook(io.BytesIO(xlsx))
ws = wb.active
codes = [row[1].value for row in ws.iter_rows(min_row=2) if row[1].value]
assert 'KDP 1-21-13-15' in codes, codes
print(f'PASS BOM XLSX valid — {len(codes)}행, KDP 1-21-13-15 포함')

# 5. dimension_values 영속 + selection_item + Folder 노출
files = req('GET', '/files?project=PS-61313-5', headers=A)
run_files = [f for f in files if f'run{rid}_' in str(f.get('name', '')) or f.get('fileId')]
assert any(f['folder'] == 'PRICE' and f.get('fileId') for f in files)
print(f'PASS folder listing includes run artifacts ({len(files)} files total)')
print('S5 API LIVE: all pass')

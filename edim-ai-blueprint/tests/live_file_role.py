# -*- coding: utf-8 -*-
"""PLM Code Drawing vs Project Output 이원화 라이브 (3.3) — 요구 #53 핵심 불변식.

배경(실증된 결함): dwg_file 한 테이블에 작도 원본과 Run 산출물이 섞여 있었고,
  ① part-drawing/save·duct-layout/save 가 **테넌트 전체에서 file_name 만 맞으면 행을 갱신**해
     같은 이름의 과거 Run 산출물 행이 새 파일로 갈아끼워졌다(납품물이 조용히 바뀜)
  ② /cad/view/{id}/edit 이 어떤 file_id 든 MinIO 객체를 제자리에서 덮어썼다
둘 다 요구 #55 '과거 산출물 불변' 위반. file_role 로 역할을 나누고 OUTPUT 을 불변으로 만든다.

검증: 역할 부여 → 산출물 이름으로 저장해도 산출물 행 불변(별도 SOURCE 행 생성)
     → 산출물 편집 409 → 원본은 두 번 저장하면 같은 행 갱신 → 목록에 역할 노출.
정리: 생성한 SOURCE 파일 삭제 · 프로브 산출물 행 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
PROJ = "PS-61313-5"
OUTNAME = "ZZROLE_out.dxf"     # 산출물(OUTPUT) 역할로 심는 프로브 행
SRCNAME = "ZZROLE_src.dxf"     # 작도 원본(SOURCE)
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql(f"DELETE FROM dwg_file WHERE file_name IN ('{OUTNAME}','{SRCNAME}')")


TOK = login("edim", "edim")
cleanup()

try:
    # ── 1) 마이그레이션·백필 ──
    ok("alembic 0036 적용 (dwg_file.file_role)",
       psql("SELECT count(*) FROM information_schema.columns WHERE table_name='dwg_file' "
            "AND column_name='file_role'") == "1")
    dist = psql("SELECT string_agg(file_role||'='||c, ' ' ORDER BY file_role) FROM "
                "(SELECT file_role, count(*) c FROM dwg_file GROUP BY file_role) x")
    ok(f"역할 백필 분포 — {dist}", "OUTPUT=" in dist and "SOURCE=" in dist)
    ok("Run 산출물은 전부 OUTPUT",
       psql("SELECT count(*) FROM dwg_file f JOIN cpq_output o ON o.file_id=f.file_id "
            "WHERE COALESCE(f.file_role,'x')<>'OUTPUT'") == "0")
    ok("접수 자료는 RECEIVED",
       psql("SELECT count(*) FROM dwg_file WHERE folder='RECEIVED' AND file_role<>'RECEIVED'") == "0")

    # ── 2) 산출물 프로브 행 심기 (실제 납품물을 건드리지 않기 위해 자체 생성) ──
    psql(f"INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type, file_path, "
         f"file_size, file_role) SELECT p.tenant_id, p.project_id, 'DWG', '{OUTNAME}', 'DXF', "
         f"'{PROJ}/DWG/run999_{OUTNAME}', 4242, 'OUTPUT' FROM prj_project p "
         f"WHERE p.project_no='{PROJ}' LIMIT 1")
    out_id = psql(f"SELECT file_id FROM dwg_file WHERE file_name='{OUTNAME}'").splitlines()[0]
    before = psql(f"SELECT file_path||'|'||file_size FROM dwg_file WHERE file_id={out_id}")
    ok(f"프로브 산출물 행 생성 (#{out_id})", before.endswith("|4242"))

    # ── 3) 산출물과 같은 이름으로 저장 — 산출물은 불변, 별도 SOURCE 행이 생겨야 한다 ──
    st, saved = req("POST", "/cad/part-drawing/save", TOK,
                    {"name": OUTNAME, "project": PROJ, "dims": {"A": 700.0, "B": 756.0}})
    ok(f"동명 저장 자체는 성공 ({st})", st == 200)
    after = psql(f"SELECT file_path||'|'||file_size FROM dwg_file WHERE file_id={out_id}")
    ok("★ 산출물 행 불변 (경로·크기 그대로)", after == before)
    ok("★ 새 행은 별도 SOURCE 로 생성",
       saved["fileId"] != int(out_id)
       and psql(f"SELECT file_role FROM dwg_file WHERE file_id={saved['fileId']}") == "SOURCE")
    new_src = saved["fileId"]

    # ── 4) 산출물 편집 차단 ──
    st, b = req("POST", f"/cad/view/{out_id}/edit", TOK,
                {"ops": [{"entityId": "e1", "op": "delete"}]})
    ok(f"★ 산출물 편집 409 ({st})", st == 409 and "산출물" in (b or {}).get("detail", ""))
    st2, _ = req("POST", f"/cad/view/{new_src}/edit", TOK, {"ops": []})
    ok(f"작도 원본 편집은 409 아님 ({st2})", st2 != 409)

    # ── 5) 원본 재저장은 같은 행 갱신 (작도 워크플로 보존) ──
    st, s1 = req("POST", "/cad/part-drawing/save", TOK,
                 {"name": SRCNAME, "project": PROJ, "dims": {"A": 700.0, "B": 756.0}})
    st, s2 = req("POST", "/cad/part-drawing/save", TOK,
                 {"name": SRCNAME, "project": PROJ, "dims": {"A": 710.0, "B": 760.0}})
    ok("작도 원본 재저장 = 같은 행 갱신", s1["fileId"] == s2["fileId"])
    ok("원본 행 역할 SOURCE",
       psql(f"SELECT file_role FROM dwg_file WHERE file_id={s1['fileId']}") == "SOURCE")

    # ── 6) 목록에 역할 노출 ──
    st, files = req("GET", f"/files?project={PROJ}", TOK)
    outs = [f for f in files if f.get("fileRole") == "OUTPUT"]
    srcs = [f for f in files if f.get("fileRole") == "SOURCE"]
    ok(f"Folder 목록에 역할 노출 (산출물 {len(outs)} · 원본 {len(srcs)})", outs and srcs)
    ok("산출물은 immutable 표기", all(f["immutable"] is True for f in outs))
    ok("원본은 immutable 아님", all(f["immutable"] is False for f in srcs))

    # ── 7) 정리 겸 삭제 가드 ──
    st, _ = req("DELETE", f"/files/{new_src}", TOK)
    ok(f"작도 원본 삭제 200 ({st})", st == 200)
    st, _ = req("DELETE", f"/files/{s1['fileId']}", TOK)
    ok(f"두 번째 원본 삭제 200 ({st})", st == 200)
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM dwg_file WHERE file_name IN ('{OUTNAME}','{SRCNAME}')")
    print(f"정리 — 프로브 파일 잔존 {left}")

print(f"\nlive_file_role: {n}/{n} PASS")

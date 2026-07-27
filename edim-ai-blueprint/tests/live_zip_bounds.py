# -*- coding: utf-8 -*-
"""파일 묶음(ZIP)의 상한과 누락 고지 (18.76).

배경: API 표면 커버리지 실측에서 `/files/zip` 이 **한 번도 호출된 적 없는** 경로로 잡혔다.
같은 목록에서 고른 경로가 실제로 결함을 갖고 있던 전례가 두 번 있어(18.36 검증이 사실상
항상 합격 · 18.39 도면이 조용히 잘림) 직접 두드렸더니 두 가지가 나왔다.

  · **상한이 없다** — 운영 실측으로 프로젝트 하나가 4,990건·79MB 다. 그것을 메모리에서
    통째로 압축하고 객체 5천 개를 순차로 받는다. 폴더 하나만 받아도 8MB 였다.
  · **못 받은 객체를 조용히 건너뛴다** — 코드 주석에는 '부분 다운로드' 라 적혀 있지만
    받는 사람에게는 아무것도 알리지 않는다. 파일이 빠진 줄 모르고 납품·보관하게 된다.

판단: 잘라 주지 않고 **거부한다**(18.39 와 같은 판단). 잘린 ZIP 은 열어 봐도 무엇이
빠졌는지 알 수 없어 완성본으로 오인된다. 누락은 헤더(`X-Missing`)와 **묶음 안 메모**에
함께 적는다 — 헤더는 나중에 파일만 열어 보는 사람에게 닿지 않는다.

밟는 것: 상한 초과 거부(사유에 실제 건수) · 작은 폴더는 정상 · 누락 객체가 있으면 개수와
목록이 드러나는가 · 고객 전달본도 같은 상한을 따르는가.

정리: 누락 실증용으로 넣은 dwg_file 행을 지운다(저장소 객체는 애초에 만들지 않는다).

실행: PYTHONUTF8=1 py tests/live_zip_bounds.py
"""
import io
import subprocess
import zipfile

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
PROJ = "PS-61313-5"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=40)
    return (r.stdout or "").strip()


def cleanup():
    psql("DELETE FROM sys_history WHERE target_table='dwg_file' AND target_id IN "
         "(SELECT file_id FROM dwg_file WHERE file_name LIKE 'ZZZIP%')")
    psql("DELETE FROM dwg_file WHERE file_name LIKE 'ZZZIP%'")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login",
                    data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})
    tid = int(psql("SELECT tenant_id FROM sys_user WHERE login_id='edim'"))

    cleanup()
    try:
        # ── 프로젝트 전체는 상한을 넘으므로 거부 ──
        r = req.get(f"{API}/files/zip", params={"project": PROJ})
        ok(f"전체 묶음 413 ({r.status})", r.status == 413)
        body = r.text()
        ok("사유에 실제 건수·상한", "건" in body and "상한" in body and "folder" in body)

        # ── 작은 폴더는 정상 묶음 ──
        r = req.get(f"{API}/files/zip", params={"project": PROJ, "folder": "DATA"})
        ok(f"DATA 폴더 200 ({r.status})", r.status == 200)
        ok(f"파일 수 헤더 ({r.headers.get('x-file-count')})",
           int(r.headers.get("x-file-count", "0")) >= 1)
        ok(f"누락 0 고지 ({r.headers.get('x-missing')})", r.headers.get("x-missing") == "0")
        zf = zipfile.ZipFile(io.BytesIO(r.body()))
        ok(f"실제 ZIP 이고 항목이 있다 ({len(zf.namelist())}개)", len(zf.namelist()) >= 1)
        ok("정상 묶음에는 누락 메모가 없다", "_누락파일.txt" not in zf.namelist())

        # ── 저장소에 없는 객체를 가리키는 행 → 개수와 목록이 드러나야 한다 ──
        psql("INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type, "
             f"file_path, file_size, file_role) SELECT {tid}, project_id, 'DATA', "
             "'ZZZIP_ghost.txt','TXT','t9999/없는객체/ZZZIP_ghost.txt',3,'SOURCE' "
             f"FROM prj_project WHERE tenant_id={tid} AND project_no='{PROJ}'")
        r = req.get(f"{API}/files/zip", params={"project": PROJ, "folder": "DATA"})
        ok(f"누락이 있어도 묶음은 나온다 ({r.status})", r.status == 200)
        ok(f"누락 개수를 헤더로 알린다 ({r.headers.get('x-missing')})",
           r.headers.get("x-missing") == "1")
        zf = zipfile.ZipFile(io.BytesIO(r.body()))
        ok("묶음 안에도 누락 메모가 들어간다", "_누락파일.txt" in zf.namelist())
        note = zf.read("_누락파일.txt").decode("utf-8")
        ok("메모에 빠진 파일 이름이 있다", "ZZZIP_ghost.txt" in note)
        ok(f"파일 수 헤더는 실제로 담긴 수 ({r.headers.get('x-file-count')})",
           int(r.headers.get("x-file-count")) == len(zf.namelist()) - 1)

        # ── 고객 전달본: 상한 안에 들어오되, 그것은 **담는 내용이 맞기 때문**이다 (18.77) ──
        # 종전에는 Run 마다 쌓인 산출물을 전부 담아 4,987건이었다(같은 견적서·도면이 Run
        # 수만큼 중복). 고객에게 보내는 것은 '지금 산출물' 이지 '실행 이력 전부' 가 아니다.
        r = req.get(f"{API}/files/export-package", params={"project": PROJ})
        ok(f"고객 전달본 200 ({r.status})", r.status == 200)
        cnt = int(r.headers.get("x-file-count", "0"))
        ok(f"전달본이 최신 Run 분량이다 ({cnt}건 · 상한 1,000 이내)", 0 < cnt <= 1000)
        pz = zipfile.ZipFile(io.BytesIO(r.body()))
        ok("전달목록 매니페스트 포함", "전달목록.txt" in pz.namelist())
        man = pz.read("전달목록.txt").decode("utf-8")
        ok("매니페스트가 최신 Run 임을 밝힌다", "최신 Run" in man and "이전 Run" in man)
        # 전달 대상 폴더의 **전체** 파일 수와 비교한다 — '전부 담기' 로 되돌아가면 여기서 깨진다.
        allrows = int(psql("SELECT count(*) FROM dwg_file f JOIN prj_project p "
                           f"ON p.project_id=f.project_id WHERE f.tenant_id={tid} "
                           f"AND p.project_no='{PROJ}' AND f.folder IN ('DWG','PRICE','DATA','BOM')"))
        ok(f"전부 담지 않는다 (전달 {cnt}건 < 전체 {allrows}건)", cnt < allrows)
        # OUTPUT 은 한 Run 것만이어야 한다 — 저장 경로의 run{id} 로 확인한다.
        runs = set(psql("SELECT DISTINCT substring(f.file_path from 'run([0-9]+)_') "
                        "FROM dwg_file f JOIN prj_project p ON p.project_id=f.project_id "
                        f"WHERE f.tenant_id={tid} AND p.project_no='{PROJ}' "
                        "AND COALESCE(f.file_role,'OUTPUT')='OUTPUT' "
                        "AND f.folder IN ('DWG','PRICE','DATA','BOM') "
                        "AND f.file_id IN (SELECT o.file_id FROM cpq_output o JOIN cpq_run r "
                        "ON r.run_id=o.run_id JOIN cpq_selection s ON s.selection_id=r.selection_id "
                        f"WHERE r.tenant_id={tid} AND r.status='SUCCESS' AND r.run_id=("
                        "SELECT max(r2.run_id) FROM cpq_run r2 JOIN cpq_selection s2 "
                        f"ON s2.selection_id=r2.selection_id WHERE r2.tenant_id={tid} "
                        "AND r2.status='SUCCESS' AND s2.project_id=p.project_id))").split())
        ok(f"산출물은 한 Run 것만 ({runs or '없음'})", len(runs) <= 1)
        # ── 화면까지 사유가 닿는가 (18.79) ──
        # 프록시가 백엔드 detail 을 버리고 `HTTP 413` 만 남기면, '폴더로 나눠 받으라' 는
        # 안내가 사용자에게 도달하지 않는다. 새 탭 원시 JSON 대신 화면에 적히는지 본다.
        br = pw.chromium.launch()
        try:
            pg = br.new_page()
            pg.goto(f"{BASE}/login", wait_until="domcontentloaded")
            pg.fill("input[name='userId']", "edim"); pg.fill("input[name='password']", "edim")
            pg.click("button[type='submit']"); pg.wait_for_load_state("networkidle")
            pg.goto(f"{BASE}/common/folder?project={PROJ}", wait_until="networkidle")
            pg.locator("[data-zip-all]").click()
            pg.wait_for_selector("[data-dl-err]", timeout=60000)
            msg = pg.locator("[data-dl-err]").inner_text()
            ok(f"상한 사유가 화면에 표시된다 ({msg[:40]}…)",
               "상한" in msg and "folder" in msg and "HTTP" not in msg)
            pg.reload(wait_until="networkidle")
            with pg.expect_download(timeout=120000) as dl:
                pg.locator("[data-export-package]").click()
            ok(f"전달 패키지는 정상 다운로드 ({dl.value.suggested_filename})",
               dl.value.suggested_filename.endswith(".zip"))
        finally:
            br.close()
    finally:
        cleanup()
        print("정리 — ZZZIP 행 삭제", flush=True)

print(f"\nOK — 묶음 상한·누락 고지 {n}개 검증 통과")

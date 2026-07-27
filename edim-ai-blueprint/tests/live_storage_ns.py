# -*- coding: utf-8 -*-
"""저장소 키의 테넌트 이름 공간 (18.57) — 교차 테넌트 덮어쓰기 차단.

배경: 파일 경로 조작을 훑다가 `download_file` 은 DB 의 file_path 를 쓰므로 안전한데,
**업로드 키에 테넌트가 없다**는 것을 봤다. `{project}/{folder}/{name}` 인데 프로젝트
번호는 `UNIQUE (tenant_id, project_no)` 라 **두 테넌트가 같은 번호를 가질 수 있고**,
실제로 `PS-61313-5` 를 양쪽이 갖고 있다(테넌트1 3건·테넌트2 4,760건).

같은 이름으로 올리면 뒤에 올린 쪽이 앞 테넌트의 객체를 덮어쓰고, 앞 테넌트의 행은 그대로
그 키를 가리켜 **남의 바이트를 내려받는다**. 업로드 가드(#53)는 `tenant_id` 조건으로
조회하므로 — 그 목적엔 맞지만 — 남의 테넌트 객체는 보지 못한다.

지금까지 충돌이 없었던 건 통제가 아니라 우연이다: 테넌트1 의 3건은 예전 시드가 붙인
`/edim/` 접두사를 갖고 있어 이름 공간이 갈라져 있었다. 새로 올리는 순간 겹친다.

밟는 것: 새 키가 `t{tid}/` 로 시작하는가 · 올린 파일이 그대로 내려오는가 · 재업로드가
행을 가르지 않는가 · **옛 경로 행은 경로를 유지**하는가(경로가 바뀌면 행이 갈라진다) ·
옛 경로의 Run 산출물을 덮어쓰려는 업로드를 #53 가드가 여전히 막는가 ·
GC 가 남의 테넌트 접두사 객체를 대상에서 빼는가(18.63 — 수정 전엔 orphan 으로 잡아 지웠다) ·
없는 프로젝트 번호를 **조용한 고아 대신 422** 로 거부하는가(18.58 — 종전엔 project_id 를
NULL 로 넣고 201 을 돌려줬다) · 그리고 DB 불변식: **어떤 file_path 도 두 테넌트에 걸쳐
있지 않다 · project_id NULL 행이 없다**.

주의: 교차 테넌트 쓰기 자체는 한 계정으로 실증할 수 없다. 여기서 세우는 것은 "키가
테넌트로 갈린다"는 성질과 위 불변식이며, 그 이상을 주장하지 않는다(17.8 교훈).

정리: 만든 파일 행·객체와 옛 경로 픽스처를 모두 지운다.

실행: PYTHONUTF8=1 py tests/live_storage_ns.py
"""
import json
import subprocess

from playwright.sync_api import sync_playwright

API = "https://edim.seekerslab.com/api/v1"
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
    return r.stdout.strip()


def docker(code):
    """백엔드 컨테이너 안에서 실행 — 다른 테넌트 접두사 객체는 API 로 만들 수 없다."""
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-backend python -c \"{code}\""],
                       capture_output=True, text=True, timeout=60)
    return r.stdout.strip()


FOLDER = "RECEIVED"   # 업로드 폴더는 화이트리스트다 — 임의 폴더를 못 만든다
LEGACY = f"{PROJ}/{FOLDER}/ZZNS_legacy.txt"
LEGACY_OUT = f"{PROJ}/{FOLDER}/ZZNS_output.txt"


def cleanup():
    psql("DELETE FROM sys_history WHERE target_table='dwg_file' AND target_id IN "
         "(SELECT file_id FROM dwg_file WHERE file_name LIKE 'ZZNS%')")
    psql("DELETE FROM dwg_file WHERE file_name LIKE 'ZZNS%'")
    docker("from app.services import storage; "
           "storage.remove_object('t9999/zz_gc_probe.txt') "
           "if 't9999/zz_gc_probe.txt' in storage.list_object_keys('t9999/') else None")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login",
                    data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})
    tid = int(psql("SELECT tenant_id FROM sys_user WHERE login_id='edim'"))

    def up(name, body, folder=FOLDER):
        return req.post(f"{API}/files/upload", multipart={
            "project": PROJ, "folder": folder,
            "uploadedFile": {"name": name, "mimeType": "text/plain", "buffer": body}})

    cleanup()
    try:
        # ── 새 업로드는 테넌트 이름 공간으로 ──
        r = up("ZZNS_a.txt", b"alpha-1")
        ok(f"업로드 201/200 ({r.status})", r.status in (200, 201))
        body = r.json()
        key, fid = body["key"], body["fileId"]
        ok(f"키가 테넌트로 갈린다 ({key})", key == f"t{tid}/{PROJ}/{FOLDER}/ZZNS_a.txt")

        # ── 올린 바이트가 그대로 내려온다 ──
        d = req.get(f"{API}/files/download/{fid}")
        ok(f"다운로드 200 ({d.status})", d.status == 200)
        ok("내용 일치", d.body() == b"alpha-1")

        # ── 재업로드는 행을 가르지 않는다 ──
        r2 = up("ZZNS_a.txt", b"alpha-2")
        ok(f"재업로드 replaced ({r2.status})", r2.status in (200, 201)
           and r2.json().get("replaced") is True)
        ok("같은 행 유지", r2.json()["fileId"] == fid)
        cnt = psql(f"SELECT count(*) FROM dwg_file WHERE tenant_id={tid} "
                   f"AND folder='{FOLDER}' AND file_name='ZZNS_a.txt'")
        ok(f"행 1개 ({cnt})", cnt == "1")
        ok("내용 갱신", req.get(f"{API}/files/download/{fid}").body() == b"alpha-2")

        # ── 옛 경로 행은 경로를 유지한다(마이그레이션 없이 호환) ──
        psql("INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type, "
             f"file_path, file_size, file_role) SELECT {tid}, project_id, '{FOLDER}', "
             f"'ZZNS_legacy.txt','TXT','{LEGACY}',3,'SOURCE' FROM prj_project "
             f"WHERE tenant_id={tid} AND project_no='{PROJ}'")
        r3 = up("ZZNS_legacy.txt", b"legacy-new")
        ok(f"옛 경로 재업로드 replaced ({r3.status})", r3.json().get("replaced") is True)
        ok(f"경로 유지 ({r3.json()['key']})", r3.json()["key"] == LEGACY)
        cnt = psql(f"SELECT count(*) FROM dwg_file WHERE tenant_id={tid} "
                   f"AND folder='{FOLDER}' AND file_name='ZZNS_legacy.txt'")
        ok(f"행이 갈라지지 않는다 ({cnt})", cnt == "1")

        # ── 옛 경로의 Run 산출물도 여전히 보호된다 (#53) ──
        psql("INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type, "
             f"file_path, file_size, file_role) SELECT {tid}, project_id, '{FOLDER}', "
             f"'ZZNS_output.txt','TXT','{LEGACY_OUT}',3,'OUTPUT' FROM prj_project "
             f"WHERE tenant_id={tid} AND project_no='{PROJ}'")
        r4 = up("ZZNS_output.txt", b"overwrite-attempt")
        ok(f"산출물 덮어쓰기 409 ({r4.status})", r4.status == 409)
        ok("사유에 납품물 불변", "납품물" in json.dumps(r4.json(), ensure_ascii=False))

        # ── 없는 프로젝트는 조용한 고아 대신 422 (18.58) ──
        # 종전엔 project_id 를 NULL 로 넣고 201 을 돌려줬다. 올린 사람은 성공을 보지만
        # 파일은 어느 프로젝트 폴더에도 없다 — 오타 한 글자에 파일을 잃는다.
        bad = req.post(f"{API}/files/upload", multipart={
            "project": "ZZ-없는프로젝트", "folder": FOLDER,
            "uploadedFile": {"name": "ZZNS_orphan.txt", "mimeType": "text/plain",
                             "buffer": b"orphan"}})
        ok(f"없는 프로젝트 업로드 422 ({bad.status})", bad.status == 422)
        ok("사유가 프로젝트를 가리킨다", "프로젝트" in bad.text())
        cnt = psql("SELECT count(*) FROM dwg_file WHERE file_name='ZZNS_orphan.txt'")
        ok(f"행이 남지 않는다 ({cnt})", cnt == "0")
        d2 = req.post(f"{API}/cad/duct-layout/save",
                      data={"project": "ZZ-없는프로젝트", "floor": "3F", "diffusers": 2})
        ok(f"도면 저장도 422 ({d2.status})", d2.status == 422)
        nul = psql("SELECT count(*) FROM dwg_file WHERE project_id IS NULL")
        ok(f"project_id NULL 행 0건 ({nul})", nul == "0")

        # ── Project Folder 가 프로젝트를 실제로 가른다 (18.59) ──
        # 종전엔 Run 산출물 구간이 project 인자를 쓰지 않아 **어느 프로젝트를 열든** 테넌트의
        # 최신 Run 산출물이 나왔다 — 없는 번호에도. 다른 프로젝트의 견적서가 남의 폴더에
        # 산출물로 보이는 상태였다.
        def files_of(p):
            r = req.get(f"{API}/files", params={"project": p})
            return r.status, (r.json() if r.status == 200 else [])

        # 18.82 이후 업로드 행에도 `run` 이 실린다(그 파일이 어느 Run 산출물인지). 그래서
        # 'Run 산출물 구간' 은 **fileId 가 없는 행**(cpq_output 유래)으로 가른다 — 종전처럼
        # `run != '-'` 로 세면 업로드까지 섞여 판정이 어긋난다.
        def run_section(lst):
            return [f for f in lst if f.get("fileId") is None]

        st, own = files_of(PROJ)
        ok(f"자기 프로젝트 200 ({st})", st == 200)
        ok(f"Run 산출물이 보인다 ({len(run_section(own))}건)", run_section(own))
        for other in ("PS-612", "PS-598"):
            st, lst = files_of(other)
            runs = run_section(lst)
            ok(f"{other} 200 ({st})", st == 200)
            # 이 프로젝트에 SUCCESS Run 이 없으면 산출물도 없어야 한다
            has_run = psql("SELECT count(*) FROM cpq_run r JOIN cpq_selection s "
                           "ON s.selection_id=r.selection_id JOIN prj_project p "
                           f"ON p.project_id=s.project_id WHERE r.tenant_id={tid} "
                           f"AND r.status='SUCCESS' AND p.project_no='{other}'")
            ok(f"{other} 산출물 {len(runs)}건 = Run {has_run}건과 일치",
               (len(runs) > 0) == (has_run != "0"))
            uploaded = psql("SELECT count(*) FROM dwg_file f JOIN prj_project p "
                            f"ON p.project_id=f.project_id WHERE f.tenant_id={tid} "
                            f"AND p.project_no='{other}'")
            ok(f"{other} 업로드 {len(lst) - len(runs)}건 = DB {uploaded}건",
               str(len(lst) - len(runs)) == uploaded)
        st, _ = files_of("ZZ-없는프로젝트")
        ok(f"없는 프로젝트 목록 422 ({st})", st == 422)

        # ── 목록 상한과 '현재 Run' 구분 (18.82) ──
        # Run 마다 산출물이 쌓여 목록이 계속 자란다(운영 실측 5,156행). 상한 없이 내려보내면
        # 조회가 점점 무거워지고, 지난 Run 산출물이 현재 납품물과 같은 얼굴로 섞인다.
        rr = req.get(f"{API}/files", params={"project": PROJ})
        ok(f"절단 여부를 헤더로 알린다 ({rr.headers.get('x-truncated')}/{rr.headers.get('x-limit')})",
           rr.headers.get("x-truncated") in ("true", "false") and rr.headers.get("x-limit"))
        cap = int(rr.headers.get("x-limit"))
        lst = rr.json()
        uploads = [f for f in lst if f.get("fileId") is not None]
        ok(f"업로드 구간이 상한 이내 ({len(uploads)} ≤ {cap})", len(uploads) <= cap)
        basis = psql("SELECT COALESCE(max(r.run_id)::text,'') FROM cpq_run r "
                     "JOIN cpq_selection s ON s.selection_id=r.selection_id "
                     "JOIN prj_project p ON p.project_id=s.project_id "
                     f"WHERE r.tenant_id={tid} AND r.status='SUCCESS' AND NOT r.is_test "
                     f"AND p.project_no='{PROJ}'")
        cur_rows = [f for f in uploads if f.get("currentRun")]
        ok(f"현재 Run 산출물이 표시된다 ({len(cur_rows)}건 · 기준 #{basis})",
           all(f.get("run") == f"#{basis}" for f in cur_rows))
        ok("지난 Run 산출물은 현재로 표시되지 않는다",
           all(not f.get("currentRun") for f in uploads
               if f.get("run") not in ("-", f"#{basis}")))

        # ── 뺀 사실이 화면까지 닿는가 (18.84) ──
        # 헤더로만 알리면 사용자에게 도달하지 않는다(18.79 에서 같은 실수를 다운로드 경로에서
        # 확인했다). 숨긴 건수와 전환 링크가 실제로 보이는지 브라우저로 본다.
        br = pw.chromium.launch()
        try:
            pg = br.new_page()
            pg.goto("https://edim.seekerslab.com/login", wait_until="domcontentloaded")
            pg.fill("input[name='userId']", "edim"); pg.fill("input[name='password']", "edim")
            pg.click("button[type='submit']"); pg.wait_for_load_state("networkidle")
            pg.goto(f"https://edim.seekerslab.com/common/folder?project={PROJ}",
                    wait_until="networkidle")
            main = pg.query_selector("main").inner_text()
            ok("숨긴 건수를 화면에 적는다", "지난 Run 산출물 숨김" in main)
            ok("전체 Run 으로 전환할 수 있다", "전체 Run 보기" in main)
            pg.goto(f"https://edim.seekerslab.com/common/folder?project={PROJ}&allRuns=1",
                    wait_until="networkidle")
            main2 = pg.query_selector("main").inner_text()
            ok("전체 보기에서 절단을 알린다", "표시 상한 도달" in main2)
            ok("현재 Run 으로 되돌아갈 수 있다", "현재 Run 만" in main2)
        finally:
            br.close()

        # ── GC 가 남의 테넌트 객체를 지우지 않는다 (18.63) ──
        # GC 는 테넌트 ADMIN 권한인데 버킷은 공유다. 수정 전 실측: `t9999/` 접두사 객체를
        # orphan 1건으로 잡아 apply=true 면 지웠다(다른 테넌트의 파일이 사라진다).
        docker("from app.services import storage; "
               "storage.put_object('t9999/zz_gc_probe.txt', b'probe', 'text/plain')")
        g = req.post(f"{API}/files/gc", data={"apply": False, "prefix": "t9999/"})
        ok(f"GC dry-run 200 ({g.status})", g.status == 200)
        gj = g.json()
        ok(f"남의 접두사는 대상 아님 (orphans {gj['orphans']})", gj["orphans"] == 0)
        ok(f"건너뛴 건수를 드러낸다 (foreignSkipped {gj.get('foreignSkipped')})",
           gj.get("foreignSkipped") == 1)
        ok("목록에도 없다", not any(k.startswith("t9999/") for k in gj["sampleOrphans"]))
        docker("from app.services import storage; "
               "storage.remove_object('t9999/zz_gc_probe.txt')")

        # ── 불변식: 어떤 경로도 두 테넌트에 걸치지 않는다 ──
        shared = psql("SELECT count(*) FROM (SELECT file_path FROM dwg_file "
                      "WHERE file_path IS NOT NULL GROUP BY file_path "
                      "HAVING count(DISTINCT tenant_id) > 1) s")
        ok(f"테넌트 간 공유 경로 0건 ({shared})", shared == "0")
    finally:
        cleanup()

print(f"\nOK — 저장소 이름 공간 {n}개 검증 통과")

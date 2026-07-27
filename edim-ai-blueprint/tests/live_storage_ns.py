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
그리고 DB 불변식: **어떤 file_path 도 두 테넌트에 걸쳐 있지 않다**.

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


LEGACY = f"{PROJ}/ZZNS/legacy.txt"
LEGACY_OUT = f"{PROJ}/ZZNS/output.txt"


def cleanup():
    psql("DELETE FROM sys_history WHERE target_table='dwg_file' AND target_id IN "
         "(SELECT file_id FROM dwg_file WHERE folder='ZZNS')")
    psql("DELETE FROM dwg_file WHERE folder='ZZNS'")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login",
                    data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})
    tid = int(psql("SELECT tenant_id FROM sys_user WHERE login_id='edim'"))

    def up(name, body, folder="ZZNS"):
        return req.post(f"{API}/files/upload", multipart={
            "project": PROJ, "folder": folder,
            "uploadedFile": {"name": name, "mimeType": "text/plain", "buffer": body}})

    cleanup()
    try:
        # ── 새 업로드는 테넌트 이름 공간으로 ──
        r = up("ns_a.txt", b"alpha-1")
        ok(f"업로드 201/200 ({r.status})", r.status in (200, 201))
        body = r.json()
        key, fid = body["key"], body["fileId"]
        ok(f"키가 테넌트로 갈린다 ({key})", key == f"t{tid}/{PROJ}/ZZNS/ns_a.txt")

        # ── 올린 바이트가 그대로 내려온다 ──
        d = req.get(f"{API}/files/download/{fid}")
        ok(f"다운로드 200 ({d.status})", d.status == 200)
        ok("내용 일치", d.body() == b"alpha-1")

        # ── 재업로드는 행을 가르지 않는다 ──
        r2 = up("ns_a.txt", b"alpha-2")
        ok(f"재업로드 replaced ({r2.status})", r2.status in (200, 201)
           and r2.json().get("replaced") is True)
        ok("같은 행 유지", r2.json()["fileId"] == fid)
        cnt = psql(f"SELECT count(*) FROM dwg_file WHERE tenant_id={tid} "
                   f"AND folder='ZZNS' AND file_name='ns_a.txt'")
        ok(f"행 1개 ({cnt})", cnt == "1")
        ok("내용 갱신", req.get(f"{API}/files/download/{fid}").body() == b"alpha-2")

        # ── 옛 경로 행은 경로를 유지한다(마이그레이션 없이 호환) ──
        psql("INSERT INTO dwg_file (tenant_id, folder, file_name, file_type, file_path, "
             f"file_size, file_role) VALUES ({tid},'ZZNS','legacy.txt','TXT','{LEGACY}',3,'SOURCE')")
        r3 = up("legacy.txt", b"legacy-new")
        ok(f"옛 경로 재업로드 replaced ({r3.status})", r3.json().get("replaced") is True)
        ok(f"경로 유지 ({r3.json()['key']})", r3.json()["key"] == LEGACY)
        cnt = psql(f"SELECT count(*) FROM dwg_file WHERE tenant_id={tid} "
                   f"AND folder='ZZNS' AND file_name='legacy.txt'")
        ok(f"행이 갈라지지 않는다 ({cnt})", cnt == "1")

        # ── 옛 경로의 Run 산출물도 여전히 보호된다 (#53) ──
        psql("INSERT INTO dwg_file (tenant_id, folder, file_name, file_type, file_path, "
             f"file_size, file_role) VALUES ({tid},'ZZNS','output.txt','TXT','{LEGACY_OUT}',3,'OUTPUT')")
        r4 = up("output.txt", b"overwrite-attempt")
        ok(f"산출물 덮어쓰기 409 ({r4.status})", r4.status == 409)
        ok("사유에 납품물 불변", "납품물" in json.dumps(r4.json(), ensure_ascii=False))

        # ── 불변식: 어떤 경로도 두 테넌트에 걸치지 않는다 ──
        shared = psql("SELECT count(*) FROM (SELECT file_path FROM dwg_file "
                      "WHERE file_path IS NOT NULL GROUP BY file_path "
                      "HAVING count(DISTINCT tenant_id) > 1) s")
        ok(f"테넌트 간 공유 경로 0건 ({shared})", shared == "0")
    finally:
        cleanup()

print(f"\nOK — 저장소 이름 공간 {n}개 검증 통과")

// EDIM 변경관리대장 (Google Sheet) — 생성(1회) / 읽기.
//
// 목적: 엔지니어가 Drive 시트에 변경 요청을 기입 → 담당자가 트리거 실행 시 이 시트를 읽어 구현.
//   시트는 Drive 원본이 정본이므로 생성 후 절대 덮어쓰지 않는다(gdrive-sync 대상 아님).
//
// 실행:
//   GDRIVE_CREDS_DIR=<자격 폴더> node tools/gdrive-change-register.mjs create   # 없으면 생성(있으면 skip)
//   GDRIVE_CREDS_DIR=<자격 폴더> node tools/gdrive-change-register.mjs read     # 미완료 변경요청 출력(JSON)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CREDS = process.env.GDRIVE_CREDS_DIR
if (!CREDS || !existsSync(join(CREDS, 'oauth.json'))) {
  console.error('GDRIVE_CREDS_DIR 에 oauth.json·oauth_token.json 폴더를 지정하십시오'); process.exit(1)
}
const cfg = JSON.parse(readFileSync(join(CREDS, 'oauth.json'), 'utf8'))
const tokf = JSON.parse(readFileSync(join(CREDS, 'oauth_token.json'), 'utf8'))

const EDIM_ROOT = '1L24Mmde_KnaLGsxb99b7889wK86uD7RI'   // 공유 EDIM 폴더
const SHEET_NAME = 'EDIM_변경관리대장'
const TEMPLATE = new URL('./EDIM_변경관리대장_template.xlsx', import.meta.url)
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.client_id, client_secret: cfg.client_secret, refresh_token: tokf.refresh_token, grant_type: 'refresh_token' }),
  })
  const b = await r.json()
  if (!b.access_token) throw new Error('token refresh 실패: ' + JSON.stringify(b))
  return b.access_token
}
async function find(H) {
  const q = `name='${SHEET_NAME}' and '${EDIM_ROOT}' in parents and trashed=false`
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`, { headers: H })
  return (await r.json()).files?.[0] ?? null
}

async function create(H) {
  const hit = await find(H)
  if (hit) { console.log(`이미 존재 — skip\n  ${hit.name}: ${hit.webViewLink}`); return }
  const meta = JSON.stringify({ name: SHEET_NAME, parents: [EDIM_ROOT], mimeType: SHEET_MIME })
  const boundary = 'edimCR' + Date.now().toString().slice(-6)
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`
  const body = Buffer.concat([Buffer.from(pre, 'utf8'), readFileSync(TEMPLATE), Buffer.from(`\r\n--${boundary}--`, 'utf8')])
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST', headers: { ...H, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  })
  const b = await r.json()
  if (!b.id) throw new Error('생성 실패: ' + JSON.stringify(b).slice(0, 200))
  console.log(`생성 ✓ ${b.name}\n  ${b.webViewLink}`)
}

function parseCsv(text) {
  const rows = []
  let field = '', row = [], q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = [] }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

async function read(H) {
  const hit = await find(H)
  if (!hit) { console.log('[]  (변경관리대장 없음 — 먼저 create 실행)'); return }
  // 첫 시트(변경요청)를 CSV 로 export
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${hit.id}/export?mimeType=text/csv`, { headers: H })
  const csv = await r.text()
  const rows = parseCsv(csv)
  const H0 = rows[0] ?? []
  const idx = (name) => H0.findIndex((h) => h.replace(/\s/g, '').includes(name))
  const cNo = idx('No'), cDate = idx('등록일'), cBy = idx('요청자'), cKind = idx('대상구분'),
    cTgt = idx('대상('), cType = idx('변경유형'), cDesc = idx('변경내용'), cPri = idx('우선순위'), cSt = idx('상태')
  const open = []
  for (const row of rows.slice(1)) {
    const status = (row[cSt] ?? '').trim()
    const desc = (row[cDesc] ?? '').trim()
    if (!desc) continue
    if (['완료', '보류'].includes(status)) continue   // 미완료만
    open.push({
      no: row[cNo]?.trim(), date: row[cDate]?.trim(), by: row[cBy]?.trim(),
      kind: row[cKind]?.trim(), target: row[cTgt]?.trim(), type: row[cType]?.trim(),
      desc, priority: row[cPri]?.trim(), status: status || '접수',
    })
  }
  console.log(JSON.stringify(open, null, 2))
  console.error(`\n미완료 변경요청 ${open.length}건 (상태≠완료/보류)`)
}

;(async () => {
  const H = { Authorization: 'Bearer ' + await accessToken() }
  const mode = process.argv[2] ?? 'read'
  if (mode === 'create') await create(H)
  else if (mode === 'read') await read(H)
  else { console.error('인자: create | read'); process.exit(1) }
})()

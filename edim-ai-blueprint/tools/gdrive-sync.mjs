// EDIM 문서 → Google Drive 동기화 (멱등).
//
// 규칙 (docs/EDIM_문서관리 — memory: edim-gdrive-document-pattern):
//   xlsx → Google Sheets 변환 · pptx → Google Slides 변환 · PDF → 원본 그대로.
//   대상: 공유 "EDIM" 폴더 > "EDIM 정의서" 컨테이너.
//   같은 이름이 이미 있으면 내용 갱신(files.update, id 유지 — 공유 링크 불변), 없으면 생성.
//
// 실행:  GDRIVE_CREDS_DIR=<oauth.json·oauth_token.json 폴더> node tools/gdrive-sync.mjs
//   자격증명(oauth.json: client_id/secret, oauth_token.json: refresh_token)은 절대 커밋 금지.
//   기본 CREDS 위치가 없으면 즉시 중단.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CREDS = process.env.GDRIVE_CREDS_DIR
if (!CREDS || !existsSync(join(CREDS, 'oauth.json'))) {
  console.error('GDRIVE_CREDS_DIR 환경변수에 oauth.json·oauth_token.json 폴더를 지정하십시오')
  process.exit(1)
}
const cfg = JSON.parse(readFileSync(join(CREDS, 'oauth.json'), 'utf8'))
const tokf = JSON.parse(readFileSync(join(CREDS, 'oauth_token.json'), 'utf8'))

const CONTAINER = '11fhq9ZcdWpAszwG8dIYUFYytHqkM08Kl'   // "EDIM 정의서"
const DOCS = new URL('../docs/', import.meta.url)
const M = {
  xlsx: { src: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dst: 'application/vnd.google-apps.spreadsheet' },
  pptx: { src: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', dst: 'application/vnd.google-apps.presentation' },
  pdf: { src: 'application/pdf', dst: null },
}

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.client_id, client_secret: cfg.client_secret, refresh_token: tokf.refresh_token, grant_type: 'refresh_token' }),
  })
  const b = await r.json()
  if (!b.access_token) throw new Error('token refresh 실패: ' + JSON.stringify(b))
  return b.access_token
}

let H
async function list(parent) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parent}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&pageSize=200`, { headers: H })
  return (await r.json()).files ?? []
}
async function ensureFolder(name, parent, existing) {
  const hit = existing.find((f) => f.name === name && f.mimeType === 'application/vnd.google-apps.folder')
  if (hit) return hit.id
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
  })
  const b = await r.json()
  if (!b.id) throw new Error(`폴더 생성 실패(${name}): ${JSON.stringify(b)}`)
  return b.id
}
function multipart(meta, filePath, srcMime) {
  const boundary = 'edimBnd' + Math.abs([...JSON.stringify(meta)].reduce((s, c) => s * 31 + c.charCodeAt(0) | 0, 7))
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${srcMime}\r\n\r\n`
  return {
    body: Buffer.concat([Buffer.from(pre, 'utf8'), readFileSync(filePath), Buffer.from(`\r\n--${boundary}--`, 'utf8')]),
    type: `multipart/related; boundary=${boundary}`,
  }
}
async function upsert(filePath, baseName, ext, parent, existing) {
  const conv = M[ext]
  const name = conv.dst ? baseName : `${baseName}.${ext}`   // 변환본은 확장자 제거
  const hit = existing.find((f) => f.name === name)
  if (hit) {
    const { body, type } = multipart({}, filePath, conv.src)   // 내용만 교체 (id·공유 링크 유지)
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${hit.id}?uploadType=multipart&fields=id,name`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': type }, body,
    })
    const b = await r.json()
    if (!b.id) throw new Error(`갱신 실패(${name}): ${JSON.stringify(b).slice(0, 160)}`)
    return { id: b.id, mode: '갱신' }
  }
  const meta = { name, parents: [parent], ...(conv.dst ? { mimeType: conv.dst } : {}) }
  const { body, type } = multipart(meta, filePath, conv.src)
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST', headers: { ...H, 'Content-Type': type }, body,
  })
  const b = await r.json()
  if (!b.id) throw new Error(`업로드 실패(${name}): ${JSON.stringify(b).slice(0, 160)}`)
  return { id: b.id, mode: '신규' }
}

;(async () => {
  H = { Authorization: 'Bearer ' + await accessToken() }
  const root = await list(CONTAINER)

  // 대상 세트: [로컬 상대경로, Drive 폴더(null=컨테이너 루트)]
  const plan = [
    ['02_요구사항/EDIM_요구사항정의서.xlsx', '02_요구사항'],
    ['03_기능확인서_FVT/EDIM_기능확인서.xlsx', '03_기능확인서_FVT'],
    ['04_WBS/EDIM_WBS.xlsx', '04_WBS'],
    ['reference/EDIM Tool System EP2.pptx', '01_발표자료(Slides)'],
  ]
  for (const f of readdirSync(DOCS)) {
    if (f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$')) plan.push([f, null])
  }
  for (const f of readdirSync(new URL('./pdf/', DOCS))) {
    if (f.toLowerCase().endsWith('.pdf')) plan.push([`pdf/${f}`, '05_PDF(원본)'])
  }
  if (existsSync(new URL('./ARCHITECTURE.pdf', DOCS))) plan.push(['ARCHITECTURE.pdf', '05_PDF(원본)'])

  const folderIds = {}
  const folderLists = { '': root }
  let ok = 0, fail = 0
  for (const [rel, folder] of plan) {
    const filePath = new URL('./' + rel.split('/').map(encodeURIComponent).join('/'), DOCS)
    const ext = rel.split('.').pop().toLowerCase()
    const base = rel.split('/').pop().replace(/\.(xlsx|pptx|pdf)$/i, '')
    try {
      let parent = CONTAINER
      let listing = folderLists['']
      if (folder) {
        if (!folderIds[folder]) {
          folderIds[folder] = await ensureFolder(folder, CONTAINER, root)
          folderLists[folder] = await list(folderIds[folder])
        }
        parent = folderIds[folder]
        listing = folderLists[folder]
      }
      const r = await upsert(filePath, base, ext, parent, listing)
      console.log(`✓ [${r.mode}] ${folder ?? '(루트)'} / ${base}${M[ext].dst ? '' : '.' + ext}`)
      ok++
    } catch (e) {
      console.log(`✗ ${rel}: ${e.message}`)
      fail++
    }
  }
  console.log(`\n동기화 완료 — 성공 ${ok} · 실패 ${fail}`)
  if (fail) process.exit(1)
})()

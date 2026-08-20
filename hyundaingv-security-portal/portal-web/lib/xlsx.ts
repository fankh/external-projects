/** 엑셀 다운로드 — 네이티브 .xlsx(OOXML) 생성. 요구사항 '엑셀 ◎'의 산출물을 CSV 가 아닌 실제 Excel
 *  워크북으로 내린다(엑셀양식관리 기반 xlsx, docs/로드맵 V장). 외부 의존 없이 표준 라이브러리만으로 최소
 *  OOXML(단일 시트, inline string)을 구성하고 ZIP(STORED, 무압축)으로 포장한다 — 무압축이라 셀 텍스트가
 *  파일 바이트에 평문으로 남아 게이트가 원문 검증에 쓸 수 있고, 의존성 추가·번들·audit 표면이 없다.
 *  CSV 경로(lib/csv)와 같은 rows 를 공유하므로 수치·스코핑은 단일 원천이다(포맷만 다름). */

/** CSV 와 동일한 수식 주입(CWE-1236) 무력화 — 셀 문자열이 수식 트리거 문자로 시작하면 작은따옴표로 막는다.
 *  Excel 은 xlsx inline string 도 '='로 시작하면 수식으로 평가하므로 CSV 와 같은 방어가 필요하다. */
function guardFormula(v: string | number): string {
  const s = String(v)
  if (typeof v === 'string' && s !== '-' && /^[=+\-@\t\r]/.test(s)) return `'${s}`
  return s
}

function xmlEscape(s: string): string {
  // XML 특수문자 + 제어문자(탭·개행 제외 불가 문자) 제거 — OOXML 파서가 거부하는 0x00~0x08 등 제거
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 0-기반 열 인덱스 → 엑셀 열 문자(A, B, …, Z, AA, …) */
function colLetter(n: number): string {
  let s = ''
  for (let x = n; x >= 0; x = Math.floor(x / 26) - 1) s = String.fromCharCode(65 + (x % 26)) + s
  return s
}

// ── CRC-32 (ZIP 항목 필수) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface ZipEntry { name: string; data: Buffer; crc: number }

/** 최소 ZIP(STORED, 무압축) 조립 — 로컬 헤더 + 데이터 + 중앙 디렉터리 + EOCD */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const entries: (ZipEntry & { offset: number })[] = []
  const locals: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const crc = crc32(f.data)
    const nameBuf = Buffer.from(f.name, 'utf8')
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0)       // local file header signature
    h.writeUInt16LE(20, 4)               // version needed
    h.writeUInt16LE(0, 6)                // flags
    h.writeUInt16LE(0, 8)                // method 0 = stored
    h.writeUInt16LE(0, 10)               // mod time
    h.writeUInt16LE(0x21, 12)            // mod date (1980-01-01)
    h.writeUInt32LE(crc, 14)
    h.writeUInt32LE(f.data.length, 18)   // compressed size (= uncompressed, stored)
    h.writeUInt32LE(f.data.length, 22)   // uncompressed size
    h.writeUInt16LE(nameBuf.length, 26)
    h.writeUInt16LE(0, 28)               // extra len
    locals.push(h, nameBuf, f.data)
    entries.push({ name: f.name, data: f.data, crc, offset })
    offset += 30 + nameBuf.length + f.data.length
  }
  const central: Buffer[] = []
  let cdSize = 0
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)       // central dir signature
    c.writeUInt16LE(20, 4)               // version made by
    c.writeUInt16LE(20, 6)               // version needed
    c.writeUInt16LE(0, 8)                // flags
    c.writeUInt16LE(0, 10)               // method stored
    c.writeUInt16LE(0, 12)               // mod time
    c.writeUInt16LE(0x21, 14)            // mod date
    c.writeUInt32LE(e.crc, 16)
    c.writeUInt32LE(e.data.length, 20)
    c.writeUInt32LE(e.data.length, 24)
    c.writeUInt16LE(nameBuf.length, 28)
    c.writeUInt16LE(0, 30)               // extra len
    c.writeUInt16LE(0, 32)               // comment len
    c.writeUInt16LE(0, 34)               // disk start
    c.writeUInt16LE(0, 36)               // internal attrs
    c.writeUInt32LE(0, 38)               // external attrs
    c.writeUInt32LE(e.offset, 42)        // local header offset
    central.push(c, nameBuf)
    cdSize += 46 + nameBuf.length
  }
  const localBuf = Buffer.concat(locals)
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)      // EOCD signature
  eocd.writeUInt16LE(0, 4)               // disk num
  eocd.writeUInt16LE(0, 6)               // cd start disk
  eocd.writeUInt16LE(entries.length, 8)  // entries this disk
  eocd.writeUInt16LE(entries.length, 10) // entries total
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(localBuf.length, 16) // cd offset
  eocd.writeUInt16LE(0, 20)              // comment len
  return Buffer.concat([localBuf, centralBuf, eocd])
}

function sheetXml(rows: (string | number)[][]): string {
  const rowsXml = rows.map((r, ri) => {
    const cells = r.map((cell, ci) => {
      const ref = `${colLetter(ci)}${ri + 1}`
      if (typeof cell === 'number' && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`
      const text = xmlEscape(guardFormula(cell))
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
    }).join('')
    return `<row r="${ri + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${rowsXml}</sheetData></worksheet>`
}

/** rows → 완결된 .xlsx 워크북 바이트(단일 시트 '데이터') */
export function xlsxBuffer(rows: (string | number)[][]): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets><sheet name="데이터" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  const parts: { name: string; data: Buffer }[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(rows), 'utf8') },
  ]
  return zip(parts)
}

export function xlsxResponse(filename: string, rows: (string | number)[][]): Response {
  const buf = xlsxBuffer(rows)
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`,
    },
  })
}

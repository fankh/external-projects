/** 최소 XLSX 작성기 — 의존성 없이 Office Open XML 통합문서를 만든다.
 *
 *  CSV 는 엑셀에서 열 때 인코딩·자릿수·날짜가 깨지기 쉽다(선행 0 손실, 긴 숫자의 지수 표기,
 *  MAC 주소가 날짜로 해석되는 등). 제품안내서가 '엑셀'을 기능 단위 권한으로 정의하고 있어
 *  실제 .xlsx 로 내보낸다. lib/label.ts 가 Code128 을 직접 인코딩하는 것과 같은 방침이다.
 *
 *  구조: ZIP(무압축 저장) + 4개 XML 파트. 문자열은 inlineStr 로 넣어 sharedStrings 를 생략한다.
 */

export type CellValue = string | number | null | undefined

export interface Sheet {
  name: string
  header: string[]
  rows: CellValue[][]
}

// ── ZIP (stored, 무압축) ──────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface Entry { name: string; data: Buffer; crc: number; offset: number }

/** DOS 시각 — 재현 가능한 산출물을 위해 고정값을 쓴다 (파일 해시가 매번 바뀌지 않도록) */
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

function localHeader(e: Entry): Buffer {
  const name = Buffer.from(e.name, 'utf8')
  const h = Buffer.alloc(30)
  h.writeUInt32LE(0x04034b50, 0)
  h.writeUInt16LE(20, 4)      // version needed
  h.writeUInt16LE(0x0800, 6)  // UTF-8 파일명 플래그
  h.writeUInt16LE(0, 8)       // method: stored
  h.writeUInt16LE(DOS_TIME, 10)
  h.writeUInt16LE(DOS_DATE, 12)
  h.writeUInt32LE(e.crc, 14)
  h.writeUInt32LE(e.data.length, 18)
  h.writeUInt32LE(e.data.length, 22)
  h.writeUInt16LE(name.length, 26)
  h.writeUInt16LE(0, 28)
  return Buffer.concat([h, name])
}

function centralHeader(e: Entry): Buffer {
  const name = Buffer.from(e.name, 'utf8')
  const h = Buffer.alloc(46)
  h.writeUInt32LE(0x02014b50, 0)
  h.writeUInt16LE(20, 4)
  h.writeUInt16LE(20, 6)
  h.writeUInt16LE(0x0800, 8)
  h.writeUInt16LE(0, 10)
  h.writeUInt16LE(DOS_TIME, 12)
  h.writeUInt16LE(DOS_DATE, 14)
  h.writeUInt32LE(e.crc, 16)
  h.writeUInt32LE(e.data.length, 20)
  h.writeUInt32LE(e.data.length, 24)
  h.writeUInt16LE(name.length, 28)
  h.writeUInt32LE(0, 38)      // external attrs
  h.writeUInt32LE(e.offset, 42)
  return Buffer.concat([h, name])
}

function zip(files: { name: string; content: string }[]): Buffer {
  const entries: Entry[] = []
  const parts: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const data = Buffer.from(f.content, 'utf8')
    const e: Entry = { name: f.name, data, crc: crc32(data), offset }
    const lh = localHeader(e)
    parts.push(lh, data)
    offset += lh.length + data.length
    entries.push(e)
  }
  const central = entries.map(centralHeader)
  const centralSize = central.reduce((n, b) => n + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, eocd])
}

// ── XLSX 파트 ────────────────────────────────────────────────────────

function esc(s: string): string {
  // XML 1.0 이 불허하는 제어문자(탭/개행/CR 제외)를 먼저 제거한다 — 값에 섞이면 워크시트 XML 이 깨져 Excel 이 워크북 전체를 못 연다.
  let out = ''
  for (const ch of String(s)) {
    const c = ch.codePointAt(0)
    if (c !== undefined && c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) continue
    out += ch
  }
  return out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 시트명 제약: 31자 이하, : \ / ? * [ ] " 불가(따옴표는 XML 속성 name="..." 을 깨뜨림) */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]"]/g, '_').slice(0, 31) || 'Sheet1'
}

function colRef(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function cell(ref: string, v: CellValue, style?: number): string {
  const s = style ? ` s="${style}"` : ''
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${s}/>`
  // 숫자만 수치 셀로 — 자산번호·MAC 처럼 숫자로 보이는 식별자는 문자열로 둬야
  // 엑셀이 지수 표기나 날짜로 바꾸지 않는다. 수치 셀은 천단위 구분(#,##0) 서식(style 2)을 줘
  // 금액이 "3000000"이 아니라 "3,000,000"으로 표시되면서도 합산·수식이 가능한 네이티브 숫자로 남는다.
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="2"><v>${v}</v></c>`
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
}

function sheetXml(sheet: Sheet): string {
  const widths = sheet.header.map((h, i) => {
    const longest = Math.max(
      h.length,
      ...sheet.rows.map((r) => String(r[i] ?? '').length),
    )
    // 한글은 폭이 넓어 대략 1.6배로 잡는다. 상한을 둬 한 열이 화면을 먹지 않도록.
    return Math.min(60, Math.max(9, Math.round(longest * 1.6) + 2))
  })
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const head = `<row r="1">${sheet.header.map((h, i) => cell(`${colRef(i)}1`, h, 1)).join('')}</row>`
  const body = sheet.rows
    .map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(`${colRef(ci)}${ri + 2}`, v)).join('')}</row>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${head}${body}</sheetData></worksheet>`
}

/** 시트 여러 장을 담은 통합문서를 만든다 */
export function buildXlsx(sheets: Sheet[]): Buffer {
  const list = sheets.length > 0 ? sheets : [{ name: 'Sheet1', header: [], rows: [] }]
  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list
        .map((s, i) => `<sheet name="${esc(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      // 스타일 2종: 0=기본, 1=헤더(굵게·배경)
      name: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3B73"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s) })),
  ]
  return zip(files)
}

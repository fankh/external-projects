import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** 바이너리 다운로드 프록시 (N5) — 허용 목록: 문서 PDF·PCR 보고서·파일·ZIP. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const kind = sp.get('kind') ?? ''
  const id = sp.get('id') ?? ''
  let path: string | null = null
  let filename = 'download'
  if (kind === 'docpdf' && id) { path = `/documents/${encodeURIComponent(id)}/render.pdf`; filename = `${id}.pdf` }
  else if (kind === 'pcr' && id) { path = `/reports/pcr/${encodeURIComponent(id)}.pdf`; filename = `PCR-${id}.pdf` }
  else if (kind === 'file' && id) { path = `/files/download/${encodeURIComponent(id)}`; filename = sp.get('name') ?? `file-${id}` }
  else if (kind === 'devreqimg' && id) { path = `/dev/requirements/images/${encodeURIComponent(id)}`; filename = `devreq-${id}.png` }
  else if (kind === 'cadplot' && id) {
    const scale = sp.get('scale') ?? '100'
    const paper = sp.get('paper') ?? 'A4'
    const orient = sp.get('orient') ?? 'landscape'
    path = `/cad/view/${encodeURIComponent(id)}/plot.pdf?scale=${encodeURIComponent(scale)}&paper=${encodeURIComponent(paper)}&orient=${encodeURIComponent(orient)}`
    filename = `cad-${id}-1-${scale}.pdf`
  }
  else if (kind === 'zip') {
    const project = sp.get('project') ?? ''
    if (!project) return NextResponse.json({ detail: 'project 필요' }, { status: 422 })
    const folder = sp.get('folder') ?? ''
    path = `/files/zip?project=${encodeURIComponent(project)}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`
    filename = `${project}${folder ? `-${folder}` : ''}.zip`
  }
  else if (kind === 'exportpkg') {
    const project = sp.get('project') ?? ''
    if (!project) return NextResponse.json({ detail: 'project 필요' }, { status: 422 })
    path = `/files/export-package?project=${encodeURIComponent(project)}`
    filename = `${project}-export.zip`
  }
  if (!path) return NextResponse.json({ detail: 'kind(docpdf|pcr|file|zip|cadplot) 오류' }, { status: 422 })

  const token = await getToken()
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  const inline = kind === 'docpdf' || kind === 'pcr' || kind === 'cadplot' || kind === 'devreqimg'
  return new NextResponse(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`,
    },
  })
}

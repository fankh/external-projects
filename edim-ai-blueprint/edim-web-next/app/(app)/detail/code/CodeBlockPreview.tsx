'use client'

import { Cvs } from '@/components/Cvs'

export function CodeBlockPreview({ code, name }: { code: string; name: string }) {
  return (
    <Cvs blocks={[{ id: 'b', name: name || 'Block', sub: code, x: 60, y: 24, w: 170, h: 90 }]}
      dims={[{ x: 60, y: 8, w: 170, label: '670' }]} style={{ height: 150 }} />
  )
}

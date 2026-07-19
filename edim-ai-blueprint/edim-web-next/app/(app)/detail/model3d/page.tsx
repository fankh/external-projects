import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Model3dViewer } from './Model3dViewer'

export const dynamic = 'force-dynamic'

// U29 — 제품 3D 뷰어: 원본 PPT 내장 GLB(공조 Fan 3D) 정본. DWG 패널 "3D ☑" 실체 (S-1-1/S-1-2).
export default async function Model3dPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('m3d.title', '제품 3D 뷰어')} — AHU Fan (glTF)`}
        source="/models/ahu-fan.glb (원본 PPT 내장 3D 정본)" />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex' }}>
        <Model3dViewer src="/models/ahu-fan.glb" />
      </div>
    </div>
  )
}

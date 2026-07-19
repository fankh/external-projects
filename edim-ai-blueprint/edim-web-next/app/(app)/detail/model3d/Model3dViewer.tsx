'use client'

/** U29 — 제품 3D 뷰어 (원본 PPT 내장 GLB 정본, glTF 2.0): three.js 동적 로드·궤도 컨트롤.
 *  S-1-1/S-1-2 DWG 패널의 "3D ☑" 실체 — 회전(드래그)·줌(휠)·이동(우클릭). */
import { useEffect, useRef, useState } from 'react'

export function Model3dViewer({ src }: { src: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ phase: 'loading' | 'ready' | 'error'; detail?: string }>({ phase: 'loading' })

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | null = null
    void (async () => {
      try {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        const host = hostRef.current
        if (!host || disposed) return

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0xf4f6fa)
        const camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.1, 5000)
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(host.clientWidth, host.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        host.appendChild(renderer.domElement)
        renderer.domElement.setAttribute('data-3d-canvas', '1')

        scene.add(new THREE.AmbientLight(0xffffff, 1.1))
        const dir = new THREE.DirectionalLight(0xffffff, 1.6)
        dir.position.set(1, 2, 1.5)
        scene.add(dir)

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true

        const gltf = await new GLTFLoader().loadAsync(src)
        if (disposed) return
        const model = gltf.scene
        // 정규화 — 바운딩 기준 중심·거리 자동
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3()).length() || 1
        model.position.sub(center)
        scene.add(model)
        camera.position.set(size * 0.7, size * 0.45, size * 0.7)
        controls.target.set(0, 0, 0)
        controls.update()

        let raf = 0
        const tick = () => { raf = requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera) }
        tick()
        const onResize = () => {
          camera.aspect = host.clientWidth / host.clientHeight
          camera.updateProjectionMatrix()
          renderer.setSize(host.clientWidth, host.clientHeight)
        }
        window.addEventListener('resize', onResize)
        setState({ phase: 'ready', detail: `mesh ${gltf.scene.children.length}` })
        cleanup = () => {
          cancelAnimationFrame(raf)
          window.removeEventListener('resize', onResize)
          controls.dispose()
          renderer.dispose()
          host.removeChild(renderer.domElement)
        }
      } catch (e) {
        if (!disposed) setState({ phase: 'error', detail: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { disposed = true; cleanup?.() }
  }, [src])

  return (
    <div data-3d-viewer style={{ position: 'relative', flex: 1, minHeight: 0, border: '1px solid var(--line)', background: '#F4F6FA' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {state.phase !== 'ready' ? (
        <div data-3d-status style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: state.phase === 'error' ? 'var(--err)' : 'var(--txt-mute)', pointerEvents: 'none' }}>
          {state.phase === 'error' ? `3D 로드 실패 — ${state.detail}` : '3D 모델 로드 중… (18MB GLB)'}
        </div>
      ) : (
        <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 10, color: 'var(--txt-dim)', background: '#ffffffee', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 2, pointerEvents: 'none' }}>
          드래그=회전 · 휠=줌 · 우클릭=이동 · glTF 2.0
        </div>
      )}
    </div>
  )
}

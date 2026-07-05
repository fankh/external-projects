import { useCallback, useRef, useState } from 'react'
import type { DrawingBounds } from '../types/drawing'

interface ViewBoxState {
  x: number
  y: number
  width: number
  height: number
}

const FIT_MARGIN_RATIO = 0.05

export function usePanZoom(svgElementRef: React.RefObject<SVGSVGElement | null>) {
  const [viewBox, setViewBox] = useState<ViewBoxState>({ x: 0, y: 0, width: 100, height: 100 })
  const activePanRef = useRef<{ startClientX: number; startClientY: number; startViewBox: ViewBoxState } | null>(null)

  const fitToBounds = useCallback((bounds: DrawingBounds) => {
    const contentWidth = Math.max(bounds.maxX - bounds.minX, 1)
    const contentHeight = Math.max(bounds.maxY - bounds.minY, 1)
    const marginX = contentWidth * FIT_MARGIN_RATIO
    const marginY = contentHeight * FIT_MARGIN_RATIO
    // Y is flipped by the canvas (scale(1,-1)), so the viewBox spans -maxY..-minY
    setViewBox({
      x: bounds.minX - marginX,
      y: -bounds.maxY - marginY,
      width: contentWidth + marginX * 2,
      height: contentHeight + marginY * 2,
    })
  }, [])

  const handleWheel = useCallback((wheelEvent: React.WheelEvent<SVGSVGElement>) => {
    const svgElement = svgElementRef.current
    if (!svgElement) return
    const zoomFactor = wheelEvent.deltaY > 0 ? 1.2 : 1 / 1.2

    setViewBox((currentViewBox) => {
      const svgRect = svgElement.getBoundingClientRect()
      const cursorRatioX = (wheelEvent.clientX - svgRect.left) / svgRect.width
      const cursorRatioY = (wheelEvent.clientY - svgRect.top) / svgRect.height
      const cursorWorldX = currentViewBox.x + cursorRatioX * currentViewBox.width
      const cursorWorldY = currentViewBox.y + cursorRatioY * currentViewBox.height
      const newWidth = currentViewBox.width * zoomFactor
      const newHeight = currentViewBox.height * zoomFactor
      return {
        x: cursorWorldX - cursorRatioX * newWidth,
        y: cursorWorldY - cursorRatioY * newHeight,
        width: newWidth,
        height: newHeight,
      }
    })
  }, [svgElementRef])

  const handlePointerDown = useCallback((pointerEvent: React.PointerEvent<SVGSVGElement>) => {
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
    activePanRef.current = {
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      startViewBox: viewBox,
    }
  }, [viewBox])

  const handlePointerMove = useCallback((pointerEvent: React.PointerEvent<SVGSVGElement>) => {
    const activePan = activePanRef.current
    const svgElement = svgElementRef.current
    if (!activePan || !svgElement) return
    const svgRect = svgElement.getBoundingClientRect()
    const worldUnitsPerPixel = activePan.startViewBox.width / svgRect.width
    setViewBox({
      ...activePan.startViewBox,
      x: activePan.startViewBox.x - (pointerEvent.clientX - activePan.startClientX) * worldUnitsPerPixel,
      y: activePan.startViewBox.y - (pointerEvent.clientY - activePan.startClientY) * worldUnitsPerPixel,
    })
  }, [svgElementRef])

  const handlePointerUp = useCallback(() => {
    activePanRef.current = null
  }, [])

  return {
    viewBoxString: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    viewBoxWidth: viewBox.width,
    fitToBounds,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  }
}

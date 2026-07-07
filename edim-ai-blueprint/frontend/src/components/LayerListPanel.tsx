import { LayersIcon } from './Icons'
import type { LayerInfo } from '../types/drawing'

interface LayerListPanelProps {
  layers: LayerInfo[]
  hiddenLayerNames: Set<string>
  onToggleLayerVisibility: (layerName: string) => void
}

export function LayerListPanel({ layers, hiddenLayerNames, onToggleLayerVisibility }: LayerListPanelProps) {
  if (layers.length === 0) return null

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-icon">
          <LayersIcon />
        </span>
        <span className="card-title">레이어</span>
        <span className="card-sub">{layers.length}</span>
      </div>
      <ul className="layer-list">
        {layers.map((layer) => {
          const isHidden = hiddenLayerNames.has(layer.layerName)
          return (
            <li key={layer.layerName}>
              <label className={`layer-row${isHidden ? ' layer-hidden' : ''}`}>
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => onToggleLayerVisibility(layer.layerName)}
                />
                <span className="layer-swatch" style={{ backgroundColor: layer.colorHex }} />
                <span className="layer-name">{layer.layerName}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

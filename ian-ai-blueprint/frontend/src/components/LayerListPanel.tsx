import type { LayerInfo } from '../types/drawing'

interface LayerListPanelProps {
  layers: LayerInfo[]
  hiddenLayerNames: Set<string>
  onToggleLayerVisibility: (layerName: string) => void
}

export function LayerListPanel({ layers, hiddenLayerNames, onToggleLayerVisibility }: LayerListPanelProps) {
  if (layers.length === 0) return null

  return (
    <section className="sidebar-section">
      <h2>레이어</h2>
      <ul className="layer-list">
        {layers.map((layer) => (
          <li key={layer.layerName}>
            <label>
              <input
                type="checkbox"
                checked={!hiddenLayerNames.has(layer.layerName)}
                onChange={() => onToggleLayerVisibility(layer.layerName)}
              />
              <span className="layer-color-swatch" style={{ backgroundColor: layer.colorHex }} />
              {layer.layerName}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

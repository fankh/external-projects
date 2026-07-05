interface IconProps {
  size?: number
}

function strokeProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function LogoMark({ size = 18 }: IconProps) {
  return (
    <svg {...strokeProps(size)} strokeWidth={1.7}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </svg>
  )
}

export function UploadIcon({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)}>
      <path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
    </svg>
  )
}

export function SparklesIcon({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18.5 14l.7 1.8L21 16.5l-1.8.7L18.5 19l-.7-1.8L16 16.5l1.8-.7L18.5 14z" />
    </svg>
  )
}

export function LayersIcon({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)}>
      <path d="M12 2l10 6-10 6L2 8l10-6z" />
      <path d="M2 12l10 6 10-6" />
      <path d="M2 16l10 6 10-6" />
    </svg>
  )
}

export function DownloadIcon({ size = 16 }: IconProps) {
  return (
    <svg {...strokeProps(size)}>
      <path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
    </svg>
  )
}

export function BlueprintIcon({ size = 26 }: IconProps) {
  return (
    <svg {...strokeProps(size)} strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.55" />
    </svg>
  )
}

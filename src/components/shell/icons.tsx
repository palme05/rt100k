/**
 * Kleine Linien-Symbole für die Navigation (24er-Raster, Strich in
 * `currentColor`). Eigene Pfade statt Symbolbibliothek.
 */

export type IconName = 'home' | 'depots' | 'analysis' | 'tax' | 'road' | 'import' | 'bell' | 'review' | 'shield' | 'admin' | 'more' | 'plus' | 'refresh'

const PATHS: Record<IconName, string[]> = {
  home: ['M4 11.5 12 5l8 6.5', 'M6.5 10v9h11v-9'],
  depots: ['M4 7.5h16v11H4z', 'M4 11h16', 'M8 5h8'],
  analysis: ['M5 19V9', 'M10 19V5', 'M15 19v-7', 'M20 19v-4'],
  tax: ['M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20z', 'M10 9.5h4', 'M10 13h4'],
  road: ['M4 18c4-1 6-5 8-8s4-5 8-6', 'M17 4h3v3'],
  import: ['M12 4v11', 'M8 11l4 4 4-4', 'M5 19h14'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5h4'],
  review: ['M5 6h14v13H5z', 'M5 10h14', 'M9 4v4', 'M15 4v4'],
  shield: ['M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7z', 'M9.5 12l2 2 3.5-3.5'],
  admin: ['M14.5 9.5a3.5 3.5 0 1 1-1-2.5', 'M13.5 7l6.5 6.5-2 2-1.5-1.5-1.5 1.5-1.5-1.5'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M19 8a7.5 7.5 0 1 0 .5 6', 'M19.5 4v4.5H15'],
}

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string | undefined }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

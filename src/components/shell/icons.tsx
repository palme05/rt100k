/**
 * Kleine Linien-Symbole für die Navigation (24er-Raster, Strich in
 * `currentColor`). Eigene Pfade statt Symbolbibliothek.
 */

export type IconName =
  | 'home'
  | 'depots'
  | 'analysis'
  | 'tax'
  | 'road'
  | 'import'
  | 'bell'
  | 'review'
  | 'shield'
  | 'admin'
  | 'more'
  | 'plus'
  | 'refresh'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'search'
  | 'eye'
  | 'eyeOff'
  | 'user'
  | 'logout'
  | 'close'
  | 'check'
  | 'edit'
  | 'trash'
  | 'route'
  | 'key'
  | 'dots'
  | 'arrowRight'
  | 'alert'

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
  chevronLeft: ['M14.5 6 8.5 12l6 6'],
  chevronRight: ['M9.5 6l6 6-6 6'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z', 'M15.5 15.5 20 20'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: ['M4 4l16 16', 'M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6', 'M6.3 7.6A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4-.9', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  logout: ['M14 4h4.5v16H14', 'M10 8l-4 4 4 4', 'M6 12h9'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  edit: ['M4.5 19.5h4l10-10-4-4-10 10z', 'M13 7l4 4'],
  trash: ['M5 7h14', 'M9.5 7V4.5h5V7', 'M7 7l1 13h8l1-13'],
  // Strecke: Start, Weg in zwei Kurven, Ziel
  route: ['M4.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0', 'M9 19h7.5a3.25 3.25 0 0 0 0-6.5h-9a3.25 3.25 0 0 1 0-6.5H15', 'M16.5 6a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'],
  key: ['M8.5 19.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M11.7 11.8 19.5 4', 'M16.5 7l2.5 2.5', 'M14 9.5l1.75 1.75'],
  // drei Punkte im gleichen Strich wie die übrigen Symbole
  dots: ['M5 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0', 'M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0', 'M17 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0'],
  arrowRight: ['M5 12h13', 'M13 7l5 5-5 5'],
  alert: ['M12 4.5 21 19.5H3z', 'M12 10v4', 'M12 16.8v.01'],
}

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string | undefined }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

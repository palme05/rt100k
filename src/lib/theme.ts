/** Darstellung: dem Gerät folgen oder fest hell/dunkel (Cookie `theme`). */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_COOKIE = 'theme'

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'system'
}

/** Statusleiste/Adressleiste – wie --bg in src/styles/tokens.css */
export const THEME_COLOR = { light: '#fbfbf9', dark: '#131416' } as const

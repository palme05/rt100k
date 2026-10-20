import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import '@fontsource-variable/instrument-sans'
import { PwaRegister } from '@/components/shell/pwa'
import { parseTheme, THEME_COLOR, THEME_COOKIE } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'rt100k', template: '%s · rt100k' },
  description: 'Road to 100k – selbst gehosteter Open-Source-Vermögenstracker',
  robots: { index: false, follow: false },
  applicationName: 'rt100k',
  appleWebApp: { capable: true, title: 'rt100k', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    // Statusleiste in der Farbe des Hintergrunds (hell, dunkel oder dem Gerät folgend)
    themeColor:
      theme === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
            { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[theme],
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Liest den Request-Header und erzwingt damit dynamisches Rendering:
  // Nur so kann Next.js jeder Antwort die CSP-Nonce aus src/proxy.ts mitgeben.
  await headers()
  // Darstellung serverseitig als Attribut – kein Skript, kein Aufblitzen
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html lang="de-AT" data-theme={theme === 'system' ? undefined : theme}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}

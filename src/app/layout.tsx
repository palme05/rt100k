import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import '@fontsource-variable/instrument-sans'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'rt100k', template: '%s · rt100k' },
  description: 'Road to 100k – selbst gehosteter Open-Source-Vermögenstracker',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Liest den Request-Header und erzwingt damit dynamisches Rendering:
  // Nur so kann Next.js jeder Antwort die CSP-Nonce aus src/proxy.ts mitgeben.
  await headers()

  return (
    <html lang="de-AT">
      <body>{children}</body>
    </html>
  )
}

import type { MetadataRoute } from 'next'

/**
 * Web-App-Manifest: macht rt100k am Handy und am Desktop installierbar.
 * Farben entsprechen --bg aus src/styles/tokens.css (Manifest braucht feste Werte).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'rt100k – Road to 100k',
    short_name: 'rt100k',
    description: 'Selbst gehosteter Vermögenstracker: Depots, Krypto, Cash und Sachwerte, Analyse, Steuer und der Weg zu 100k.',
    lang: 'de-AT',
    dir: 'ltr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfbf9',
    theme_color: '#fbfbf9',
    categories: ['finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Abrechnungen aus anderen Apps teilen (Android, ChromeOS): der Service Worker
    // fängt den POST ab und legt die Dateien nur auf dem Gerät ab (public/sw.js)
    share_target: {
      action: '/app/import/teilen',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'titel',
        text: 'text',
        files: [{ name: 'dateien', accept: ['application/pdf', '.pdf', 'text/csv', 'text/comma-separated-values', '.csv'] }],
      },
    },
    shortcuts: [
      { name: 'Depots', url: '/app/depots' },
      { name: 'Importieren', url: '/app/import' },
      { name: 'Road to 100k', url: '/app/road' },
    ],
  }
}

/**
 * Erzeugt die App-Icons (PWA, Apple, Favicon) aus einer Vorlage: die
 * „Strecke“ aus dem Logo – Spur, zurückgelegter Weg in Orange, Position als
 * Punkt – auf dunklem Grund. Farben wie in src/styles/tokens.css
 * (--ink, --accent, --ink-2).
 *
 *   node scripts/icons.ts
 *
 * Braucht Chromium (im Cloud-Container über PW_CHROMIUM_PATH vorhanden).
 * Die Ergebnisse liegen im Repo; das Skript läuft nur, wenn sich das Icon ändert.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const INK = '#16181b'
const ACCENT = '#e2620b'
const TRACK = '#4f535a'

/** Logo in einem 512er-Raster; `inset` verkleinert es für die sichere Zone maskierbarer Icons. */
function svg({ rounded, inset = 0 }: { rounded: boolean; inset?: number }): string {
  const x1 = 104 + inset
  const x2 = 408 - inset
  const pos = Math.round(x1 + (x2 - x1) * 0.62)
  const r = 58 - inset / 4
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${INK}"/>
  <line x1="${x1}" y1="256" x2="${x2}" y2="256" stroke="${TRACK}" stroke-width="34" stroke-linecap="round"/>
  <line x1="${x1}" y1="256" x2="${pos}" y2="256" stroke="${ACCENT}" stroke-width="44" stroke-linecap="round"/>
  <circle cx="${pos}" cy="256" r="${r}" fill="${ACCENT}" stroke="${INK}" stroke-width="22"/>
</svg>
`
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, rounded: true },
  { file: 'public/icons/icon-512.png', size: 512, rounded: true },
  // Maskierbar: vollflächig, Logo innerhalb des inneren Kreises (80 %)
  { file: 'public/icons/maskable-512.png', size: 512, rounded: false, inset: 36 },
  // iOS rundet selbst ab
  { file: 'src/app/apple-icon.png', size: 180, rounded: false },
] as const

await mkdir('public/icons', { recursive: true })
await writeFile('src/app/icon.svg', svg({ rounded: true }))

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size } })
    const image = svg({ rounded: t.rounded, inset: 'inset' in t ? t.inset : 0 }).replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)
    await page.setContent(`<html><body style="margin:0;background:transparent">${image}</body></html>`)
    await page.screenshot({ path: t.file, omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } })
    await page.close()
    process.stdout.write(`${t.file}\n`)
  }
} finally {
  await browser.close()
}

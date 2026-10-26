/**
 * Erzeugt die App-Icons (PWA, Apple, Favicon inkl. `favicon.ico`) aus einer Vorlage: die
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

/** Größen in `public/favicon.ico` – Browser fragen /favicon.ico auch ohne Link-Tag ab */
const ICO_SIZES = [16, 32, 48] as const

/** ICO-Datei mit eingebetteten PNGs (seit Windows Vista und in allen Browsern lesbar). */
function ico(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserviert
  header.writeUInt16LE(1, 2) // Typ: Icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // Breite
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // Höhe
    entry.writeUInt8(0, 2) // keine Palette
    entry.writeUInt8(0, 3) // reserviert
    entry.writeUInt16LE(1, 4) // Farbebenen
    entry.writeUInt16LE(32, 6) // Bit je Pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

await mkdir('public/icons', { recursive: true })
await writeFile('src/app/icon.svg', svg({ rounded: true }))

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
const render = async (size: number, rounded: boolean, inset = 0): Promise<Buffer> => {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const image = svg({ rounded, inset }).replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(`<html><body style="margin:0;background:transparent">${image}</body></html>`)
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  await page.close()
  return png
}
try {
  for (const t of targets) {
    await writeFile(t.file, await render(t.size, t.rounded, 'inset' in t ? t.inset : 0))
    process.stdout.write(`${t.file}\n`)
  }
  const icons = []
  for (const size of ICO_SIZES) icons.push({ size, png: await render(size, true) })
  await writeFile('public/favicon.ico', ico(icons))
  process.stdout.write('public/favicon.ico\n')
} finally {
  await browser.close()
}

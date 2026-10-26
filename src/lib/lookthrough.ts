import { CsvError, parseCsv } from './import/csv'
import { parseDate } from './import/text'
import { parseScaled } from './quantity'

/**
 * ETF-Durchschau (Phase 4) als reine Funktionen.
 *
 * Die Bestandsliste lädt der Nutzer selbst auf der Seite des ETF-Anbieters
 * herunter (persönliche Nutzung laut deren Nutzungsbedingungen – rt100k ruft
 * diese Seiten nicht automatisch ab, siehe docs/DATA_SOURCES.md). Gelesen wird
 * die Datei im Browser; gespeichert werden die zusammengefassten Gewichte je
 * Land und Branche, die größten Titel (bis zu 300) und alle Titel mit Gewicht
 * (für die komplette Liste, ohne Land/Branche je Titel).
 *
 * Spalten werden über die Kopfzeile erkannt (deutsch und englisch, z. B.
 * iShares „Gewichtung (%)“/„Weight (%)“, „Standort“/„Location“).
 */

export interface WeightEntry {
  label: string
  /** Basispunkte des Fonds, 485 = 4,85 % (negativ bei Derivaten möglich) */
  bp: number
}

/** Ein Titel der kompletten Liste: Name und Gewicht in ppm des Fonds (1 % = 10.000) */
export type Holding = [name: string, ppm: number]

/**
 * Worauf sich die Länderspalte bezieht: Herkunft des Unternehmens (iShares
 * „Standort“, Xtrackers „Land“ …) oder Börsenplatz (Vanguard „Region“ –
 * Tencent steht dort unter Hongkong, PDD unter USA).
 */
export type CountryBasis = 'herkunft' | 'boerse'

export interface Breakdown {
  fundName: string | null
  asOf: string | null
  rows: number
  countries: WeightEntry[]
  sectors: WeightEntry[]
  top: WeightEntry[]
  countryBasis: CountryBasis | null
  /** So viele Titel wurden bei einer Börsenplatz-Liste China zugeordnet */
  chinaFixes: number
  holdings: Holding[]
}

export const MAX_ENTRIES = 300
/** Höchstens so viele Titel in der kompletten Liste (breite Weltfonds haben gut 9.000) */
export const MAX_HOLDINGS = 12_000
export const MAX_LABEL = 60
/** So viele Einzeltitel je ETF werden gespeichert – genug für die aufgeklappte Liste */
export const MAX_TOP = MAX_ENTRIES
export const CASH_LABEL = 'Cash und Derivate'

const COLUMN: Record<'weight' | 'name' | 'sector' | 'country' | 'region' | 'assetClass', RegExp> = {
  weight: /^(weight|weighting|gewichtung|gewicht|anteil|% of (net )?assets|% des fondsvermögens|% der assets|% der vermögenswerte|% des vermögens|% of (the )?market value|% des marktwert(e)?s|% marktwert|marktwert(anteil)? ?(in )?%|% of fund|% of portfolio|portfolio %|fund %)(\b|$)/i,
  name: /^(name|security name|holdings?( name)?|wertpapiere?|bezeichnung|titel|constituent)\b/i,
  sector: /^(sector|sektor|branche|industry)\b/i,
  country: /^(location|standort|country|land|domicile|sitzland|country of risk)\b/i,
  // Vanguard nennt das Land „Region“ – nur genutzt, wenn es keine Länderspalte gibt
  region: /^(region|market|markt)$/i,
  assetClass: /^(asset class|anlageklasse|asset type|wertpapierart)\b/i,
}

const COUNTRY: Record<string, string> = {
  'united states': 'USA', usa: 'USA', 'vereinigte staaten': 'USA', 'vereinigte staaten von amerika': 'USA', us: 'USA',
  japan: 'Japan',
  'united kingdom': 'Vereinigtes Königreich', 'vereinigtes königreich': 'Vereinigtes Königreich', 'great britain': 'Vereinigtes Königreich', großbritannien: 'Vereinigtes Königreich', uk: 'Vereinigtes Königreich',
  canada: 'Kanada', kanada: 'Kanada',
  france: 'Frankreich', frankreich: 'Frankreich',
  germany: 'Deutschland', deutschland: 'Deutschland',
  switzerland: 'Schweiz', schweiz: 'Schweiz',
  australia: 'Australien', australien: 'Australien',
  netherlands: 'Niederlande', niederlande: 'Niederlande',
  sweden: 'Schweden', schweden: 'Schweden',
  denmark: 'Dänemark', dänemark: 'Dänemark',
  spain: 'Spanien', spanien: 'Spanien',
  italy: 'Italien', italien: 'Italien',
  'hong kong': 'Hongkong', hongkong: 'Hongkong',
  china: 'China',
  taiwan: 'Taiwan',
  india: 'Indien', indien: 'Indien',
  'korea (south)': 'Südkorea', 'south korea': 'Südkorea', korea: 'Südkorea', südkorea: 'Südkorea', 'korea (süd)': 'Südkorea',
  brazil: 'Brasilien', brasilien: 'Brasilien',
  ireland: 'Irland', irland: 'Irland',
  belgium: 'Belgien', belgien: 'Belgien',
  finland: 'Finnland', finnland: 'Finnland',
  norway: 'Norwegen', norwegen: 'Norwegen',
  singapore: 'Singapur', singapur: 'Singapur',
  austria: 'Österreich', österreich: 'Österreich',
  israel: 'Israel',
  'new zealand': 'Neuseeland', neuseeland: 'Neuseeland',
  'south africa': 'Südafrika', südafrika: 'Südafrika',
  mexico: 'Mexiko', mexiko: 'Mexiko',
  'saudi arabia': 'Saudi-Arabien', 'saudi-arabien': 'Saudi-Arabien',
  portugal: 'Portugal',
  poland: 'Polen', polen: 'Polen',
}

const SECTOR: Record<string, string> = {
  'information technology': 'IT', informationstechnologie: 'IT', it: 'IT', technology: 'IT', technologie: 'IT',
  financials: 'Finanzen', finanzen: 'Finanzen', finanzwesen: 'Finanzen', finanzdienstleistungen: 'Finanzen',
  'health care': 'Gesundheit', healthcare: 'Gesundheit', gesundheitsversorgung: 'Gesundheit', gesundheitswesen: 'Gesundheit', gesundheit: 'Gesundheit',
  'consumer discretionary': 'Zyklischer Konsum', 'nicht-basiskonsumgüter': 'Zyklischer Konsum', 'zyklische konsumgüter': 'Zyklischer Konsum',
  'consumer staples': 'Basiskonsum', basiskonsumgüter: 'Basiskonsum', 'nichtzyklische konsumgüter': 'Basiskonsum',
  industrials: 'Industrie', industrie: 'Industrie',
  communication: 'Kommunikation', 'communication services': 'Kommunikation', kommunikation: 'Kommunikation', kommunikationsdienste: 'Kommunikation', telecommunications: 'Kommunikation', telekommunikation: 'Kommunikation',
  energy: 'Energie', energie: 'Energie',
  materials: 'Rohstoffe', 'basic materials': 'Rohstoffe', materialien: 'Rohstoffe', rohstoffe: 'Rohstoffe', grundstoffe: 'Rohstoffe',
  utilities: 'Versorger', versorger: 'Versorger', versorgungsbetriebe: 'Versorger',
  'real estate': 'Immobilien', immobilien: 'Immobilien',
}

/** Vorschläge fürs Zuordnen (deutsche Namen, wie sie auch die Listen ergeben) */
export const COUNTRY_SUGGESTIONS: readonly string[] = [...new Set(Object.values(COUNTRY))].sort((a, b) => a.localeCompare(b, 'de'))
export const SECTOR_SUGGESTIONS: readonly string[] = [...new Set(Object.values(SECTOR))].sort((a, b) => a.localeCompare(b, 'de'))

const CASH = /cash|derivat|futures?\b|money market|geldmarkt|devisen|\bfx\b|liquidit/i

const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()

function label(value: string, dictionary: Record<string, string>): string {
  const v = clean(value)
  if (!v || v === '-' || v === '—') return 'Ohne Angabe'
  return dictionary[v.toLowerCase()] ?? v.slice(0, MAX_LABEL)
}

const REGION_NAMES = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['de'], { type: 'region' }) : null

/** Land: bekannte Namen, sonst ISO-Kürzel („JP“) → deutscher Name („Japan“). */
function countryLabel(value: string): string {
  const v = clean(value)
  const known = COUNTRY[v.toLowerCase()]
  if (known || !/^[A-Z]{2}$/.test(v) || !REGION_NAMES) return label(value, COUNTRY)
  try {
    const name = REGION_NAMES.of(v)
    return name && name !== v ? name.slice(0, MAX_LABEL) : v
  } catch {
    return v
  }
}

/** „4,85“ / „4.85“ / „4.85%“ → Millionstel-Prozent (exakt, ohne Float); null wenn keine Zahl */
function weightMicro(raw: string, comma: boolean): number | null {
  let s = clean(raw).replace(/%$/, '').trim()
  if (s === '' || s === '-') return null
  s = comma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const negative = s.startsWith('-')
  const [whole = '0', fraction = ''] = s.replace('-', '').split('.')
  const v = parseScaled(`${whole}.${fraction.slice(0, 6).padEnd(6, '0')}`, 6)
  if (v === null) return null
  return negative ? -Number(v) : Number(v)
}

const MONTHS: Record<string, number> = { jan: 1, jän: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12 }

/** Stand der Liste aus den Kopfzeilen (falls angegeben): „17.10.2026“, „2026-10-17“, „30 Sep 2026“, „30. September 2026“. */
function findDate(rows: readonly string[][]): string | null {
  // Stichtag zuerst („Per 30. Sept. 2026“, „Stand …“, „As of …“) – nicht das Download-Datum
  const cells = rows.flat()
  const asOf = cells.filter((c) => /^\s*(per|stand|as of|as at)\b/i.test(c))
  return dateIn(asOf) ?? dateIn(cells)
}

function dateIn(cells: readonly string[]): string | null {
  for (const cell of cells) {
    const m = /(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/.exec(cell)
    const day = m ? parseDate(m[1]!) : null
    if (day) return day
    const named = /\b(\d{1,2})\.? ([a-zä]{3})[a-zä]*\.? (\d{4})\b/i.exec(cell)
    const month = named ? MONTHS[named[2]!.toLowerCase()] : undefined
    if (named && month) {
      const iso = `${named[3]}-${String(month).padStart(2, '0')}-${named[1]!.padStart(2, '0')}`
      if (parseDate(iso)) return iso
    }
  }
  return null
}

/** Fondsname aus den Kopfzeilen: erste Zeile, die nach Fonds aussieht (nicht „heruntergeladen am …“, Titel oder Stichtag). */
function fundNameIn(rows: readonly string[][]): string | undefined {
  const first = rows.map((r) => clean(r.find((c) => clean(c) !== '') ?? '')).filter(Boolean)
  const skip = /(heruntergeladen|downloaded|aufschlüsselung|holdings|positionen|^per\b|^stand\b|^as (of|at)\b)/i
  return (first.find((c) => /\b(etf|ucits|fund|fonds)\b/i.test(c) && !skip.test(c)) ?? first.find((c) => !skip.test(c)))?.slice(0, 120)
}

function sorted(map: Map<string, number>): WeightEntry[] {
  return [...map.entries()]
    .filter(([, bp]) => bp !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES)
    .map(([l, bp]) => ({ label: l, bp }))
}

/**
 * Chinesische Unternehmen mit Notiz in den USA oder Singapur – bei
 * Börsenplatz-Listen (Vanguard) sonst unter diesen Ländern gezählt, obwohl
 * Indexanbieter und Factsheets sie China zuordnen. Bewusst eine Liste großer
 * Namen plus „China/Chinese“ im Namen.
 */
const CHINA_ISSUER =
  /\b(CHINA|CHINESE|TENCENT|ALIBABA|MEITUAN|PDD|PINDUODUO|JD ?COM|BAIDU|NETEASE|XIAOMI|BYD|KUAISHOU|TRIP ?COM|KE HOLDINGS|LI AUTO|NIO|XPENG|ANTA SPORTS|GEELY|HAIER|MIDEA|CONTEMPORARY AMPEREX|WUXI|LI NING|SUNNY OPTICAL|SHENZHOU|ZIJIN|CNOOC|SINOPEC|PETROCHINA|PING AN|COSCO|VIPSHOP|ZTO|BEIGENE|BEONE|BILIBILI|LENOVO|ENN ENERGY|SINO BIOPHARM|SINOPHARM|HENGRUI|MINDRAY|FULL TRUCK|TAL EDUCATION|NEW ORIENTAL|H WORLD|KINGDEE|KINGSOFT|SMOORE|POP MART|NONGFU|CITIC|HAIDILAO|GREAT WALL MOTOR|FOSUN|TINGYI|WANT WANT|HUA HONG|SEMICONDUCTOR MANUFACTURING INTERNATIONAL|SMIC|ZHONGSHENG|LONGFOR|INNOVENT|HANSOH|AKESO|XINYI|WEICHAI|PICC|HUATAI|TRAVELSKY|ZOOMLION|SANY|AUTOHOME|WEIBO|IQIYI|GDS HOLDINGS|INDUSTRIAL AND COMMERCIAL BANK|AGRICULTURAL BANK|BANK OF COMMUNICATIONS|POSTAL SAVINGS|GUANGZHOU|SHENZHEN|SHANGHAI|BEIJING|ZHEJIANG|JIANGSU|SHANDONG|CHONGQING|TSINGTAO|HAITIAN|SHIMAO|COUNTRY GARDEN|YADEA|J&T GLOBAL|HORIZON ROBOTICS|ZHIPU|MINIMAX|BOSIDENG|CHOW TAI FOOK)\b/
const NOT_CHINA = /\b(HONG KONG|SANDS CHINA|MTR|CLP)\b/
/**
 * In Hongkong notiert, aber kein chinesisches Unternehmen: Hongkonger Werte,
 * Macau-Casinos (Indexanbieter: Hongkong) und ausländische Zweitnotizen. In
 * Hongkong notierte Titel ohne Treffer hier zählen bei Börsenplatz-Listen zu
 * China – das sind nach Gewicht fast alle (Tencent, Alibaba, Meituan, Banken,
 * und viele kleinere ohne „China“ im Namen).
 */
const HONG_KONG_ISSUER =
  /\b(HONG ?KONG|HKT|HK ELECTRIC|AIA|HKEX|TECHTRONIC|CK (HUTCHISON|ASSET|INFRASTRUCTURE)|POWER ASSETS|CLP|MTR|SUN HUNG KAI|LINK (REAL ESTATE|REIT)|HENDERSON LAND|NEW WORLD DEVELOPMENT|SINO LAND|WHARF|HANG SENG|HANG LUNG|SWIRE|GALAXY ENTERTAINMENT|SANDS CHINA|WYNN MACAU|MGM CHINA|SJM|MELCO|BANK OF EAST ASIA|HYSAN|KERRY PROPERTIES|PCCW|ASMPT|ASM PACIFIC|VTECH|JOHNSON ELECTRIC|WH GROUP|ESR|CATHAY PACIFIC|SHANGRI ?LA|HSBC|PRUDENTIAL|STANDARD CHARTERED|MANULIFE|SAMSONITE|BUDWEISER|PRADA|FIRST PACIFIC|JARDINE|DAIRY FARM|L OCCITANE|CHOW SANG SANG|PACIFIC BASIN|VITASOY|CAFE DE CORAL|DAH SING|FAR EAST CONSORTIUM)\b/
const LISTED_ABROAD = new Set(['USA', 'Singapur'])

/** Groß, ohne Akzente und Satzzeichen – für den Namensvergleich */
const upper = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')

/** Unternehmensname → China? (für Notizen in den USA und Singapur) */
export function isChineseIssuer(name: string): boolean {
  const n = upper(name)
  return CHINA_ISSUER.test(n) && !NOT_CHINA.test(n)
}

/**
 * Börsenplatz-Liste: gehört der Titel zu China? Hongkong-Notiz → China,
 * außer bei Hongkonger und ausländischen Unternehmen; USA/Singapur → nur
 * bekannte chinesische Namen.
 */
export function chineseByListing(name: string, listing: string): boolean {
  if (listing === 'Hongkong') return !HONG_KONG_ISSUER.test(upper(name))
  return LISTED_ABROAD.has(listing) && isChineseIssuer(name)
}

export class HoldingsFileError extends Error {}

/** Bestandsliste eines ETF (CSV) → zusammengefasste Gewichte. */
export function parseHoldingsCsv(text: string): Breakdown {
  let rows: string[][]
  try {
    rows = parseCsv(text)
  } catch (error) {
    throw new HoldingsFileError(error instanceof CsvError ? error.message : 'Die Datei ist keine lesbare CSV-Datei.')
  }
  return parseHoldingsRows(rows)
}

/** Bestandsliste als Zeilen (aus CSV oder dem ersten Blatt einer XLSX-Datei) → zusammengefasste Gewichte. */
export function parseHoldingsRows(rows: readonly string[][]): Breakdown {
  const headerIndex = rows.slice(0, 40).findIndex((r) => r.some((c) => COLUMN.weight.test(clean(c))) && r.some((c) => COLUMN.name.test(clean(c))))
  if (headerIndex < 0) throw new HoldingsFileError('In der Datei fehlen die Spalten für Name und Gewichtung – ist es die Bestandsliste (Positionen/Holdings) des ETF?')
  const header = rows[headerIndex]!.map(clean)
  const col = (key: keyof typeof COLUMN) => header.findIndex((h) => COLUMN[key].test(h))
  const iWeight = col('weight')
  const iName = col('name')
  const iSector = col('sector')
  const iCountry = col('country') >= 0 ? col('country') : col('region')
  const countryBasis: CountryBasis | null = col('country') >= 0 ? 'herkunft' : iCountry >= 0 ? 'boerse' : null
  const iClass = col('assetClass')

  const data = rows.slice(headerIndex + 1).filter((r) => r.length > iWeight && clean(r[iName] ?? '') !== '')
  const comma = data.some((r) => /^\s*-?\d+,\d+\s*%?\s*$/.test(r[iWeight] ?? ''))
  const holdings: { name: string; sector: string; country: string; micro: number; bp: number }[] = []
  let chinaFixes = 0
  for (const r of data) {
    const micro = weightMicro(r[iWeight] ?? '', comma)
    if (micro === null) {
      // Fußzeilen (Hinweise, Quellen) beenden die Tabelle
      if (holdings.length > 0) break
      continue
    }
    const cash = iClass >= 0 && CASH.test(r[iClass] ?? '')
    const name = clean(r[iName] ?? '').slice(0, MAX_LABEL)
    let country = cash ? CASH_LABEL : iCountry >= 0 ? countryLabel(r[iCountry] ?? '') : 'Ohne Angabe'
    // Börsenplatz-Liste: chinesische Unternehmen mit Notiz im Ausland nach China
    if (countryBasis === 'boerse' && chineseByListing(name, country)) {
      country = 'China'
      chinaFixes++
    }
    holdings.push({
      name,
      sector: cash ? CASH_LABEL : iSector >= 0 ? label(r[iSector] ?? '', SECTOR) : 'Ohne Angabe',
      country,
      micro,
      bp: 0,
    })
  }
  if (holdings.length === 0) throw new HoldingsFileError('Keine Positionen mit Gewichtung gefunden.')

  // Manche Dateien geben Anteile statt Prozent an (Summe ≈ 1); erst dann auf Basispunkte runden
  const fraction = holdings.reduce((s, h) => s + h.micro, 0) <= 1_500_000
  for (const h of holdings) h.bp = Math.round((fraction ? h.micro * 100 : h.micro) / 10_000)
  const total = holdings.reduce((s, h) => s + h.bp, 0)
  if (total < 5_000 || total > 15_000) throw new HoldingsFileError(`Die Gewichte ergeben zusammen ${(total / 100).toFixed(1).replace('.', ',')} % – erwartet sind etwa 100 %.`)

  const countries = new Map<string, number>()
  const sectors = new Map<string, number>()
  for (const h of holdings) {
    countries.set(h.country, (countries.get(h.country) ?? 0) + h.bp)
    sectors.set(h.sector, (sectors.get(h.sector) ?? 0) + h.bp)
  }
  const top = holdings
    .filter((h) => h.sector !== CASH_LABEL)
    .sort((a, b) => b.bp - a.bp)
    .slice(0, MAX_TOP)
    .map((h) => ({ label: h.name, bp: h.bp }))

  // Komplette Liste fein (ppm statt Basispunkte): breite Fonds haben Tausende Titel unter 0,01 %
  const all: Holding[] = holdings
    .filter((h) => h.sector !== CASH_LABEL)
    .map((h): Holding => [h.name, Math.round((fraction ? h.micro * 100 : h.micro) / 100)])
    .filter(([, ppm]) => ppm > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HOLDINGS)

  const fundName = headerIndex > 0 ? (fundNameIn(rows.slice(0, headerIndex)) ?? null) : null
  return { fundName, asOf: findDate(rows.slice(0, headerIndex)), rows: holdings.length, countries: sorted(countries), sectors: sorted(sectors), top, countryBasis, chinaFixes, holdings: all }
}

// ── Durchschau über das ganze Vermögen ──────────────────────────────────────

export interface LookthroughPosition {
  instrumentId: string
  name: string
  kind: 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'metal' | 'other' | 'cash'
  valueCents: number
}

export interface Lookthrough {
  countries: Map<string, number>
  sectors: Map<string, number>
  top: Map<string, number>
  /** Wert der Positionen mit Bestandsliste */
  coveredCents: number
  totalCents: number
}

export const NO_FILE = 'ETF ohne Bestandsliste'
export const KIND_BUCKET: Record<LookthroughPosition['kind'], string> = {
  stock: 'Einzelaktien (ohne Zuordnung)',
  etf: NO_FILE,
  fund: NO_FILE,
  bond: 'Anleihen',
  crypto: 'Krypto',
  metal: 'Edelmetalle',
  other: 'Sonstiges',
  cash: 'Cash',
}

/** Name ohne Rechtsform und Satzzeichen – „APPLE INC“ und „Apple Inc.“ sind derselbe Titel. */
export function titleKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(INC|CORP|CORPORATION|CO|LTD|PLC|AG|SE|SA|NV|N V|AB|ASA|SPA|HOLDINGS?|GROUP|CLASS [A-C]|CL [A-C]|REG|ORD|ADR)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Verteilt den Wert jeder Position auf Länder, Branchen und Einzeltitel:
 * ETFs mit Bestandsliste nach deren Gewichten (Rest = „Nicht zugeordnet“),
 * Werte mit eigener Zuordnung nach dieser, alles andere als eigener Block
 * (Krypto, Edelmetalle, Cash …). Einzelaktien zählen bei den Einzeltiteln
 * mit ihrem eigenen Namen.
 */
/** Eigene Zuordnung eines Werts (Land/Branche), wo keine Bestandsliste hilft */
export interface Classification {
  country: string | null
  sector: string | null
}

/** Arten, denen man selbst Land und Branche geben kann (nicht Krypto, Edelmetall, Cash) */
export const CLASSIFIABLE: ReadonlySet<LookthroughPosition['kind']> = new Set(['stock', 'etf', 'fund', 'bond', 'other'])

type BreakdownInput = Pick<Breakdown, 'countries' | 'sectors' | 'top'> & { holdings?: readonly Holding[] | null }

export function lookThrough(positions: readonly LookthroughPosition[], breakdowns: ReadonlyMap<string, BreakdownInput>, classes: ReadonlyMap<string, Classification> = new Map()): Lookthrough {
  const result: Lookthrough = { countries: new Map(), sectors: new Map(), top: new Map(), coveredCents: 0, totalCents: 0 }
  const add = (map: Map<string, number>, key: string, cents: number) => map.set(key, (map.get(key) ?? 0) + cents)
  const names = new Map<string, string>()

  for (const p of positions) {
    if (p.valueCents <= 0) continue
    result.totalCents += p.valueCents
    const b = breakdowns.get(p.instrumentId)
    if (b && (p.kind === 'etf' || p.kind === 'fund')) {
      result.coveredCents += p.valueCents
      for (const [target, entries] of [
        [result.countries, b.countries],
        [result.sectors, b.sectors],
      ] as const) {
        let used = 0
        for (const e of entries) {
          const cents = Math.round((p.valueCents * e.bp) / 10_000)
          add(target, e.label, cents)
          used += cents
        }
        const rest = p.valueCents - used
        // Rundungscents zum größten Eintrag, echte Lücken (z. B. Liste < 100 %) als eigener Block
        if (Math.abs(rest) > entries.length) add(target, 'Nicht zugeordnet', rest)
        else if (rest !== 0 && entries[0]) add(target, entries[0].label, rest)
      }
      // Komplette Liste, wenn vorhanden – sonst die größten Titel
      const titles: readonly (readonly [string, number])[] = b.holdings?.length ? b.holdings : b.top.map((t) => [t.label, t.bp * 100] as const)
      for (const [name, ppm] of titles) {
        const key = titleKey(name)
        if (!names.has(key)) names.set(key, name)
        add(result.top, key, Math.round((p.valueCents * ppm) / 1_000_000))
      }
      continue
    }
    const bucket = KIND_BUCKET[p.kind]
    const own = CLASSIFIABLE.has(p.kind) ? classes.get(p.instrumentId) : undefined
    add(result.countries, own?.country ?? bucket, p.valueCents)
    add(result.sectors, own?.sector ?? bucket, p.valueCents)
    if (p.kind === 'stock') {
      const key = titleKey(p.name)
      if (!names.has(key)) names.set(key, p.name)
      add(result.top, key, p.valueCents)
    }
  }
  result.top = new Map([...result.top.entries()].map(([k, v]) => [names.get(k) ?? k, v]))
  return result
}

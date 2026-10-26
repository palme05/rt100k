import 'server-only'
import { averageInflation, FALLBACK_INFLATION_BP, parseHicpJsonStat, type InflationInfo } from '@/lib/inflation'
import { providerFetch } from './quotes/fetch'
import { fixtureMode } from './quotes/service'

/**
 * Inflation Österreich (HVPI, Jahresdurchschnitt) von Eurostat. Seit 2026
 * liegt die Reihe in `prc_hicp_ainr` (COICOP 2018), die frühere
 * `prc_hicp_aind` ist eingefroren (bis 2025) – sie dient als Rückfall.
 * Ohne erreichbare Quelle gilt das EZB-Ziel von 2 %. Öffentliche Daten,
 * keine Nutzerdaten in der Anfrage; eine Woche gecacht.
 */
const API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'
export const HICP_SOURCES = [
  `${API}/prc_hicp_ainr?format=JSON&lang=EN&freq=A&unit=RCH_A_AVG&coicop18=TOTAL&geo=AT`,
  `${API}/prc_hicp_aind?format=JSON&lang=EN&freq=A&unit=RCH_A_AVG&coicop=CP00&geo=AT`,
] as const
const TTL = 7 * 86_400

/** Testwerte (E2E/CI): Durchschnitt 2,4 % */
const FIXTURE: InflationInfo = { bp: 240, source: 'eurostat', from: 2016, to: 2025 }

/** Ohne Quelle merkt sich jede Instanz den Ersatzwert eine Stunde (kein Warten bei jedem Aufruf) */
const FALLBACK_TTL_MS = 3_600_000
let fallbackUntil = 0

async function fetchRates(url: string): Promise<Map<number, number> | null> {
  try {
    const rates = parseHicpJsonStat(await providerFetch('Eurostat', url, { revalidate: TTL }))
    if (!rates) console.warn('Eurostat: Antwort im unerwarteten Format')
    return rates
  } catch (error) {
    console.warn('Eurostat nicht erreichbar:', error instanceof Error ? error.message : 'unbekannt')
    return null
  }
}

/** Durchschnitt der letzten zehn vollen Jahre; beide Reihen parallel, die aktuelle hat Vorrang. */
export async function loadInflation(now = new Date()): Promise<InflationInfo> {
  if (fixtureMode()) return FIXTURE
  const fallback: InflationInfo = { bp: FALLBACK_INFLATION_BP, source: 'ziel' }
  if (Date.now() < fallbackUntil) return fallback
  const year = now.getUTCFullYear()
  for (const rates of await Promise.all(HICP_SOURCES.map(fetchRates))) {
    const avg = rates ? averageInflation(rates, year) : null
    if (avg) return { bp: avg.bp, source: 'eurostat', from: avg.from, to: avg.to }
  }
  fallbackUntil = Date.now() + FALLBACK_TTL_MS
  return fallback
}

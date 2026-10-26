import 'server-only'
import { z } from 'zod'
import { assetKey, PREPARE_MAX_ASSETS, PREPARE_MAX_KEYS, type AssetRef } from '@/lib/import/assets'
import type { Actor } from './dal/actor'
import { findImported, MAX_IMPORT_FILES } from './dal/imports'
import { ensureGlobalInstrument, findGlobalInstrumentsByIsin } from './dal/instruments'
import { METALS } from './quotes/parsers'
import { searchCoins, searchInstruments, verifyCandidate } from './quotes/service'
import type { InstrumentCandidate } from './quotes/types'

/**
 * Vorbereitung eines Imports: Instrumente zuordnen und Duplikate melden.
 * Aus dem Browser kommen nur Kennungen (ISIN, Krypto-Symbol, Metall-Code) –
 * Namen und Stammdaten bestätigt der Server beim Kursanbieter.
 */

const assetRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('security'), isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/) }),
  z.object({ kind: z.literal('crypto'), symbol: z.string().regex(/^[A-Z0-9]{2,10}$/) }),
  z.object({ kind: z.literal('metal'), symbol: z.string().regex(/^X(?:AU|AG|PT)$/) }),
])

// Alles vor dem ersten Anbieter-Abruf prüfen – ungültige Anfragen lösen keine externen Abrufe aus
const hex64 = z.string().regex(/^[0-9a-f]{64}$/)
const prepareInput = z.object({
  assets: z.array(assetRef).max(PREPARE_MAX_ASSETS),
  keys: z.array(hex64).max(PREPARE_MAX_KEYS),
  files: z.array(hex64).max(MAX_IMPORT_FILES),
})

/** Bester Börsenplatz für EUR-Anleger: Xetra, dann Frankfurt, Wien, sonst der erste Treffer. */
function bestYahoo(candidates: readonly InstrumentCandidate[]): InstrumentCandidate | null {
  const yahoo = candidates.filter((c) => c.provider === 'yahoo')
  for (const suffix of ['.DE', '.F', '.VI', '.AS', '.MI', '.PA']) {
    const hit = yahoo.find((c) => c.key.endsWith(suffix))
    if (hit) return hit
  }
  return yahoo[0] ?? null
}

async function resolve(a: AssetRef, known: Map<string, { id: string; name: string }>): Promise<{ id: string; name: string } | null> {
  if (a.kind === 'security') {
    const existing = known.get(a.isin)
    if (existing) return existing
    const candidate = bestYahoo(await searchInstruments(a.isin))
    const verified = candidate ? await verifyCandidate('yahoo', candidate.key, a.isin) : null
    return verified ? ensureGlobalInstrument(verified) : null
  }
  if (a.kind === 'metal') {
    const metal = METALS.find((m) => m.key === a.symbol)
    const verified = metal ? await verifyCandidate('metal', metal.key, null) : null
    return verified ? ensureGlobalInstrument(verified) : null
  }
  // Krypto: exakter Symbol-Treffer mit dem besten Rang (CoinGecko liefert sortiert). Nur eine
  // Anfrage je Coin: der Treffer kommt vom Server selbst, eine zweite Prüfung brächte nichts –
  // doppelte Abrufe ließen längere Bitpanda-Verläufe ins Abfragelimit von CoinGecko laufen
  const coin = (await searchCoins(a.symbol)).find((c) => c.detail.split(' · ')[0] === a.symbol && /^[a-z0-9-]{1,80}$/.test(c.key))
  return coin ? ensureGlobalInstrument({ kind: 'crypto', name: coin.name, isin: null, symbol: null, coingeckoId: coin.key, metal: null, currency: 'EUR' }) : null
}

const RESOLVE_ATTEMPTS = 2
const RETRY_PAUSE_MS = 800
const BUDGET_MS = 40_000
const RETRY_BUDGET_MS = 25_000

export interface PreparedImport {
  instruments: Record<string, { id: string; name: string } | null>
  duplicateKeys: string[]
  knownFiles: string[]
}

export async function prepareImport(actor: Actor, input: unknown): Promise<PreparedImport> {
  const { assets, keys, files } = prepareInput.parse(input)
  const unique = [...new Map(assets.map((a) => [assetKey(a), a])).values()]
  const byIsin = await findGlobalInstrumentsByIsin(unique.flatMap((a) => (a.kind === 'security' ? [a.isin] : [])))
  const known = new Map([...byIsin].map(([isin, i]) => [isin, { id: i.id, name: i.name }]))
  const instruments: PreparedImport['instruments'] = {}
  // Nacheinander, um die Kursanbieter nicht mit parallelen Anfragen zu belasten. Bei
  // vielen Wertpapieren bremst Yahoo gelegentlich – dann ein zweiter Versuch nach kurzer Pause.
  // Zeitbudget unter der Laufzeitgrenze der Seite (60 s): danach bleibt der Rest „nicht zugeordnet“
  const started = Date.now()
  const elapsed = () => Date.now() - started
  for (const a of unique) {
    let hit: { id: string; name: string } | null = null
    for (let attempt = 0; attempt < RESOLVE_ATTEMPTS && !hit && elapsed() < (attempt === 0 ? BUDGET_MS : RETRY_BUDGET_MS); attempt++) {
      if (attempt > 0) await new Promise((done) => setTimeout(done, RETRY_PAUSE_MS))
      try {
        hit = await resolve(a, known)
      } catch {
        hit = null
      }
    }
    instruments[assetKey(a)] = hit ? { id: hit.id, name: hit.name } : null
  }
  const imported = await findImported(actor, keys, files)
  return { instruments, duplicateKeys: [...imported.keys], knownFiles: [...imported.files] }
}

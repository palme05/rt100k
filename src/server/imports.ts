import 'server-only'
import { z } from 'zod'
import { assetKey, PREPARE_MAX_ASSETS, PREPARE_MAX_KEYS, type AssetRef } from '@/lib/import/assets'
import type { Actor } from './dal/actor'
import { findImported, MAX_IMPORT_FILES } from './dal/imports'
import { ensureGlobalInstrument, findGlobalInstrumentsByIsin } from './dal/instruments'
import { METALS } from './quotes/parsers'
import { searchInstruments, verifyCandidate } from './quotes/service'
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
  // Krypto: exakter Symbol-Treffer mit dem besten Rang (CoinGecko liefert sortiert)
  const coin = (await searchInstruments(a.symbol)).find((c) => c.provider === 'coingecko' && c.detail.split(' · ')[0] === a.symbol)
  const verified = coin ? await verifyCandidate('coingecko', coin.key, null) : null
  return verified ? ensureGlobalInstrument(verified) : null
}

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
  // Nacheinander, um die Kursanbieter nicht mit parallelen Anfragen zu belasten
  for (const a of unique) {
    try {
      const hit = await resolve(a, known)
      instruments[assetKey(a)] = hit ? { id: hit.id, name: hit.name } : null
    } catch {
      instruments[assetKey(a)] = null
    }
  }
  const imported = await findImported(actor, keys, files)
  return { instruments, duplicateKeys: [...imported.keys], knownFiles: [...imported.files] }
}

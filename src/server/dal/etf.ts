import 'server-only'
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { z } from 'zod'
import { MAX_ENTRIES, MAX_HOLDINGS, MAX_LABEL, MAX_TOP, type Breakdown, type Holding, type WeightEntry } from '@/lib/lookthrough'
import { withUser } from '../db/client'
import { etfBreakdown } from '../db/schema'
import type { Actor } from './actor'
import { ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument } from './instruments'

/** Zusammengefasste Bestandsliste je ETF – nur für den eigenen Nutzer. */
export interface EtfBreakdownDto extends Omit<Breakdown, 'rows'> {
  instrumentId: string
  rows: number
  /** komplette Titelliste gespeichert (auch wenn nicht mitgeladen) */
  hasHoldings: boolean
}

const label = z
  .string()
  .min(1)
  .max(MAX_LABEL)
  .regex(/^[^\u0000-\u001f\u007f]+$/)
const entry = z.object({ label, bp: z.number().int().min(-10_000).max(10_000) })
const list = z.array(entry).max(MAX_ENTRIES)
/** Komplette Liste: [Name, ppm] – Gewicht 0,0001 % bis 100 % */
const holdings = z.array(z.tuple([label, z.number().int().min(1).max(1_000_000)])).max(MAX_HOLDINGS)
const total = (entries: readonly WeightEntry[]) => entries.reduce((s, e) => s + e.bp, 0)

/** Inhalt einer Bestandsliste (ohne Instrument) – auch für Backups. */
export const breakdownData = z.object({
  fundName: z
    .string()
    .max(120)
    .regex(/^[^\u0000-\u001f\u007f]*$/)
    .nullable(),
  asOf: z.iso.date().nullable(),
  rows: z.number().int().min(1).max(20_000),
  countries: list.refine((l) => total(l) >= 5_000 && total(l) <= 15_000, 'Die Ländergewichte müssen etwa 100 % ergeben.'),
  sectors: list.refine((l) => total(l) >= 5_000 && total(l) <= 15_000, 'Die Branchengewichte müssen etwa 100 % ergeben.'),
  top: z.array(entry).max(MAX_TOP),
  // ältere Listen und Backups kennen diese Felder noch nicht
  countryBasis: z.enum(['herkunft', 'boerse']).nullable().default(null),
  chinaFixes: z.number().int().min(0).max(20_000).default(0),
  holdings: holdings.default([]),
})

const input = breakdownData.extend({ instrumentId: z.unknown() })

/** Bestandsliste für ein sichtbares ETF/einen Fonds speichern (ersetzt die vorherige). */
export async function saveEtfBreakdown(actor: Actor, value: unknown): Promise<void> {
  const parsed = input.safeParse(value)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Bestandsliste.')
  const { instrumentId, ...data } = parsed.data
  await withUser(actor.id, async (tx) => {
    const instrument = await getInstrument(actor, instrumentId, tx)
    if (instrument.kind !== 'etf' && instrument.kind !== 'fund') throw new ValidationError('Eine Bestandsliste gibt es nur für ETFs und Fonds.')
    const row = { ...data, holdings: data.holdings.length > 0 ? data.holdings : null }
    await tx
      .insert(etfBreakdown)
      .values({ ownerId: actor.id, instrumentId: instrument.id, ...row })
      .onConflictDoUpdate({ target: [etfBreakdown.ownerId, etfBreakdown.instrumentId], set: { ...row, updatedAt: new Date() } })
  })
}

const stored = z.object({ countries: list, sectors: list, top: z.array(entry).max(MAX_TOP), holdings: holdings.nullable() })

/**
 * Bestandslisten des Nutzers. Die komplette Titelliste (bis 12.000 Einträge)
 * nur mit `{ holdings: true }` – die Analyse-Seite braucht sie nicht.
 */
export async function listEtfBreakdowns(actor: Actor, options: { holdings?: boolean } = {}): Promise<Map<string, EtfBreakdownDto>> {
  const { holdings: full, ...columns } = getTableColumns(etfBreakdown)
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({ ...columns, holdings: options.holdings ? full : sql<null>`null`, hasHoldings: sql<boolean>`${full} is not null` })
      .from(etfBreakdown)
      .where(eq(etfBreakdown.ownerId, actor.id)),
  )
  const out = new Map<string, EtfBreakdownDto>()
  for (const r of rows) {
    // Auch beim Lesen prüfen: gespeicherte JSON-Daten gelten nicht als vertrauenswürdig
    const data = stored.safeParse({ countries: r.countries, sectors: r.sectors, top: r.top, holdings: r.holdings })
    if (!data.success) continue
    const basis = r.countryBasis === 'herkunft' || r.countryBasis === 'boerse' ? r.countryBasis : null
    out.set(r.instrumentId, {
      instrumentId: r.instrumentId,
      fundName: r.fundName,
      asOf: r.asOf,
      rows: r.rows,
      countryBasis: basis,
      chinaFixes: r.chinaFixes,
      hasHoldings: r.hasHoldings,
      ...data.data,
      holdings: (data.data.holdings ?? []) as Holding[],
    })
  }
  return out
}

export async function deleteEtfBreakdown(actor: Actor, instrumentId: unknown): Promise<void> {
  const id = parseId(instrumentId)
  await withUser(actor.id, (tx) => tx.delete(etfBreakdown).where(and(eq(etfBreakdown.ownerId, actor.id), eq(etfBreakdown.instrumentId, id))))
}

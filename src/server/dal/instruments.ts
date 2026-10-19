import 'server-only'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { getDb, withUser, type Tx } from '../db/client'
import { instrument, type InstrumentKind } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError } from './errors'
import { parseId } from './ids'

/** Stammdaten eines Instruments, wie sie die UI und der Kursdienst brauchen. */
export interface InstrumentDto {
  id: string
  kind: InstrumentKind
  name: string
  isin: string | null
  symbol: string | null
  coingeckoId: string | null
  metal: string | null
  currency: string
  /** privat angelegt (z. B. nicht handelbares Asset) */
  private: boolean
}

const columns = {
  id: instrument.id,
  kind: instrument.kind,
  name: instrument.name,
  isin: instrument.isin,
  symbol: instrument.symbol,
  coingeckoId: instrument.coingeckoId,
  metal: instrument.metal,
  currency: instrument.currency,
  ownerId: instrument.ownerId,
}

type Row = Pick<typeof instrument.$inferSelect, keyof typeof columns>

function toDto(row: Row): InstrumentDto {
  const { ownerId, ...rest } = row
  return { ...rest, private: ownerId !== null }
}

const visibleTo = (actor: Actor) => or(isNull(instrument.ownerId), eq(instrument.ownerId, actor.id))

export async function getInstrument(actor: Actor, id: unknown, tx?: Tx): Promise<InstrumentDto> {
  const instrumentId = parseId(id)
  const run = (t: Tx) =>
    t
      .select(columns)
      .from(instrument)
      .where(and(eq(instrument.id, instrumentId), visibleTo(actor)))
      .limit(1)
  const [row] = tx ? await run(tx) : await withUser(actor.id, run)
  if (!row) throw new NotFoundError('Instrument nicht gefunden.')
  return toDto(row)
}

export async function getInstruments(actor: Actor, ids: readonly string[]): Promise<InstrumentDto[]> {
  if (ids.length === 0) return []
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select(columns)
      .from(instrument)
      .where(and(inArray(instrument.id, [...new Set(ids.map(parseId))]), visibleTo(actor))),
  )
  return rows.map(toDto)
}

/** Vom Kursanbieter bestätigte Stammdaten (nie direkt aus Formularen). */
export interface VerifiedInstrument {
  kind: InstrumentKind
  name: string
  isin: string | null
  symbol: string | null
  coingeckoId: string | null
  metal: string | null
  currency: string
}

/**
 * Legt allgemeine Stammdaten an oder findet sie. Nur mit Daten, die der Server
 * selbst beim Kursanbieter abgefragt hat – so kann niemand Namen oder Symbole
 * für andere Nutzer verfälschen.
 */
export async function ensureGlobalInstrument(data: VerifiedInstrument): Promise<InstrumentDto> {
  const db = getDb()
  const key = data.symbol
    ? eq(instrument.symbol, data.symbol)
    : data.coingeckoId
      ? eq(instrument.coingeckoId, data.coingeckoId)
      : data.metal
        ? eq(instrument.metal, data.metal)
        : null
  if (!key) throw new Error('Instrument ohne Kennung')

  const find = async () => {
    const [row] = await db.select(columns).from(instrument).where(and(isNull(instrument.ownerId), key)).limit(1)
    return row
  }
  const existing = await find()
  if (existing) return toDto(existing)
  await db.insert(instrument).values({ ...data, ownerId: null }).onConflictDoNothing()
  const created = await find()
  if (!created) throw new Error('Instrument konnte nicht angelegt werden.')
  return toDto(created)
}

/** Alle allgemeinen Instrumente mit Symbol (für den täglichen Kursabruf). */
export async function listGlobalInstruments(): Promise<InstrumentDto[]> {
  const rows = await getDb().select(columns).from(instrument).where(isNull(instrument.ownerId))
  return rows.map(toDto)
}

import 'server-only'
import { and, asc, count, eq, inArray, max, ne } from 'drizzle-orm'
import { z } from 'zod'
import { withUser } from '../db/client'
import { booking, csvMapping, IMPORT_SOURCES, importFile, BOOKING_TYPES } from '../db/schema'
import type { Actor } from './actor'
import { recordAudit } from './audit'
import { assertBookingRoom, assertConsistent, conflictingInstruments, ledgerBookings, normalizeBooking, ownedPortfolio } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument } from './instruments'

/**
 * Import: übernimmt im Browser erkannte Buchungen. Dem Browser wird nichts
 * geglaubt, was er nicht beweisen kann – jede Zeile läuft durch dieselbe
 * Prüfung wie eine manuelle Buchung, Depot und Instrumente müssen dem Nutzer
 * gehören bzw. für ihn sichtbar sein. Duplikate erkennt die Datenbank über
 * `(owner_id, import_key)`.
 */

export const MAX_IMPORT_BOOKINGS = 500
export const MAX_IMPORT_FILES = 50
export const MAX_CSV_MAPPINGS = 50

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'Ungültiger Schlüssel.')

const importItem = z.object({
  importKey: hex64,
  type: z.enum(BOOKING_TYPES),
  occurredOn: z.iso.date(),
  instrumentId: z.string().nullable(),
  quantity: z.string().max(40).nullable(),
  factor: z.string().max(40).nullable().optional(),
  amountCents: z.number().int().min(0).max(100_000_000_000),
  feeCents: z.number().int().min(0).max(100_000_000_000),
  taxCents: z.number().int().min(0).max(100_000_000_000),
  note: z.string().max(500).nullable(),
})

const importInput = z.object({
  portfolioId: z.string(),
  files: z.array(z.object({ hash: hex64, source: z.enum(IMPORT_SOURCES), bookings: z.number().int().min(0).max(MAX_IMPORT_BOOKINGS) })).max(MAX_IMPORT_FILES),
  items: z.array(importItem).min(1, 'Keine Buchungen ausgewählt.').max(MAX_IMPORT_BOOKINGS, `Höchstens ${MAX_IMPORT_BOOKINGS} Buchungen auf einmal.`),
})

export type ImportItem = z.infer<typeof importItem>
export type ImportInput = z.input<typeof importInput>

function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

/** Welche Import-Schlüssel und Dateien der Nutzer schon hat. */
export async function findImported(actor: Actor, keys: readonly string[], fileHashes: readonly string[]): Promise<{ keys: Set<string>; files: Set<string> }> {
  const k = z.array(hex64).max(MAX_IMPORT_BOOKINGS * 2).parse(keys)
  const f = z.array(hex64).max(MAX_IMPORT_FILES).parse(fileHashes)
  return withUser(actor.id, async (tx) => {
    const existing =
      k.length === 0
        ? []
        : await tx
            .select({ key: booking.importKey })
            .from(booking)
            .where(and(eq(booking.ownerId, actor.id), inArray(booking.importKey, k)))
    const files =
      f.length === 0
        ? []
        : await tx
            .select({ hash: importFile.fileHash })
            .from(importFile)
            .where(and(eq(importFile.ownerId, actor.id), inArray(importFile.fileHash, f)))
    return { keys: new Set(existing.map((r) => r.key).filter((v): v is string => !!v)), files: new Set(files.map((r) => r.hash)) }
  })
}

/** Zeitpunkt des letzten Datei-Imports des Nutzers (für die monatliche Erinnerung), sonst null. */
export async function lastImportAt(actor: Actor): Promise<Date | null> {
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select({ at: max(importFile.createdAt) })
      .from(importFile)
      .where(eq(importFile.ownerId, actor.id)),
  )
  return row?.at ?? null
}

/** Mit diesen Instrumenten würde der Bestand negativ (z. B. fehlender Split oder Depotübertrag). */
export class ImportConflictError extends ValidationError {
  constructor(readonly instrumentIds: string[]) {
    super('Damit wäre der Bestand an einem Tag negativ (Verkauf oder Übertrag höher als der Bestand).', 'quantity')
    this.name = 'ImportConflictError'
  }
}

export async function importBookings(actor: Actor, input: unknown): Promise<{ created: number; duplicates: number }> {
  const parsed = importInput.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Ungültige Import-Daten.', issue?.path.join('.'))
  }
  const { files, items } = parsed.data
  const portfolioId = parseId(parsed.data.portfolioId)

  // Jede Zeile wie eine manuelle Buchung prüfen (Pflichtfelder je Typ, Datum, Beträge)
  const normalized = items.map((item, index) => {
    try {
      return {
        importKey: item.importKey,
        ...normalizeBooking({
          portfolioId,
          type: item.type,
          occurredOn: item.occurredOn,
          instrumentId: item.instrumentId,
          quantity: item.quantity,
          factor: item.factor ?? null,
          amount: centsToInput(item.amountCents),
          fee: centsToInput(item.feeCents),
          tax: centsToInput(item.taxCents),
          note: item.note,
        }),
      }
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) throw new ValidationError(`Zeile ${index + 1}: ${error.message}`, error instanceof ValidationError ? error.field : undefined)
      throw error
    }
  })

  return withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, portfolioId, { lock: true })
    for (const id of new Set(normalized.map((n) => n.instrumentId).filter((v): v is string => !!v))) await getInstrument(actor, id, tx)

    const keys = normalized.map((n) => n.importKey)
    const existing = new Set(
      (await tx
        .select({ key: booking.importKey })
        .from(booking)
        .where(and(eq(booking.ownerId, actor.id), inArray(booking.importKey, keys)))).map((r) => r.key),
    )
    const seen = new Set<string>()
    const fresh = normalized.filter((n) => {
      if (existing.has(n.importKey) || seen.has(n.importKey)) return false
      seen.add(n.importKey)
      return true
    })

    if (fresh.length > 0) {
      await assertBookingRoom(tx, actor, fresh.length)
      const current = await ledgerBookings(tx, actor, portfolioId)
      const sorted = [...fresh].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0))
      const combined = [...current, ...sorted.map((n, i) => ({ id: `import-${i}`, ...n }))]
      const conflicts = conflictingInstruments(combined)
      if (conflicts.length > 0) throw new ImportConflictError(conflicts)
      assertConsistent(combined)
      await tx.insert(booking).values(sorted.map((n) => ({ ...n, portfolioId, ownerId: actor.id, source: 'import' })))
    }
    if (files.length > 0) {
      await tx
        .insert(importFile)
        .values(files.map((f) => ({ ownerId: actor.id, fileHash: f.hash, source: f.source, bookings: f.bookings })))
        .onConflictDoNothing()
    }
    return { created: fresh.length, duplicates: normalized.length - fresh.length }
  })
}

/**
 * Löscht alle importierten Buchungen eines Depots; von Hand erfasste bleiben.
 * Brauchen diese Stück aus dem Import (z. B. ein Verkauf), bricht es ab. Gibt
 * es danach im ganzen Konto keine importierten Buchungen mehr, werden auch die
 * gemerkten Datei-Prüfsummen gelöscht – die Dateien gelten dann wieder als neu.
 */
export async function deleteImportedBookings(actor: Actor, portfolioId: unknown): Promise<number> {
  const id = parseId(portfolioId)
  const imported = and(eq(booking.portfolioId, id), eq(booking.ownerId, actor.id), eq(booking.source, 'import'))
  const deleted = await withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, id, { lock: true })
    const ids = new Set((await tx.select({ id: booking.id }).from(booking).where(imported)).map((r) => r.id))
    if (ids.size === 0) return 0
    try {
      assertConsistent((await ledgerBookings(tx, actor, id)).filter((b) => !ids.has(b.id)))
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError('Von Hand erfasste Buchungen in diesem Depot brauchen Stück aus dem Import (z. B. ein Verkauf). Bitte diese zuerst löschen.')
      throw error
    }
    const rows = await tx.delete(booking).where(imported).returning({ id: booking.id })
    const [left] = await tx
      .select({ n: count() })
      .from(booking)
      .where(and(eq(booking.ownerId, actor.id), eq(booking.source, 'import')))
    if (left?.n === 0) await tx.delete(importFile).where(eq(importFile.ownerId, actor.id))
    return rows.length
  })
  if (deleted > 0) await recordAudit({ userId: actor.id, actorId: actor.id, type: 'imports_deleted', detail: { portfolioId: id, bookings: deleted } })
  return deleted
}

// ── Gespeicherte CSV-Zuordnungen ────────────────────────────────────────────

const column = z.number().int().min(0).max(200)
export const csvMappingSchema = z.object({
  date: column,
  dateFormat: z.enum(['dmy', 'ymd', 'mdy']),
  kind: column.nullable(),
  fixedKind: z.enum(['buy', 'sell', 'dividend', 'interest', 'tax', 'fee', 'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'staking', 'age', 'tax_refund']).nullable(),
  isin: column.nullable(),
  name: column.nullable(),
  symbol: column.nullable(),
  assetKind: z.enum(['security', 'crypto']),
  quantity: column.nullable(),
  amount: column,
  fee: column.nullable(),
  tax: column.nullable(),
  numberStyle: z.enum(['de', 'en']),
})

export interface CsvMappingDto {
  id: string
  name: string
  mapping: z.infer<typeof csvMappingSchema>
}

const mappingName = z.string().trim().min(1, 'Bitte einen Namen angeben.').max(60, 'Name: höchstens 60 Zeichen.')

export async function listCsvMappings(actor: Actor): Promise<CsvMappingDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx.select({ id: csvMapping.id, name: csvMapping.name, mapping: csvMapping.mapping }).from(csvMapping).where(eq(csvMapping.ownerId, actor.id)).orderBy(asc(csvMapping.name)),
  )
  // Gespeicherte Daten erneut prüfen, nie blind weiterreichen
  return rows.flatMap((r) => {
    const m = csvMappingSchema.safeParse(r.mapping)
    return m.success ? [{ id: r.id, name: r.name, mapping: m.data }] : []
  })
}

/** Speichert unter einem Namen; gleicher Name überschreibt die eigene Zuordnung. */
export async function saveCsvMapping(actor: Actor, input: { name: unknown; mapping: unknown }): Promise<CsvMappingDto> {
  const name = mappingName.safeParse(input.name)
  if (!name.success) throw new ValidationError(name.error.issues[0]?.message ?? 'Ungültiger Name.', 'name')
  const mapping = csvMappingSchema.safeParse(input.mapping)
  if (!mapping.success) throw new ValidationError('Ungültige Zuordnung.', 'mapping')
  return withUser(actor.id, async (tx) => {
    const [existing] = await tx.select({ n: count() }).from(csvMapping).where(and(eq(csvMapping.ownerId, actor.id), ne(csvMapping.name, name.data)))
    if ((existing?.n ?? 0) >= MAX_CSV_MAPPINGS) throw new ValidationError(`Höchstens ${MAX_CSV_MAPPINGS} gespeicherte Zuordnungen.`, 'name')
    const [row] = await tx
      .insert(csvMapping)
      .values({ ownerId: actor.id, name: name.data, mapping: mapping.data })
      .onConflictDoUpdate({ target: [csvMapping.ownerId, csvMapping.name], set: { mapping: mapping.data, updatedAt: new Date() } })
      .returning({ id: csvMapping.id, name: csvMapping.name })
    if (!row) throw new Error('Zuordnung konnte nicht gespeichert werden.')
    return { id: row.id, name: row.name, mapping: mapping.data }
  })
}

export async function deleteCsvMapping(actor: Actor, id: unknown): Promise<void> {
  const mappingId = parseId(id)
  await withUser(actor.id, async (tx) => {
    const deleted = await tx
      .delete(csvMapping)
      .where(and(eq(csvMapping.id, mappingId), eq(csvMapping.ownerId, actor.id)))
      .returning({ id: csvMapping.id })
    if (deleted.length === 0) throw new NotFoundError('Zuordnung nicht gefunden.')
  })
}

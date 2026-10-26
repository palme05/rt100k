import 'server-only'
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { toCsv, csvAmount, type CsvValue } from '@/lib/csv-export'
import { viennaDay } from '@/lib/format'
import { computeLedger, LedgerError, type LedgerBooking } from '@/lib/holdings'
import { formatQuantity, quantityFromDb } from '@/lib/quantity'
import { withUser, type Tx } from '../db/client'
import {
  ALLOCATION_KINDS,
  allocationTarget,
  auditEvent,
  booking,
  BOOKING_TYPES,
  csvMapping,
  etfBreakdown,
  goal,
  goalPortfolio,
  importFile,
  instrument,
  INSTRUMENT_KINDS,
  portfolio,
  PORTFOLIO_KINDS,
  portfolioSnapshot,
  roadSettings,
  user,
  watchlistItem,
} from '../db/schema'
import type { Actor } from './actor'
import { normalizeBooking } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { breakdownData } from './etf'

/**
 * Vollständiger Export der eigenen Daten (JSON, Buchungen zusätzlich als CSV)
 * und Wiederherstellen eines eigenen Backups in ein leeres Konto.
 * Nie enthalten: Passwort-Hash, TOTP-Geheimnis, Passkeys, Sitzungen.
 * Beim Wiederherstellen gilt das Backup als nicht vertrauenswürdig: jede
 * Buchung läuft durch dieselbe Prüfung wie im Formular, allgemeine
 * Stammdaten werden nur gefunden, nie angelegt.
 */

export const BACKUP_FORMAT = 'rt100k-backup'
export const BACKUP_VERSION = 1
/** Obergrenzen beim Wiederherstellen (Speicher- und Laufzeitschutz) */
export const RESTORE_LIMITS = { bytes: 10 * 1024 * 1024, portfolios: 200, instruments: 5_000, bookings: 50_000, snapshots: 100_000 } as const

const noControl = /^[^\u0000-\u001f\u007f]*$/
const text = (max: number) => z.string().max(max).regex(noControl)
const cents = z.number().int().min(0).max(100_000_000_000)
const signedCents = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000)
const decimal = z.string().regex(/^\d{1,18}(\.\d{1,12})?$/)
const hex64 = z.string().regex(/^[0-9a-f]{64}$/)

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  portfolios: z
    .array(
      z.object({
        id: z.uuid(),
        name: text(80).min(1),
        kind: z.enum(PORTFOLIO_KINDS),
        broker: text(80).nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        taxSimple: z.boolean(),
        archived: z.boolean(),
      }),
    )
    .max(RESTORE_LIMITS.portfolios),
  instruments: z
    .array(
      z.object({
        id: z.uuid(),
        kind: z.enum(INSTRUMENT_KINDS),
        name: text(120).min(1),
        isin: z
          .string()
          .regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/)
          .nullable(),
        symbol: text(40).nullable(),
        coingeckoId: text(100).nullable(),
        metal: z.enum(['XAU', 'XAG', 'XPT', 'XPD']).nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        private: z.boolean(),
      }),
    )
    .max(RESTORE_LIMITS.instruments),
  bookings: z
    .array(
      z.object({
        portfolioId: z.uuid(),
        type: z.enum(BOOKING_TYPES),
        occurredOn: z.iso.date(),
        instrumentId: z.uuid().nullable(),
        quantity: decimal.nullable(),
        factor: decimal.nullable(),
        amountCents: cents,
        feeCents: cents,
        taxCents: cents,
        note: text(500).nullable(),
        importKey: hex64.nullable(),
        /** „Kurs stimmt – trotzdem speichern“ (ältere Backups ohne Feld: nein) */
        priceConfirmed: z.boolean().optional().default(false),
      }),
    )
    .max(RESTORE_LIMITS.bookings),
  snapshots: z
    .array(z.object({ portfolioId: z.uuid(), day: z.iso.date(), valueCents: signedCents, investedCents: signedCents }))
    .max(RESTORE_LIMITS.snapshots),
  importFiles: z
    .array(z.object({ fileHash: hex64, source: z.enum(['traderepublic', 'flatex', 'bitpanda', 'csv']), bookings: z.number().int().min(0).max(100_000) }))
    .max(10_000),
  road: z
    .object({
      targetCents: z.number().int().min(1).max(100_000_000_000),
      monthlyContributionCents: z.number().int().min(0).max(10_000_000),
      expectedReturnBp: z.number().int().min(-2000).max(3000),
      volatilityBp: z.number().int().min(0).max(10_000),
      includeTangibles: z.boolean(),
    })
    .nullable(),
  allocationTargets: z
    .array(z.object({ kind: z.enum(ALLOCATION_KINDS), bp: z.number().int().min(1).max(10_000) }))
    .max(ALLOCATION_KINDS.length)
    .refine((l) => l.length === 0 || l.reduce((s, t) => s + t.bp, 0) === 10_000, 'Die Zielaufteilung muss 100 % ergeben.'),
  etfBreakdowns: z.array(breakdownData.extend({ instrumentId: z.uuid() })).max(500),
  /** Eigene Ziele (ältere Backups ohne Feld: keine) */
  goals: z
    .array(
      z.object({
        name: text(60).min(1),
        targetCents: z.number().int().min(1).max(100_000_000_000),
        targetDate: z.iso.date().nullable(),
        monthlyCents: cents.nullable(),
        returnBp: z.number().int().min(-2000).max(3000).nullable(),
        scope: z.enum(['all', 'selected']),
        portfolioIds: z.array(z.uuid()).max(RESTORE_LIMITS.portfolios),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  /** Watchlist (ältere Backups ohne Feld: leer) */
  watchlist: z
    .array(z.object({ instrumentId: z.uuid(), note: text(200).nullable() }))
    .max(100)
    .optional()
    .default([]),
})

export type Backup = z.infer<typeof backupSchema> & {
  exportedAt: string
  profile: { name: string; email: string }
  csvMappings: { name: string; mapping: unknown }[]
  auditEvents: { type: string; createdAt: string; ip: string | null; userAgent: string | null }[]
}

/** Alle eigenen Daten als Backup-Objekt. */
export async function exportBackup(actor: Actor): Promise<Backup> {
  return withUser(actor.id, async (tx) => {
    const [profile] = await tx.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, actor.id)).limit(1)
    if (!profile) throw new NotFoundError('Konto nicht gefunden.')
    const portfolios = await tx.select().from(portfolio).where(eq(portfolio.ownerId, actor.id)).orderBy(portfolio.createdAt)
    const bookings = await tx.select().from(booking).where(eq(booking.ownerId, actor.id)).orderBy(booking.occurredOn, booking.createdAt)
    const snapshots = await tx.select().from(portfolioSnapshot).where(eq(portfolioSnapshot.ownerId, actor.id)).orderBy(portfolioSnapshot.day)
    const files = await tx.select().from(importFile).where(eq(importFile.ownerId, actor.id))
    const [road] = await tx.select().from(roadSettings).where(eq(roadSettings.ownerId, actor.id)).limit(1)
    const targets = await tx.select().from(allocationTarget).where(eq(allocationTarget.ownerId, actor.id))
    const breakdowns = await tx.select().from(etfBreakdown).where(eq(etfBreakdown.ownerId, actor.id))
    const mappings = await tx.select().from(csvMapping).where(eq(csvMapping.ownerId, actor.id))
    const events = await tx.select().from(auditEvent).where(eq(auditEvent.userId, actor.id)).orderBy(auditEvent.createdAt)
    const goals = await tx.select().from(goal).where(eq(goal.ownerId, actor.id)).orderBy(goal.createdAt)
    const goalLinks = await tx.select().from(goalPortfolio).where(eq(goalPortfolio.ownerId, actor.id))
    const watched = await tx.select().from(watchlistItem).where(eq(watchlistItem.ownerId, actor.id))

    const ids = [...new Set([...bookings.map((b) => b.instrumentId), ...breakdowns.map((b) => b.instrumentId), ...watched.map((w) => w.instrumentId)].filter((id): id is string => Boolean(id)))]
    const instruments = ids.length
      ? await tx
          .select()
          .from(instrument)
          .where(and(inArray(instrument.id, ids), or(isNull(instrument.ownerId), eq(instrument.ownerId, actor.id))))
      : []

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      profile,
      portfolios: portfolios.map((p) => ({ id: p.id, name: p.name, kind: p.kind, broker: p.broker, currency: p.currency, taxSimple: p.taxSimple, archived: p.archivedAt !== null })),
      instruments: instruments.map((i) => ({ id: i.id, kind: i.kind, name: i.name, isin: i.isin, symbol: i.symbol, coingeckoId: i.coingeckoId, metal: (i.metal as 'XAU' | null) ?? null, currency: i.currency, private: i.ownerId !== null })),
      bookings: bookings.map((b) => ({
        portfolioId: b.portfolioId,
        type: b.type,
        occurredOn: b.occurredOn,
        instrumentId: b.instrumentId,
        quantity: b.quantity,
        factor: b.factor,
        amountCents: b.amountCents,
        feeCents: b.feeCents,
        taxCents: b.taxCents,
        note: b.note,
        importKey: b.importKey,
        priceConfirmed: b.priceConfirmed,
      })),
      snapshots: snapshots.map((s) => ({ portfolioId: s.portfolioId, day: s.day, valueCents: s.valueCents, investedCents: s.investedCents })),
      importFiles: files.map((f) => ({ fileHash: f.fileHash, source: f.source as 'csv', bookings: f.bookings })),
      road: road ? { targetCents: road.targetCents, monthlyContributionCents: road.monthlyContributionCents, expectedReturnBp: road.expectedReturnBp, volatilityBp: road.volatilityBp, includeTangibles: road.includeTangibles } : null,
      allocationTargets: targets.map((t) => ({ kind: t.kind as (typeof ALLOCATION_KINDS)[number], bp: t.targetBp })),
      etfBreakdowns: breakdowns.map((b) => ({
        instrumentId: b.instrumentId,
        fundName: b.fundName,
        asOf: b.asOf,
        rows: b.rows,
        countries: b.countries as never,
        sectors: b.sectors as never,
        top: b.top as never,
      })),
      goals: goals.map((g) => ({
        name: g.name,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
        monthlyCents: g.monthlyCents,
        returnBp: g.returnBp,
        scope: g.scope,
        portfolioIds: goalLinks.filter((l) => l.goalId === g.id).map((l) => l.portfolioId),
      })),
      // nur sichtbare Instrumente (mit dem Export oben gleich)
      watchlist: watched.filter((w) => instruments.some((i) => i.id === w.instrumentId)).map((w) => ({ instrumentId: w.instrumentId, note: w.note })),
      csvMappings: mappings.map((m) => ({ name: m.name, mapping: m.mapping })),
      auditEvents: events.map((e) => ({ type: e.type, createdAt: e.createdAt.toISOString(), ip: e.ip, userAgent: e.userAgent })),
    }
  })
}

const TYPE_LABEL: Record<(typeof BOOKING_TYPES)[number], string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer',
  deposit: 'Einzahlung',
  withdrawal: 'Auszahlung',
  transfer_in: 'Übertrag ein',
  transfer_out: 'Übertrag aus',
  split: 'Split',
  staking: 'Staking',
  age: 'AGE',
  tax_refund: 'Steuergutschrift',
}

/** Buchungen als CSV für Excel/LibreOffice (Formel-Schutz über csv-export). */
export function bookingsCsv(backup: Backup): string {
  const portfolioName = new Map(backup.portfolios.map((p) => [p.id, p.name]))
  const instruments = new Map(backup.instruments.map((i) => [i.id, i]))
  const qty = (v: string | null) => (v ? formatQuantity(quantityFromDb(v), 12) : null)
  const rows: CsvValue[][] = [
    ['Datum', 'Depot', 'Art', 'Wertpapier', 'ISIN', 'Stück', 'Faktor', 'Betrag', 'Gebühr', 'Steuer', 'Notiz'],
    ...backup.bookings.map((b) => {
      const i = b.instrumentId ? instruments.get(b.instrumentId) : undefined
      return [b.occurredOn, portfolioName.get(b.portfolioId) ?? '', TYPE_LABEL[b.type], i?.name ?? null, i?.isin ?? null, qty(b.quantity), qty(b.factor), csvAmount(b.amountCents), csvAmount(b.feeCents), csvAmount(b.taxCents), b.note]
    }),
  ]
  return toCsv(rows)
}

const centsText = (c: number) => `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`

export interface RestoreResult {
  portfolios: number
  bookings: number
  instruments: number
  snapshots: number
}

/** Allgemeines Instrument zum Backup-Eintrag finden (nie anlegen – Stammdaten kommen nur vom Kursanbieter). */
async function findGlobal(tx: Tx, i: z.infer<typeof backupSchema>['instruments'][number]): Promise<string | null> {
  const keys = [
    eq(instrument.id, i.id),
    i.symbol ? eq(instrument.symbol, i.symbol) : null,
    i.coingeckoId ? eq(instrument.coingeckoId, i.coingeckoId) : null,
    i.metal ? eq(instrument.metal, i.metal) : null,
    i.isin ? eq(instrument.isin, i.isin) : null,
  ]
  for (const key of keys) {
    if (!key) continue
    const [row] = await tx
      .select({ id: instrument.id, kind: instrument.kind })
      .from(instrument)
      .where(and(isNull(instrument.ownerId), key))
      .limit(1)
    if (row && row.kind === i.kind) return row.id
  }
  return null
}

async function insertChunks<T>(items: readonly T[], size: number, insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await insert(items.slice(i, i + size))
}

/**
 * Backup in ein leeres Konto zurückspielen – alles oder nichts (eine
 * Transaktion). Wirft ValidationError mit einer lesbaren Meldung.
 */
export async function restoreBackup(actor: Actor, value: unknown): Promise<RestoreResult> {
  const parsed = backupSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ValidationError(`Das ist kein gültiges rt100k-Backup${issue ? ` (${issue.path.join('.') || 'Datei'}: ${issue.message})` : ''}.`)
  }
  const data = parsed.data
  const portfolioIds = new Set(data.portfolios.map((p) => p.id))
  const instrumentById = new Map(data.instruments.map((i) => [i.id, i]))

  // Buchungen vorab prüfen – dieselben Regeln wie im Formular
  const today = viennaDay()
  const normalized = data.bookings.map((b, index) => {
    const where = `Buchung ${index + 1} vom ${b.occurredOn}`
    if (!portfolioIds.has(b.portfolioId)) throw new ValidationError(`${where}: gehört zu keinem Depot im Backup.`)
    if (b.instrumentId && !instrumentById.has(b.instrumentId)) throw new ValidationError(`${where}: Wertpapier fehlt im Backup.`)
    if (b.occurredOn > today) throw new ValidationError(`${where}: Datum in der Zukunft.`)
    try {
      const n = normalizeBooking({
        portfolioId: b.portfolioId,
        type: b.type,
        occurredOn: b.occurredOn,
        instrumentId: b.instrumentId,
        quantity: b.quantity,
        factor: b.factor,
        amount: centsText(b.amountCents),
        fee: centsText(b.feeCents),
        tax: centsText(b.taxCents),
        note: b.note,
      })
      return { ...n, portfolioId: b.portfolioId, importKey: b.importKey, priceConfirmed: b.priceConfirmed }
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`${where}: ${error.message}`)
      throw error
    }
  })
  const keys = normalized.map((b) => b.importKey).filter(Boolean)
  if (new Set(keys).size !== keys.length) throw new ValidationError('Das Backup enthält doppelte Import-Schlüssel.')

  // Bestände je Depot müssen aufgehen
  for (const p of data.portfolios) {
    const own: LedgerBooking[] = normalized.filter((b) => b.portfolioId === p.id).map((b, i) => ({ id: String(i), ...b }))
    try {
      computeLedger(own)
    } catch (error) {
      if (error instanceof LedgerError) throw new ValidationError(`Die Buchungen von „${p.name}“ gehen nicht auf (Verkauf über dem Bestand).`)
      throw error
    }
  }

  return withUser(actor.id, async (tx) => {
    // je Nutzer nur ein Wiederherstellen gleichzeitig (sonst sähen beide ein leeres Konto)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`restore:${actor.id}`}, 0))`)
    const [existing] = await tx.select({ n: count() }).from(portfolio).where(eq(portfolio.ownerId, actor.id))
    if ((existing?.n ?? 0) > 0) throw new ValidationError('Wiederherstellen geht nur in ein Konto ohne Depots – sonst entstünden doppelte Buchungen.')
    // Reste früherer Durchläufe entfernen (ohne Depots nutzlos) – sonst wüchse der
    // Speicher mit jedem „Depots löschen → wiederherstellen“
    await tx.delete(importFile).where(eq(importFile.ownerId, actor.id))
    await tx.delete(instrument).where(eq(instrument.ownerId, actor.id))

    // Instrumente: allgemeine finden, sonst als private Stammdaten anlegen (ohne Kursanbieter-Kennungen)
    const instrumentMap = new Map<string, string>()
    let createdInstruments = 0
    for (const i of data.instruments) {
      const global = i.private ? null : await findGlobal(tx, i)
      if (global) {
        instrumentMap.set(i.id, global)
        continue
      }
      const [row] = await tx
        .insert(instrument)
        .values({ ownerId: actor.id, kind: i.kind, name: i.name, isin: i.isin, currency: i.currency })
        .returning({ id: instrument.id })
      if (!row) throw new Error('Instrument konnte nicht angelegt werden.')
      instrumentMap.set(i.id, row.id)
      createdInstruments++
    }

    const portfolioMap = new Map<string, string>()
    for (const p of data.portfolios) {
      const [row] = await tx
        .insert(portfolio)
        .values({ ownerId: actor.id, name: p.name, kind: p.kind, broker: p.broker, currency: p.currency, taxSimple: p.taxSimple, archivedAt: p.archived ? new Date() : null })
        .returning({ id: portfolio.id })
      if (!row) throw new Error('Depot konnte nicht angelegt werden.')
      portfolioMap.set(p.id, row.id)
    }

    await insertChunks(normalized, 500, (chunk) =>
      tx.insert(booking).values(
        chunk.map((b) => ({
          ownerId: actor.id,
          portfolioId: portfolioMap.get(b.portfolioId)!,
          type: b.type,
          occurredOn: b.occurredOn,
          instrumentId: b.instrumentId ? instrumentMap.get(b.instrumentId)! : null,
          quantity: b.quantity,
          factor: b.factor,
          amountCents: b.amountCents,
          feeCents: b.feeCents,
          taxCents: b.taxCents,
          note: b.note,
          source: 'import' as const,
          importKey: b.importKey,
          priceConfirmed: b.priceConfirmed,
        })),
      ),
    )

    const snapshots = data.snapshots.filter((s) => portfolioMap.has(s.portfolioId))
    const uniqueSnapshots = [...new Map(snapshots.map((s) => [`${s.portfolioId}|${s.day}`, s])).values()]
    await insertChunks(uniqueSnapshots, 1000, (chunk) =>
      tx.insert(portfolioSnapshot).values(chunk.map((s) => ({ ownerId: actor.id, portfolioId: portfolioMap.get(s.portfolioId)!, day: s.day, valueCents: s.valueCents, investedCents: s.investedCents }))),
    )

    const files = [...new Map(data.importFiles.map((f) => [f.fileHash, f])).values()]
    await insertChunks(files, 1000, (chunk) => tx.insert(importFile).values(chunk.map((f) => ({ ownerId: actor.id, ...f }))).onConflictDoNothing())

    if (data.road) await tx.insert(roadSettings).values({ ownerId: actor.id, ...data.road }).onConflictDoUpdate({ target: roadSettings.ownerId, set: data.road })
    if (data.allocationTargets.length > 0) {
      await tx.delete(allocationTarget).where(eq(allocationTarget.ownerId, actor.id))
      await tx.insert(allocationTarget).values(data.allocationTargets.map((t) => ({ ownerId: actor.id, kind: t.kind, targetBp: t.bp })))
    }
    for (const b of data.etfBreakdowns) {
      const instrumentId = instrumentMap.get(b.instrumentId)
      const kind = instrumentById.get(b.instrumentId)?.kind
      if (!instrumentId || (kind !== 'etf' && kind !== 'fund')) continue
      await tx
        .insert(etfBreakdown)
        .values({ ownerId: actor.id, instrumentId, fundName: b.fundName, asOf: b.asOf, rows: b.rows, countries: b.countries, sectors: b.sectors, top: b.top })
        .onConflictDoNothing()
    }

    for (const g of data.goals) {
      const ids = g.scope === 'selected' ? [...new Set(g.portfolioIds.map((id) => portfolioMap.get(id)).filter((id): id is string => Boolean(id)))] : []
      const [row] = await tx
        .insert(goal)
        .values({ ownerId: actor.id, name: g.name, targetCents: g.targetCents, targetDate: g.targetDate, monthlyCents: g.monthlyCents, returnBp: g.returnBp, scope: g.scope })
        .returning({ id: goal.id })
      if (row && ids.length > 0) await tx.insert(goalPortfolio).values(ids.map((portfolioId) => ({ goalId: row.id, portfolioId, ownerId: actor.id })))
    }
    const watch = [...new Map(data.watchlist.filter((w) => instrumentMap.has(w.instrumentId)).map((w) => [instrumentMap.get(w.instrumentId)!, w])).entries()]
    if (watch.length > 0) await tx.insert(watchlistItem).values(watch.map(([instrumentId, w]) => ({ ownerId: actor.id, instrumentId, note: w.note }))).onConflictDoNothing()

    return { portfolios: portfolioMap.size, bookings: normalized.length, instruments: createdInstruments, snapshots: uniqueSnapshots.length }
  })
}

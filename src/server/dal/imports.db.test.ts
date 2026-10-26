import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { booking, csvMapping, importFile, instrument } from '../db/schema'
import type { Actor } from './actor'
import { computeLedger } from '@/lib/holdings'
import { createBooking, listAllLedgerBookings, listBookings } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { deleteCsvMapping, deleteImportedBookings, findImported, findSimilarImports, ImportConflictError, importBookings, listCsvMappings, saveCsvMapping } from './imports'
import { createPortfolio } from './portfolios'

const key = (s: string) => createHash('sha256').update(s).digest('hex')

let alice: Actor
let bob: Actor
let aliceDepot: string
let bobDepot: string
let etf: string

const buy = (k: string, extra: Record<string, unknown> = {}) => ({
  importKey: key(k),
  type: 'buy',
  occurredOn: '2026-03-03',
  instrumentId: etf,
  quantity: '7.784313',
  amountCents: 99990,
  feeCents: 100,
  taxCents: 0,
  note: 'Trade Republic',
  ...extra,
})

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  aliceDepot = (await createPortfolio(alice, { name: 'TR', kind: 'depot' })).id
  bobDepot = (await createPortfolio(bob, { name: 'Bobs Depot', kind: 'depot' })).id
})

describe('Import mit widersprüchlichem Bestand', () => {
  it('meldet genau die Wertpapiere, deren Bestand negativ würde – nichts wird gespeichert', async () => {
    const carol = await createUser('Carol')
    const depot = (await createPortfolio(carol, { name: 'TR', kind: 'depot' })).id
    const [other] = await withUser(carol.id, (tx) => tx.insert(instrument).values({ ownerId: carol.id, kind: 'stock', name: 'Testaktie', currency: 'EUR' }).returning({ id: instrument.id }))
    const items = [
      buy('k1', { quantity: '2' }),
      buy('k2', { type: 'sell', occurredOn: '2026-04-01', quantity: '5', amountCents: 50000 }),
      buy('k3', { instrumentId: other!.id, quantity: '1', amountCents: 1000 }),
    ]
    const error = await importBookings(carol, { portfolioId: depot, files: [], items }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImportConflictError)
    expect((error as ImportConflictError).instrumentIds).toEqual([etf])
    expect(await listBookings(carol, depot)).toEqual([])
    // ohne die widersprüchlichen Zeilen geht der Rest durch
    expect(await importBookings(carol, { portfolioId: depot, files: [], items: [items[2]] })).toEqual({ created: 1, duplicates: 0 })
  })
})

describe('Import einer Zusammenlegung', () => {
  it('Split mit Faktor 0,0001 macht aus 49.995 Stück 4,9995 – Anschaffungskosten bleiben', async () => {
    const dora = await createUser('Dora')
    const depot = (await createPortfolio(dora, { name: 'TR', kind: 'depot' })).id
    await importBookings(dora, { portfolioId: depot, files: [], items: [buy('z1', { quantity: '49995', amountCents: 49_995 })] })
    await importBookings(dora, { portfolioId: depot, files: [], items: [buy('z2', { type: 'split', occurredOn: '2026-04-24', quantity: null, factor: '0.0001', amountCents: 0, feeCents: 0 })] })
    const ledger = computeLedger(await listAllLedgerBookings(dora))
    expect(ledger.positions.get(etf)).toMatchObject({ quantity: 4_999_500_000_000n, costCents: 49_995 })
    // ohne Faktor abgelehnt
    await expect(importBookings(dora, { portfolioId: depot, files: [], items: [buy('z3', { type: 'split', quantity: null, factor: null, amountCents: 0 })] })).rejects.toThrow(/Verhältnis/)
  })
})

describe('Import von Buchungen', () => {
  it('legt Buchungen mit Quelle „import“ an und merkt sich die Datei', async () => {
    const result = await importBookings(alice, { portfolioId: aliceDepot, files: [{ hash: key('datei-1'), source: 'traderepublic', bookings: 1 }], items: [buy('a')] })
    expect(result).toEqual({ created: 1, duplicates: 0 })
    const [row] = await withUser(alice.id, (tx) => tx.select().from(booking).where(eq(booking.importKey, key('a'))))
    expect(row).toMatchObject({ source: 'import', quantity: '7.784313000000', amountCents: 99990, feeCents: 100, portfolioId: aliceDepot })
    expect(await findImported(alice, [key('a'), key('b')], [key('datei-1'), key('datei-2')])).toEqual({ keys: new Set([key('a')]), files: new Set([key('datei-1')]) })
  })

  it('überspringt Duplikate – aus der Datenbank und innerhalb derselben Lieferung', async () => {
    const result = await importBookings(alice, { portfolioId: aliceDepot, files: [{ hash: key('datei-1'), source: 'traderepublic', bookings: 1 }], items: [buy('a'), buy('c'), buy('c')] })
    expect(result).toEqual({ created: 1, duplicates: 2 })
  })

  it('prüft jede Zeile wie eine manuelle Buchung (mit Zeilennummer)', async () => {
    await expect(importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('d'), buy('e', { quantity: null })] })).rejects.toThrow(/Zeile 2: .*Stückzahl/)
    await expect(importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('f', { occurredOn: '2999-01-01' })] })).rejects.toThrow(/Zukunft/)
    await expect(importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('g', { amountCents: -5 })] })).rejects.toBeInstanceOf(ValidationError)
    await expect(importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('h', { importKey: 'kein-hash' })] })).rejects.toBeInstanceOf(ValidationError)
    // Nichts davon wurde gespeichert (eine Transaktion)
    expect(await findImported(alice, [key('d')], [])).toEqual({ keys: new Set(), files: new Set() })
  })

  it('verhindert einen Bestand unter null über alle importierten Zeilen', async () => {
    await expect(
      importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('s', { type: 'sell', quantity: '100', occurredOn: '2026-03-04', amountCents: 100, feeCents: 0 })] }),
    ).rejects.toThrow(/Bestand/)
  })

  it('begrenzt die Menge je Lieferung', async () => {
    const items = Array.from({ length: 501 }, (_, i) => buy(`viele-${i}`))
    await expect(importBookings(alice, { portfolioId: aliceDepot, files: [], items })).rejects.toThrow(/Höchstens 500/)
  })
})

describe('Importierte Buchungen löschen', () => {
  const file = (name: string) => ({ hash: key(name), source: 'traderepublic' as const, bookings: 2 })

  it('löscht nur Importiertes dieses Depots; von Hand erfasste bleiben, die Datei gilt wieder als neu', async () => {
    const erik = await createUser('Erik')
    const depot = (await createPortfolio(erik, { name: 'TR', kind: 'depot' })).id
    await importBookings(erik, { portfolioId: depot, files: [file('erik-1')], items: [buy('e1'), buy('e2', { occurredOn: '2026-03-05' })] })
    const manual = await createBooking(erik, { portfolioId: depot, type: 'buy', occurredOn: '2026-03-10', instrumentId: etf, quantity: '1', amount: '100,00' })

    expect(await deleteImportedBookings(erik, depot)).toBe(2)
    expect((await listBookings(erik, depot)).map((b) => b.id)).toEqual([manual.id])
    expect(await findImported(erik, [key('e1')], [key('erik-1')])).toEqual({ keys: new Set(), files: new Set() })
    // dieselbe Datei lässt sich neu importieren
    expect(await importBookings(erik, { portfolioId: depot, files: [file('erik-1')], items: [buy('e1'), buy('e2')] })).toEqual({ created: 2, duplicates: 0 })
    // nichts mehr zu löschen → 0
    await deleteImportedBookings(erik, depot)
    expect(await deleteImportedBookings(erik, depot)).toBe(0)
  })

  it('behält die gemerkten Dateien, solange ein anderes Depot noch Importiertes hat', async () => {
    const frida = await createUser('Frida')
    const first = (await createPortfolio(frida, { name: 'TR', kind: 'depot' })).id
    const second = (await createPortfolio(frida, { name: 'flatex', kind: 'depot' })).id
    await importBookings(frida, { portfolioId: first, files: [file('frida-1')], items: [buy('f1')] })
    await importBookings(frida, { portfolioId: second, files: [file('frida-2')], items: [buy('f2')] })
    expect(await deleteImportedBookings(frida, first)).toBe(1)
    expect((await findImported(frida, [], [key('frida-1'), key('frida-2')])).files).toEqual(new Set([key('frida-1'), key('frida-2')]))
    expect((await listBookings(frida, second)).length).toBe(1)
  })

  it('bricht ab, wenn von Hand erfasste Buchungen Stück aus dem Import brauchen – nichts wird gelöscht', async () => {
    const gerd = await createUser('Gerd')
    const depot = (await createPortfolio(gerd, { name: 'TR', kind: 'depot' })).id
    await importBookings(gerd, { portfolioId: depot, files: [], items: [buy('g1')] })
    await createBooking(gerd, { portfolioId: depot, type: 'sell', occurredOn: '2026-03-10', instrumentId: etf, quantity: '2', amount: '300,00' })
    await expect(deleteImportedBookings(gerd, depot)).rejects.toThrow(/von Hand erfasste/i)
    expect((await listBookings(gerd, depot)).length).toBe(2)
  })

  it('fremdes oder ungültiges Depot → nicht gefunden, fremde Buchungen bleiben', async () => {
    const before = (await listBookings(alice, aliceDepot)).length
    expect(before).toBeGreaterThan(0)
    await expect(deleteImportedBookings(bob, aliceDepot)).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteImportedBookings(bob, 'kein-depot')).rejects.toBeInstanceOf(NotFoundError)
    expect((await listBookings(alice, aliceDepot)).length).toBe(before)
    expect((await findImported(alice, [], [key('datei-1')])).files).toEqual(new Set([key('datei-1')]))
  })
})

describe('Import: Zugriff auf fremde Daten', () => {
  it('in ein fremdes Depot → nicht gefunden, nichts gespeichert', async () => {
    await expect(importBookings(alice, { portfolioId: bobDepot, files: [], items: [buy('fremd')] })).rejects.toBeInstanceOf(NotFoundError)
    expect((await listBookings(bob, bobDepot)).length).toBe(0)
  })

  it('mit einem privaten Instrument eines anderen Nutzers → nicht gefunden', async () => {
    const [row] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'other', name: 'Bobs Bild', currency: 'EUR' }).returning({ id: instrument.id }))
    await expect(importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('fremdes-instrument', { instrumentId: row!.id })] })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Duplikat- und Dateiprüfung sehen nur eigene Einträge', async () => {
    expect(await findImported(bob, [key('a')], [key('datei-1')])).toEqual({ keys: new Set(), files: new Set() })
    // Bob darf denselben Schlüssel haben (Eindeutigkeit gilt je Nutzer)
    expect(await importBookings(bob, { portfolioId: bobDepot, files: [{ hash: key('datei-1'), source: 'traderepublic', bookings: 1 }], items: [buy('a')] })).toEqual({ created: 1, duplicates: 0 })
  })

  it('RLS: die App-Rolle sieht ohne Nutzerkontext keine importierten Dateien', async () => {
    expect(await getDb().select().from(importFile)).toEqual([])
    expect(await getDb().select().from(csvMapping)).toEqual([])
  })
})

describe('Gespeicherte CSV-Zuordnungen', () => {
  const mapping = { date: 0, dateFormat: 'dmy', kind: 1, fixedKind: null, isin: 2, name: 3, symbol: null, assetKind: 'security', quantity: 4, amount: 5, fee: 6, tax: null, numberStyle: 'de' }

  it('speichert, überschreibt unter gleichem Namen und listet nur eigene', async () => {
    const saved = await saveCsvMapping(alice, { name: 'Meine Bank', mapping })
    await saveCsvMapping(alice, { name: 'Meine Bank', mapping: { ...mapping, fee: null } })
    await saveCsvMapping(bob, { name: 'Bobs Bank', mapping })
    const list = await listCsvMappings(alice)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: saved.id, name: 'Meine Bank', mapping: { fee: null } })
  })

  it('lehnt ungültige Zuordnungen und Namen ab', async () => {
    await expect(saveCsvMapping(alice, { name: '', mapping })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveCsvMapping(alice, { name: 'x', mapping: { ...mapping, date: -1 } })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveCsvMapping(alice, { name: 'x', mapping: { evil: true } })).rejects.toBeInstanceOf(ValidationError)
  })

  it('fremde Zuordnung löschen → nicht gefunden', async () => {
    const [bobs] = await listCsvMappings(bob)
    await expect(deleteCsvMapping(alice, bobs!.id)).rejects.toBeInstanceOf(NotFoundError)
    expect(await listCsvMappings(bob)).toHaveLength(1)
    await deleteCsvMapping(bob, bobs!.id)
    expect(await listCsvMappings(bob)).toHaveLength(0)
  })
})

describe('Ähnliche Buchungen im Zieldepot', () => {
  let owner: Actor
  let d: string
  beforeAll(async () => {
    owner = await createUser('Franzi')
    d = (await createPortfolio(owner, { name: 'flatex', kind: 'depot' })).id
    await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-05-04', instrumentId: etf, quantity: '3', amount: '360,00' })
  })

  const item = (k: string, extra: Record<string, unknown> = {}) => ({ key: key(k), type: 'buy', occurredOn: '2026-05-05', instrumentId: etf, quantity: '3', amountCents: 36_050, ...extra })

  it('meldet von Hand erfasste Buchungen, die der Import noch einmal brächte', async () => {
    const similar = await findSimilarImports(owner, { portfolioId: d, items: [item('s1'), item('s2', { quantity: '4' }), item('s3', { occurredOn: '2026-05-12' })] })
    expect(similar).toEqual([{ key: key('s1'), occurredOn: '2026-05-04', source: 'manual' }])
  })

  it('der eigene Import-Schlüssel zählt nicht (das meldet „schon importiert“)', async () => {
    await importBookings(owner, { portfolioId: d, files: [], items: [{ ...buy('s4'), occurredOn: '2026-06-01', quantity: '2', amountCents: 20_000 }] })
    const similar = await findSimilarImports(owner, { portfolioId: d, items: [item('s4', { occurredOn: '2026-06-01', quantity: '2', amountCents: 20_000 })] })
    expect(similar).toEqual([])
    const other = await findSimilarImports(owner, { portfolioId: d, items: [item('s5', { occurredOn: '2026-06-02', quantity: '2', amountCents: 20_000 })] })
    expect(other).toEqual([{ key: key('s5'), occurredOn: '2026-06-01', source: 'import' }])
  })

  it('fremde Depots: NotFoundError; ungültige Daten: ValidationError', async () => {
    await expect(findSimilarImports(bob, { portfolioId: d, items: [item('s1')] })).rejects.toBeInstanceOf(NotFoundError)
    await expect(findSimilarImports(owner, { portfolioId: d, items: [item('s1', { key: 'kaputt' })] })).rejects.toBeInstanceOf(ValidationError)
    await expect(findSimilarImports(owner, { portfolioId: d, items: [item('s1', { quantity: '1e9' })] })).rejects.toBeInstanceOf(ValidationError)
    expect(await findSimilarImports(owner, { portfolioId: d, items: [] })).toEqual([])
  })

  it('Buchungen anderer Nutzer bleiben unsichtbar', async () => {
    await createBooking(bob, { portfolioId: bobDepot, type: 'buy', occurredOn: '2026-07-01', instrumentId: etf, quantity: '9', amount: '900,00' })
    expect(await findSimilarImports(owner, { portfolioId: d, items: [item('s6', { occurredOn: '2026-07-01', quantity: '9', amountCents: 90_000 })] })).toEqual([])
  })
})

import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { booking, csvMapping, importFile, instrument } from '../db/schema'
import type { Actor } from './actor'
import { listBookings } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { deleteCsvMapping, findImported, importBookings, listCsvMappings, saveCsvMapping } from './imports'
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

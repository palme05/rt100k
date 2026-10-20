import { beforeAll, describe, expect, it } from 'vitest'
import { computeLedger } from '@/lib/holdings'
import { parseHoldingsCsv } from '@/lib/lookthrough'
import { HOLDINGS_DE } from '@/lib/lookthrough-fixtures'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { importFile, instrument, portfolioSnapshot } from '../db/schema'
import type { Actor } from './actor'
import { saveAllocationTargets } from './allocation'
import { BACKUP_FORMAT, bookingsCsv, exportBackup, restoreBackup, type Backup } from './backup'
import { createBooking, listAllLedgerBookings } from './bookings'
import { ValidationError } from './errors'
import { listEtfBreakdowns, saveEtfBreakdown } from './etf'
import { createPortfolio, listPortfolios } from './portfolios'
import { getRoadSettings, saveRoadSettings } from './road'

let alice: Actor
let bob: Actor
let etf: string
let gold: string
let bobsFund: string
let backup: Backup

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  const [g] = await withUser(alice.id, (tx) => tx.insert(instrument).values({ ownerId: alice.id, kind: 'metal', name: 'Goldbarren 100 g', currency: 'EUR' }).returning({ id: instrument.id }))
  gold = g!.id
  const [f] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'fund', name: 'Bobs Fonds', currency: 'EUR' }).returning({ id: instrument.id }))
  bobsFund = f!.id

  const depot = (await createPortfolio(alice, { name: '=HYPERLINK("x") Depot', kind: 'depot', broker: 'flatex', taxSimple: false })).id
  const safe = (await createPortfolio(alice, { name: 'Tresor', kind: 'sachwert' })).id
  await createBooking(alice, { portfolioId: depot, type: 'buy', occurredOn: '2025-02-01', instrumentId: etf, quantity: '7,5', amount: '750,00', fee: '1,00' })
  await createBooking(alice, { portfolioId: depot, type: 'age', occurredOn: '2025-09-15', instrumentId: etf, amount: '9,37', tax: '2,58' })
  await createBooking(alice, { portfolioId: depot, type: 'sell', occurredOn: '2026-03-01', instrumentId: etf, quantity: '2,5', amount: '300,00', tax: '12,00', note: 'Teilverkauf' })
  await createBooking(alice, { portfolioId: depot, type: 'split', occurredOn: '2026-04-01', instrumentId: etf, factor: '2' })
  await createBooking(alice, { portfolioId: safe, type: 'buy', occurredOn: '2025-05-01', instrumentId: gold, quantity: '100', amount: '7.000' })
  await withUser(alice.id, (tx) => tx.insert(portfolioSnapshot).values({ ownerId: alice.id, portfolioId: depot, day: '2026-03-01', valueCents: 80_000, investedCents: 75_000 }))
  await withUser(alice.id, (tx) => tx.insert(importFile).values({ ownerId: alice.id, fileHash: 'a'.repeat(64), source: 'flatex', bookings: 1 }))
  await saveRoadSettings(alice, { monthlyContributionCents: 30_000, expectedReturnBp: 500, volatilityBp: 1200, includeTangibles: false })
  await saveAllocationTargets(alice, [
    { kind: 'etf', bp: 8_000 },
    { kind: 'metal', bp: 2_000 },
  ])
  await saveEtfBreakdown(alice, { instrumentId: etf, ...parseHoldingsCsv(HOLDINGS_DE) })
  backup = await exportBackup(alice)
})

describe('Export', () => {
  it('enthält alle eigenen Daten, aber keine Geheimnisse', () => {
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1, profile: { name: 'Alice' } })
    expect(backup.portfolios).toHaveLength(2)
    expect(backup.bookings.map((b) => b.type)).toEqual(['buy', 'buy', 'age', 'sell', 'split'])
    expect(backup.instruments.map((i) => [i.name, i.private]).sort()).toEqual([
      ['Goldbarren 100 g', true],
      ['Vanguard FTSE All-World UCITS ETF (Acc)', false],
    ])
    expect(backup).toMatchObject({ road: { monthlyContributionCents: 30_000 }, allocationTargets: expect.arrayContaining([{ kind: 'etf', bp: 8_000 }]) })
    expect(backup.snapshots).toHaveLength(1)
    expect(backup.etfBreakdowns).toHaveLength(1)
    expect(backup.importFiles).toEqual([{ fileHash: 'a'.repeat(64), source: 'flatex', bookings: 1 }])
    const json = JSON.stringify(backup)
    for (const secret of ['password', 'secret', 'token', 'backupCodes', 'publicKey']) expect(json).not.toContain(secret)
  })

  it('fremde Daten fehlen: Bobs Export enthält nichts von Alice', async () => {
    const bobs = await exportBackup(bob)
    expect(bobs.portfolios).toEqual([])
    expect(bobs.bookings).toEqual([])
    expect(JSON.stringify(bobs)).not.toContain('Goldbarren')
  })

  it('Buchungen als CSV mit Formel-Schutz', () => {
    const csv = bookingsCsv(backup)
    expect(csv.startsWith('﻿"Datum";"Depot";"Art"')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"") Depot"`)
    expect(csv).toContain('"Teilverkauf"')
    expect(csv).toContain(';300,00;0,00;12,00;')
  })
})

describe('Wiederherstellen', () => {
  it('spielt das Backup in ein leeres Konto zurück – Bestände und Einstellungen wie im Original', async () => {
    const carol = await createUser('Carol')
    const globalsBefore = (await getDb().select({ id: instrument.id }).from(instrument)).length
    const result = await restoreBackup(carol, JSON.parse(JSON.stringify(backup)))
    expect(result).toEqual({ portfolios: 2, bookings: 5, instruments: 1, snapshots: 1 })

    const ledger = (actor: Actor) => listAllLedgerBookings(actor).then((b) => computeLedger(b))
    const [original, restored] = await Promise.all([ledger(alice), ledger(carol)])
    expect(restored.realizedCents).toBe(original.realizedCents)
    expect(restored.positions.get(etf)?.quantity).toBe(original.positions.get(etf)?.quantity)

    // Gold ist bei Carol ein eigenes privates Instrument, nicht das von Alice
    const carolsBookings = await listAllLedgerBookings(carol)
    expect(carolsBookings.some((b) => b.instrumentId === gold)).toBe(false)
    expect((await getDb().select({ id: instrument.id }).from(instrument)).length).toBe(globalsBefore)
    expect(await getRoadSettings(carol)).toMatchObject({ monthlyContributionCents: 30_000, includeTangibles: false })
    expect((await listEtfBreakdowns(carol)).has(etf)).toBe(true)
    expect((await listPortfolios(carol)).map((p) => p.name).sort()).toEqual(['=HYPERLINK("x") Depot', 'Tresor'])

    // kein zweites Mal in dasselbe Konto
    await expect(restoreBackup(carol, backup)).rejects.toThrow('Konto ohne Depots')
  })

  it('fremde Instrument-IDs im Backup werden nie übernommen', async () => {
    const dave = await createUser('Dave')
    const tampered = structuredClone(backup)
    const goldEntry = tampered.instruments.find((i) => i.id === gold)!
    goldEntry.id = bobsFund
    goldEntry.private = false
    goldEntry.kind = 'fund'
    tampered.bookings = tampered.bookings.filter((b) => b.instrumentId !== gold)
    tampered.bookings.push({ ...tampered.bookings[0]!, instrumentId: bobsFund, importKey: null, occurredOn: '2025-06-01' })
    await restoreBackup(dave, tampered)
    const daves = await listAllLedgerBookings(dave)
    expect(daves.some((b) => b.instrumentId === bobsFund)).toBe(false)
  })

  it('prüft jede Buchung wie das Formular', async () => {
    const erin = await createUser('Erin')
    const bad = (change: (b: Backup) => void) => {
      const copy = structuredClone(backup)
      change(copy)
      return restoreBackup(erin, copy)
    }
    await expect(bad((b) => (b.bookings[3]!.quantity = '99'))).rejects.toThrow('gehen nicht auf')
    await expect(bad((b) => (b.bookings[0]!.occurredOn = '2099-01-01'))).rejects.toThrow('Zukunft')
    await expect(bad((b) => (b.bookings[0]!.amountCents = -1))).rejects.toBeInstanceOf(ValidationError)
    await expect(bad((b) => (b.bookings[0]!.type = 'transfer' as never))).rejects.toBeInstanceOf(ValidationError)
    await expect(bad((b) => (b.bookings[0]!.portfolioId = bobsFund))).rejects.toThrow('keinem Depot')
    await expect(bad((b) => (b.portfolios[0]!.name = 'A\u0000B'))).rejects.toBeInstanceOf(ValidationError)
    await expect(bad((b) => (b.allocationTargets = [{ kind: 'etf', bp: 5_000 }]))).rejects.toThrow('100 %')
    await expect(restoreBackup(erin, { format: 'anderes' })).rejects.toThrow('kein gültiges rt100k-Backup')
    expect(await listPortfolios(erin)).toEqual([])
  })
})

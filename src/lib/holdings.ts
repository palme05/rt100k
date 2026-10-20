import { mulDiv, QTY_DECIMALS, quantityFromDb } from './quantity'

/**
 * Bestände aus Buchungen – österreichische Methode: gleitender
 * Durchschnittspreis je Depot und Instrument (§ 27a Abs. 4 Z 3 EStG).
 * Anschaffungsnebenkosten (Gebühren) zählen im Privatvermögen nicht zu den
 * Anschaffungskosten (§ 27a Abs. 4 Z 2 EStG); sie werden getrennt geführt.
 * Details und Quellen: docs/TAX_AT.md (Phase 5).
 *
 * Bedeutung der Felder je Buchungstyp:
 * | Typ          | Instrument | Menge | Betrag (amountCents)                  |
 * |--------------|------------|-------|---------------------------------------|
 * | buy          | ja         | ja    | Kurswert (Menge × Kurs)               |
 * | sell         | ja         | ja    | Verkaufserlös brutto                  |
 * | transfer_in  | ja         | ja    | übernommene Anschaffungskosten        |
 * | transfer_out | ja         | ja    | – (Einstand geht anteilig mit)        |
 * | staking      | ja         | ja    | Anschaffungskosten (meist 0)          |
 * | split        | ja         | –     | – (factor = neue Stück je altem)      |
 * | dividend     | ja         | –     | Bruttoertrag                          |
 * | interest     | optional   | –     | Bruttozinsen                          |
 * | deposit      | –          | –     | Einzahlung (Cash-Konten)              |
 * | withdrawal   | –          | –     | Auszahlung (Cash-Konten)              |
 * | fee / tax    | optional   | –     | Gebühr bzw. Steuer                    |
 * | age          | ja         | –     | ausschüttungsgleicher Ertrag (AGE)    |
 * feeCents und taxCents gelten zusätzlich bei jeder Buchung.
 *
 * AGE (thesaurierende Fonds) fließen nicht zu und ändern weder Bestand noch
 * Einstand der wirtschaftlichen Sicht; steuerlich erhöhen sie die
 * Anschaffungskosten – das rechnet die Steuer-Engine (src/lib/tax.ts).
 */

export type LedgerBookingType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'tax'
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'split'
  | 'staking'
  | 'age'

export interface LedgerBooking {
  id: string
  type: LedgerBookingType
  occurredOn: string
  instrumentId: string | null
  quantity: string | null
  factor: string | null
  amountCents: number
  feeCents: number
  taxCents: number
}

export interface Position {
  instrumentId: string
  quantity: bigint
  /** Anschaffungskosten nach gleitendem Durchschnitt, ohne Nebenkosten */
  costCents: number
  realizedCents: number
  incomeCents: number
  feesCents: number
  taxCents: number
}

export interface Ledger {
  /** Offene und geschlossene Positionen je Instrument */
  positions: Map<string, Position>
  /** Saldo eines Cash-Kontos (Einzahlungen − Auszahlungen + Zinsen − Steuern − Gebühren ohne Instrument) */
  cashCents: number
  /** Netto eingezahlt auf ein Cash-Konto */
  depositsCents: number
  realizedCents: number
  incomeCents: number
  feesCents: number
  taxCents: number
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly bookingId: string,
  ) {
    super(message)
    this.name = 'LedgerError'
  }
}

function emptyPosition(instrumentId: string): Position {
  return { instrumentId, quantity: 0n, costCents: 0, realizedCents: 0, incomeCents: 0, feesCents: 0, taxCents: 0 }
}

/** Reihenfolge: Handelstag, innerhalb des Tages Zugänge vor Abgängen. */
const ORDER: Record<LedgerBookingType, number> = {
  deposit: 0,
  transfer_in: 1,
  buy: 2,
  staking: 3,
  split: 4,
  dividend: 5,
  age: 6,
  interest: 7,
  sell: 8,
  transfer_out: 9,
  fee: 10,
  tax: 11,
  withdrawal: 12,
}

export function sortBookings<T extends LedgerBooking>(bookings: readonly T[]): T[] {
  return [...bookings].sort((a, b) =>
    a.occurredOn === b.occurredOn ? ORDER[a.type] - ORDER[b.type] : a.occurredOn < b.occurredOn ? -1 : 1,
  )
}

function factorScaled(factor: string, bookingId: string): bigint {
  const parsed = quantityFromDb(factor)
  if (parsed <= 0n) throw new LedgerError('Split-Faktor muss positiv sein', bookingId)
  return parsed
}

/**
 * Rechnet alle Buchungen eines Depots in Bestände um. Wirft LedgerError, wenn
 * ein Verkauf oder Übertrag den Bestand übersteigt.
 */
export function computeLedger(bookings: readonly LedgerBooking[]): Ledger {
  const ledger: Ledger = {
    positions: new Map(),
    cashCents: 0,
    depositsCents: 0,
    realizedCents: 0,
    incomeCents: 0,
    feesCents: 0,
    taxCents: 0,
  }

  const position = (b: LedgerBooking): Position => {
    if (!b.instrumentId) throw new LedgerError('Buchung ohne Instrument', b.id)
    let p = ledger.positions.get(b.instrumentId)
    if (!p) {
      p = emptyPosition(b.instrumentId)
      ledger.positions.set(b.instrumentId, p)
    }
    return p
  }

  const quantity = (b: LedgerBooking): bigint => {
    if (!b.quantity) throw new LedgerError('Buchung ohne Stückzahl', b.id)
    const q = quantityFromDb(b.quantity)
    if (q <= 0n) throw new LedgerError('Stückzahl muss positiv sein', b.id)
    return q
  }

  /** Anteiliger Einstand beim Abgang; bei vollständigem Abgang exakt der Rest. */
  const costOut = (p: Position, q: bigint, b: LedgerBooking): number => {
    if (q > p.quantity) throw new LedgerError('Abgang übersteigt den Bestand', b.id)
    if (q === p.quantity) return p.costCents
    return Number(mulDiv(BigInt(p.costCents), q, p.quantity))
  }

  for (const b of sortBookings(bookings)) {
    ledger.feesCents += b.feeCents
    ledger.taxCents += b.taxCents

    switch (b.type) {
      case 'buy':
      case 'staking':
      case 'transfer_in': {
        const p = position(b)
        p.quantity += quantity(b)
        p.costCents += b.amountCents
        p.feesCents += b.feeCents
        p.taxCents += b.taxCents
        break
      }
      case 'sell': {
        const p = position(b)
        const q = quantity(b)
        const out = costOut(p, q, b)
        const realized = b.amountCents - out
        p.quantity -= q
        p.costCents -= out
        p.realizedCents += realized
        p.feesCents += b.feeCents
        p.taxCents += b.taxCents
        ledger.realizedCents += realized
        break
      }
      case 'transfer_out': {
        const p = position(b)
        const q = quantity(b)
        const out = costOut(p, q, b)
        p.quantity -= q
        p.costCents -= out
        p.feesCents += b.feeCents
        p.taxCents += b.taxCents
        break
      }
      case 'split': {
        const p = position(b)
        if (!b.factor) throw new LedgerError('Split ohne Faktor', b.id)
        p.quantity = mulDiv(p.quantity, factorScaled(b.factor, b.id), 10n ** BigInt(QTY_DECIMALS))
        break
      }
      case 'dividend': {
        const p = position(b)
        p.incomeCents += b.amountCents
        p.feesCents += b.feeCents
        p.taxCents += b.taxCents
        ledger.incomeCents += b.amountCents
        break
      }
      case 'age': {
        // nur die KESt darauf zählt hier; Anschaffungskosten erhöht die Steuer-Engine
        const p = position(b)
        p.feesCents += b.feeCents
        p.taxCents += b.taxCents
        break
      }
      case 'interest': {
        ledger.incomeCents += b.amountCents
        if (b.instrumentId) {
          const p = position(b)
          p.incomeCents += b.amountCents
          p.feesCents += b.feeCents
          p.taxCents += b.taxCents
        } else {
          ledger.cashCents += b.amountCents - b.taxCents - b.feeCents
        }
        break
      }
      case 'deposit':
        ledger.cashCents += b.amountCents - b.feeCents
        ledger.depositsCents += b.amountCents
        break
      case 'withdrawal':
        ledger.cashCents -= b.amountCents + b.feeCents
        ledger.depositsCents -= b.amountCents
        break
      case 'fee':
        ledger.feesCents += b.amountCents
        if (b.instrumentId) position(b).feesCents += b.amountCents
        else ledger.cashCents -= b.amountCents
        break
      case 'tax':
        ledger.taxCents += b.amountCents
        if (b.instrumentId) position(b).taxCents += b.amountCents
        else ledger.cashCents -= b.amountCents
        break
    }
  }
  return ledger
}

/** Nur Positionen mit Bestand. */
export function openPositions(ledger: Ledger): Position[] {
  return [...ledger.positions.values()].filter((p) => p.quantity > 0n)
}

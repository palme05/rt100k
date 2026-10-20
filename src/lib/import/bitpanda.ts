import { viennaDay } from '../format'
import { toCents, toDecimal } from './numbers'
import { cleanName } from './text'
import type { ImportedBooking, ParseResult, CsvParser } from './types'

/**
 * Bitpanda-Transaktionsexport (Verlauf → Export, CSV). Vor der Kopfzeile
 * stehen Hinweiszeilen; Zahlen mit Punkt, fehlende Werte als „-“.
 * Spalten laut öffentlich dokumentierten Konvertern (z. B. BittyTax).
 */

const COLUMNS = ['Transaction ID', 'Timestamp', 'Transaction Type', 'In/Out', 'Amount Fiat', 'Fiat', 'Amount Asset', 'Asset', 'Asset class', 'Fee', 'Fee asset', 'Tax Fiat'] as const
type Column = (typeof COLUMNS)[number]

const METAL_CODES: Record<string, string> = { XAU: 'XAU', GOLD: 'XAU', XAG: 'XAG', SILVER: 'XAG', XPT: 'XPT', PLATINUM: 'XPT' }

function value(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  return s === '' || s === '-' ? null : s
}

export const parseBitpanda: CsvParser = (rows) => {
  const headerIdx = rows.findIndex((r) => r.includes('Transaction ID') && r.includes('Transaction Type') && r.includes('Asset class'))
  if (headerIdx < 0) return null
  const header = rows[headerIdx] ?? []
  const col = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<Column, number>
  const get = (r: readonly string[], c: Column) => (col[c] >= 0 ? value(r[col[c]]) : null)

  const bookings: ImportedBooking[] = []
  const skipped = new Map<string, number>()
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1)

  for (const r of rows.slice(headerIdx + 1)) {
    const id = get(r, 'Transaction ID')
    const type = (get(r, 'Transaction Type') ?? '').toLowerCase()
    const assetClass = (get(r, 'Asset class') ?? '').toLowerCase()
    const assetCode = (get(r, 'Asset') ?? '').toUpperCase()
    const timestamp = get(r, 'Timestamp')
    const when = timestamp ? new Date(timestamp) : null
    if (!id || !when || Number.isNaN(when.getTime())) {
      skip('Zeilen ohne ID oder Datum')
      continue
    }
    if (assetClass === 'fiat') {
      skip('Euro-Ein- und Auszahlungen (Bitpanda-Guthaben)')
      continue
    }
    const fiat = (get(r, 'Fiat') ?? '').toUpperCase()
    const warnings: string[] = []
    const occurredOn = viennaDay(when)
    const quantity = toDecimal(get(r, 'Amount Asset') ?? '', 'en')
    const amountCents = toCents(get(r, 'Amount Fiat') ?? '0', 'en') ?? 0
    const taxCents = Math.max(0, toCents(get(r, 'Tax Fiat') ?? '0', 'en') ?? 0)
    const feeAsset = (get(r, 'Fee asset') ?? '').toUpperCase()
    const feeValue = toCents(get(r, 'Fee') ?? '0', 'en') ?? 0
    let feeCents = 0
    if (feeValue > 0 && feeAsset === 'EUR') feeCents = feeValue
    else if (feeValue > 0) warnings.push(`Gebühr in ${feeAsset || 'unbekannter Einheit'} nicht übernommen.`)

    const metal = METAL_CODES[assetCode]
    const isMetal = assetClass.includes('metal') && metal
    const isCrypto = assetClass.includes('crypto')
    if (!isMetal && !isCrypto) {
      skip(assetClass.includes('index') ? 'Krypto-Indizes (noch nicht unterstützt)' : 'Bitpanda Stocks/ETFs/Rohstoffe (bitte manuell erfassen)')
      continue
    }
    if (fiat && fiat !== 'EUR') {
      skip(`Transaktionen in ${fiat} (nur EUR wird unterstützt)`)
      continue
    }
    if (!quantity || quantity.startsWith('-') || quantity === '0') {
      skip('Zeilen ohne Menge')
      continue
    }
    const asset = isMetal
      ? { kind: 'metal' as const, isin: null, symbol: metal, name: cleanName(assetCode) }
      : { kind: 'crypto' as const, isin: null, symbol: assetCode, name: cleanName(assetCode) }

    let kind: ImportedBooking['kind']
    let amount = amountCents
    let note: string | null = null
    if (type === 'buy') kind = 'buy'
    else if (type === 'sell') kind = 'sell'
    else if (type === 'deposit') {
      kind = 'transfer_in'
      warnings.push('Einzahlung von außen: Anschaffungskosten bitte prüfen (übernommen wurde der Marktwert).')
    } else if (type === 'withdrawal') {
      kind = 'transfer_out'
      amount = 0
    } else if (type === 'transfer' || type === 'reward' || type === 'staking') {
      kind = 'staking'
      amount = 0
      note = 'Bitpanda Prämie/Staking/Übertrag'
      warnings.push('Übertrag oder Prämie? Bitte die Art prüfen (Anschaffungskosten 0 übernommen).')
    } else {
      skip(`Unbekannter Typ „${type || 'leer'}“`)
      continue
    }
    if ((kind === 'buy' || kind === 'sell') && amount <= 0) {
      skip('Käufe/Verkäufe ohne Betrag')
      continue
    }
    bookings.push({
      kind,
      occurredOn,
      asset,
      quantity,
      amountCents: amount,
      feeCents,
      taxCents,
      netCents: null,
      // Bitpanda dokumentiert das Format nicht offiziell: bewusst „mittel“
      confidence: 'mittel',
      warnings,
      fingerprint: `bitpanda|${id}`,
      note,
    })
  }
  const notices = [...skipped.entries()].map(([reason, count]) => `${count} × übersprungen: ${reason}`)
  const result: ParseResult = { source: 'bitpanda', document: 'Transaktionsexport (CSV)', bookings, notices }
  return result
}

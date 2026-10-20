import { detectNumberStyle, foreignToEurCents, NUM, toCents, toDecimal, type NumberStyle } from './numbers'
import { cleanName, CURRENCY, DATE, findLine, isValidIsin, ISIN, normalizeLines, parseDate } from './text'
import { refundBooking, type Confidence, type ImportAsset, type ImportedBooking, type ParseResult, type PdfParser } from './types'

/**
 * Trade Republic (Deutschland und Branch Austria), deutsche und englische
 * Abrechnungen. Formate gelernt an öffentlich verfügbaren, anonymisierten
 * Beispielen (Portfolio Performance, EPL – kein Code übernommen).
 */

const UNIT = String.raw`(?:Stk\.|Stücke|Stück|Pcs\.?|Units?|Anteile)`
const CUR = CURRENCY
const POSITION_ROW = new RegExp(String.raw`^(?<name>.+?)\s+(?<qty>${NUM})\s+${UNIT}\s+(?<price>${NUM})\s+(?<pcur>${CUR})\s+(?<amount>${NUM})\s+(?<cur>${CUR})$`)
const ISIN_LINE = new RegExp(String.raw`^(?:ISIN:\s*)?(?<isin>${ISIN})$`)
const TOTAL = /^(?:GESAMT|TOTAL|Gesamt|Total)\b/
const BILLING_ROW = new RegExp(String.raw`^(?<label>.+?)\s+(?:(?<rate>${NUM})\s+(?<pair>${CUR}\/${CUR})\s+)?(?<amount>${NUM})\s+(?<cur>${CUR})$`)

const TAX_LABEL = /steuer|solidarit|kest|tax|withholding|zinsabschlag/i
const TAX_BASE = /grundlage|bemessung|basis|zwischensumme|subtotal/i
const FEE_LABEL = /zuschlag|pauschale|gebühr|fee|surcharge|kosten|cost|spesen|provision|commission/i

function detect(lines: readonly string[]): boolean {
  return lines.some((l) => /TRADE REPUBLIC BANK GMBH/i.test(l))
}

/** Index der ersten Zeile, die `re` erfüllt (ab `from`), sonst -1. */
function indexOf(lines: readonly string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i] ?? '')) return i
  return -1
}

function documentId(lines: readonly string[]): string {
  const exec = findLine(lines, /(?:AUSFÜHRUNG|EXECUTION)\s+([0-9A-Za-z-]{4,})$/)
  const order = findLine(lines, /(?:AUFTRAG|ORDER)\s+([0-9A-Za-z-]{4,})$/)
  return exec?.match[1] ?? order?.match[1] ?? ''
}

function headerDate(lines: readonly string[]): string | null {
  const hit = findLine(lines, new RegExp(String.raw`(?:DATUM|DATE)\s+(${DATE})$`))
  return hit ? parseDate(hit.match[1] ?? '') : null
}

interface Charges {
  feeCents: number
  taxCents: number
  /** Steuer-Gutschriften (positiv in der Abrechnung) */
  refundCents: number
  /** Kurs Fremdwährung je EUR, falls angegeben (z. B. `1.0797 USD/EUR`) */
  rate: string | null
  foreignTaxes: { amount: string; currency: string }[]
  warnings: string[]
}

/** Abschnitt „ABRECHNUNG/BILLING“ bis „GESAMT“: Gebühren, Steuern, Devisenkurs. */
function readCharges(lines: readonly string[], start: number, style: NumberStyle): Charges {
  const result: Charges = { feeCents: 0, taxCents: 0, refundCents: 0, rate: null, foreignTaxes: [], warnings: [] }
  if (start < 0) return result
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (TOTAL.test(line) || /^(?:BUCHUNG|BOOKING)$/.test(line)) break
    const row = BILLING_ROW.exec(line)
    if (!row?.groups) continue
    const { label = '', amount = '', cur = '', rate } = row.groups
    if (rate) result.rate = toDecimal(rate, style)
    if (/^POSITION\b/.test(label) || TAX_BASE.test(label)) continue
    const decimal = toDecimal(amount, style)
    if (decimal === null) continue
    const isTax = TAX_LABEL.test(label)
    const isFee = !isTax && FEE_LABEL.test(label)
    if (!isTax && !isFee) continue
    if (cur !== 'EUR') {
      if (isTax) result.foreignTaxes.push({ amount: decimal.replace('-', ''), currency: cur })
      else result.warnings.push(`Gebühr in ${cur} nicht umgerechnet.`)
      continue
    }
    const cents = toCents(amount, style) ?? 0
    if (isTax && cents > 0) result.refundCents += cents
    else if (isTax) result.taxCents += -cents
    else result.feeCents += Math.abs(cents)
  }
  return result
}

/** Betrag und Datum aus „BUCHUNG/BOOKING“ (Gutschrift positiv, Belastung negativ). */
function readBooking(lines: readonly string[], style: NumberStyle): { netCents: number | null; date: string | null } {
  const start = indexOf(lines, /^(?:BUCHUNG|BOOKING)$/)
  if (start < 0) return { netCents: null, date: null }
  const row = findLine(lines, new RegExp(String.raw`(?:(?<date>${DATE})\s+)?(?<amount>${NUM})\s+EUR$`), start + 1, start + 4)
  if (!row?.match.groups) return { netCents: null, date: null }
  return { netCents: toCents(row.match.groups.amount ?? '', style), date: row.match.groups.date ? parseDate(row.match.groups.date) : null }
}

function plausibility(expected: number, net: number | null, tolerance: number, warnings: string[]): Confidence {
  if (net === null) {
    warnings.push('Gutschrift/Belastung nicht gefunden – Beträge bitte prüfen.')
    return 'mittel'
  }
  const diff = Math.abs(expected - net)
  if (diff <= tolerance) return 'hoch'
  warnings.push(`Summe weicht um ${(diff / 100).toFixed(2).replace('.', ',')} € von der Abrechnung ab.`)
  return 'mittel'
}

function asset(name: string, isin: string | null): ImportAsset {
  const crypto = /\(([A-Z0-9]{2,10})\)$/.exec(name)
  if (!isin && crypto) return { kind: 'crypto', isin: null, symbol: crypto[1] ?? null, name: cleanName(name.replace(/\s*\([A-Z0-9]{2,10}\)$/, '')) }
  return { kind: 'security', isin, symbol: null, name: cleanName(name) }
}

function parseTrade(lines: readonly string[], style: NumberStyle, title: string): ParseResult {
  const notices: string[] = []
  const warnings: string[] = []
  const overviewIdx = indexOf(lines, /(?:Kauf|Verkauf|Buy|Sell|BUY|SELL|Sparplanausführung|Savings plan execution|Saveback|Round ?up)/i, indexOf(lines, /^(?:ÜBERSICHT|OVERVIEW)$/))
  const overview = `${lines[overviewIdx] ?? ''} ${lines[overviewIdx + 1] ?? ''}`
  const kind = /Verkauf|\bSell\b/i.test(overview) ? 'sell' : 'buy'
  const dateMatch = new RegExp(String.raw`(?:\bam|\bon)\s+(${DATE})`).exec(overview)
  const occurredOn = (dateMatch ? parseDate(dateMatch[1] ?? '') : null) ?? headerDate(lines)

  const header = indexOf(lines, /^POSITION\s+(?:ANZAHL|QUANTITY)\b/)
  let row: RegExpExecArray | null = null
  let rowIdx = -1
  for (let i = header + 1; header >= 0 && i < lines.length && !TOTAL.test(lines[i] ?? ''); i++) {
    row = POSITION_ROW.exec(lines[i] ?? '')
    if (row) {
      rowIdx = i
      break
    }
  }
  if (!row?.groups || !occurredOn) {
    return { source: 'traderepublic', document: title, bookings: [], notices: ['Abrechnung erkannt, aber Position oder Datum nicht lesbar.'] }
  }
  let name = row.groups.name ?? ''
  let isin: string | null = null
  for (let i = rowIdx + 1; i < lines.length && !TOTAL.test(lines[i] ?? ''); i++) {
    const isinMatch = ISIN_LINE.exec(lines[i] ?? '')
    if (isinMatch?.groups?.isin) {
      isin = isinMatch.groups.isin
      break
    }
    name += ` ${lines[i]}`
  }
  if (isin && !isValidIsin(isin)) {
    warnings.push(`ISIN ${isin} hat eine ungültige Prüfziffer.`)
    isin = null
  }
  const quantity = toDecimal(row.groups.qty ?? '', style)
  const amountCents = toCents(row.groups.amount ?? '', style)
  if (!quantity || quantity.startsWith('-') || amountCents === null || row.groups.cur !== 'EUR') {
    return { source: 'traderepublic', document: title, bookings: [], notices: ['Menge oder Betrag nicht lesbar (nur EUR-Abrechnungen werden unterstützt).'] }
  }

  const charges = readCharges(lines, indexOf(lines, /^(?:ABRECHNUNG|BILLING)$/, rowIdx), style)
  warnings.push(...charges.warnings)
  const { netCents } = readBooking(lines, style)
  const expected = kind === 'buy' ? -(amountCents + charges.feeCents + charges.taxCents) : amountCents - charges.feeCents - charges.taxCents + charges.refundCents
  const confidence = plausibility(expected, netCents, 1, warnings)
  const a = asset(name, isin)
  if (a.kind === 'security' && !a.isin) warnings.push('Keine ISIN gefunden – Wertpapier bitte zuordnen.')
  const special = /Saveback/i.test(overview) ? 'Saveback' : /Round ?up/i.test(overview) ? 'Round-up' : /Sparplan|Savings plan/i.test(overview) ? 'Sparplan' : null

  const booking: ImportedBooking = {
    kind,
    occurredOn,
    asset: a,
    quantity,
    amountCents,
    feeCents: charges.feeCents,
    taxCents: charges.taxCents,
    netCents,
    confidence: a.kind === 'security' && !a.isin ? 'niedrig' : confidence,
    warnings,
    fingerprint: `tr|${documentId(lines)}|${kind}|${occurredOn}|${a.isin ?? a.symbol ?? a.name}|${quantity}|${amountCents}`,
    note: special ? `Trade Republic ${special}` : null,
  }
  const refund = charges.refundCents > 0 ? [refundBooking(booking, charges.refundCents, 'Steuergutschrift laut Abrechnung (Verlustausgleich)')] : []
  return { source: 'traderepublic', document: title, bookings: [booking, ...refund], notices }
}

function parseDividend(lines: readonly string[], style: NumberStyle, title: string): ParseResult {
  const warnings: string[] = []
  const header = indexOf(lines, /^POSITION\s+(?:ANZAHL|QUANTITY)\b/)
  const totalIdx = indexOf(lines, TOTAL, header + 1)
  if (header < 0 || totalIdx < 0) return { source: 'traderepublic', document: title, bookings: [], notices: ['Ausschüttung erkannt, aber Position nicht lesbar.'] }
  const block = lines.slice(header + 1, totalIdx)
  const isin = block.map((l) => ISIN_LINE.exec(l)?.groups?.isin).find(Boolean) ?? null
  const nameLine = block[0] ?? ''
  const name = cleanName(nameLine.replace(new RegExp(String.raw`\s+(?:${NUM})\s+(?:${UNIT}|${CUR}).*$`), ''))
  const total = new RegExp(String.raw`(?<amount>${NUM})\s+(?<cur>${CUR})$`).exec(lines[totalIdx] ?? '')
  const gross = total?.groups ? toDecimal(total.groups.amount ?? '', style) : null
  const currency = total?.groups?.cur ?? 'EUR'
  if (!isin || !isValidIsin(isin) || !gross) return { source: 'traderepublic', document: title, bookings: [], notices: ['Ausschüttung erkannt, aber ISIN oder Betrag nicht lesbar.'] }

  const charges = readCharges(lines, indexOf(lines, /^(?:ABRECHNUNG|BILLING)$/, totalIdx), style)
  warnings.push(...charges.warnings)
  const { netCents, date } = readBooking(lines, style)
  const occurredOn = date ?? headerDate(lines)
  if (!occurredOn) return { source: 'traderepublic', document: title, bookings: [], notices: ['Zahltag nicht lesbar.'] }

  let amountCents: number | null
  let taxCents = charges.taxCents
  if (currency === 'EUR') {
    amountCents = toCents(gross, 'en')
  } else if (charges.rate) {
    amountCents = foreignToEurCents(gross, charges.rate)
    for (const t of charges.foreignTaxes) if (t.currency === currency) taxCents += foreignToEurCents(t.amount, charges.rate) ?? 0
  } else {
    amountCents = null
  }
  if (amountCents === null) return { source: 'traderepublic', document: title, bookings: [], notices: [`Ausschüttung in ${currency} ohne Devisenkurs – bitte manuell erfassen.`] }

  const confidence = plausibility(amountCents - taxCents, netCents, currency === 'EUR' ? 1 : 2, warnings)
  return {
    source: 'traderepublic',
    document: title,
    notices: [],
    bookings: [
      {
        kind: 'dividend',
        occurredOn,
        asset: { kind: 'security', isin, symbol: null, name },
        quantity: null,
        amountCents,
        feeCents: charges.feeCents,
        taxCents,
        netCents,
        confidence,
        warnings,
        fingerprint: `tr|div|${occurredOn}|${isin}|${gross}${currency}`,
        note: currency === 'EUR' ? null : `Brutto ${gross.replace('.', ',')} ${currency}, Kurs ${charges.rate?.replace('.', ',')}`,
      },
    ],
  }
}

function parseInterest(lines: readonly string[], style: NumberStyle, title: string): ParseResult {
  const { netCents, date } = readBooking(lines, style)
  const zum = findLine(lines, new RegExp(String.raw`^(?:zum|as of)\s+(${DATE})$`, 'i'))
  const occurredOn = date ?? headerDate(lines) ?? (zum ? parseDate(zum.match[1] ?? '') : null)
  const items: { label: string; grossCents: number; section: RegExp }[] = []
  for (const line of lines) {
    const m = new RegExp(String.raw`^(?<what>Cash|Geldmarkt|Money market)\s+(?<type>Zinsen|Dividende|Interest|Dividend)\b.*?(?<amount>${NUM})\s+EUR$`, 'i').exec(line)
    if (!m?.groups) continue
    const cents = toCents(m.groups.amount ?? '', style)
    if (cents === null || cents <= 0) continue
    const isMoneyMarket = /Geldmarkt|Money market/i.test(m.groups.what ?? '')
    items.push({ label: isMoneyMarket ? 'Geldmarkt-Dividende' : 'Zinsen', grossCents: cents, section: isMoneyMarket ? /^ABRECHNUNG - DIVIDENDE|^BILLING - DIVIDEND/i : /^ABRECHNUNG - ZINSEN|^BILLING - INTEREST|^ABRECHNUNG$/i })
  }
  if (!occurredOn || items.length === 0) return { source: 'traderepublic', document: title, bookings: [], notices: ['Zinsabrechnung erkannt, aber Betrag oder Datum nicht lesbar.'] }

  const bookings: ImportedBooking[] = items.map((item) => {
    const start = indexOf(lines, item.section)
    let taxCents = 0
    for (let i = start + 1; start >= 0 && i < lines.length && !/^(?:ABRECHNUNG|BILLING|BUCHUNG|BOOKING)\b/.test(lines[i] ?? ''); i++) {
      const line = lines[i] ?? ''
      if (!TAX_LABEL.test(line) || TAX_BASE.test(line)) continue
      // Bei korrigierten Abrechnungen („VORHER KORREKTUR NACHHER“) gilt der letzte Wert
      const amounts = [...line.matchAll(new RegExp(String.raw`(${NUM})\s+EUR`, 'g'))]
      const last = amounts.at(-1)?.[1]
      const cents = last ? toCents(last, style) : null
      if (cents !== null && cents < 0) taxCents += -cents
    }
    return {
      kind: 'interest' as const,
      occurredOn,
      asset: null,
      quantity: null,
      amountCents: item.grossCents,
      feeCents: 0,
      taxCents,
      netCents: null,
      confidence: 'hoch' as Confidence,
      warnings: [],
      fingerprint: `tr|int|${occurredOn}|${item.label}|${item.grossCents}`,
      note: `Trade Republic ${item.label}`,
    }
  })
  const expected = bookings.reduce((s, b) => s + b.amountCents - b.taxCents, 0)
  const warnings: string[] = []
  const confidence = plausibility(expected, netCents, bookings.length, warnings)
  for (const b of bookings) {
    b.confidence = confidence
    b.warnings.push(...warnings)
  }
  return { source: 'traderepublic', document: title, bookings, notices: [] }
}

export const parseTradeRepublic: PdfParser = (raw) => {
  const lines = normalizeLines(raw)
  if (!detect(lines)) return null
  const style = detectNumberStyle(lines.join('\n'))
  const has = (re: RegExp) => lines.some((l) => re.test(l))

  if (has(/^(?:STORNO|REKLASS)/)) {
    return { source: 'traderepublic', document: 'Storno/Reklassifizierung', bookings: [], notices: ['Stornos und Reklassifizierungen werden nicht automatisch gebucht – die ursprüngliche Buchung bitte von Hand anpassen.'] }
  }
  if (has(/^(?:WERTPAPIERABRECHNUNG|SECURITIES SETTLEMENT|ABRECHNUNG CRYPTO|CRYPTO SETTLEMENT)/)) return parseTrade(lines, style, 'Wertpapierabrechnung')
  if (has(/^(?:DIVIDENDE|DIVIDEND|AUSSCHÜTTUNG|DISTRIBUTION)(?:\s|$)/)) return parseDividend(lines, style, 'Dividende/Ausschüttung')
  if (has(/^(?:ABRECHNUNG ZINSEN|INTEREST INVOICE)/)) return parseInterest(lines, style, 'Zinsabrechnung')
  return {
    source: 'traderepublic',
    document: 'Sonstiges Dokument',
    bookings: [],
    notices: ['Dieses Trade-Republic-Dokument (z. B. Kontoauszug, Steuerabrechnung, Kosteninformation) wird nicht importiert.'],
  }
}

import { applyBasisPoints, type Cents } from '../money'
import { foreignToEurCents, NUM, toCents, toDecimal } from './numbers'
import { cleanName, CURRENCY, DATE, isValidIsin, ISIN, normalizeLines, parseDate } from './text'
import { refundBooking, type Confidence, type ImportedBooking, type ParseResult, type PdfParser } from './types'

/**
 * flatex / flatexDEGIRO (Niederlassung Österreich und Deutschland):
 * Wertpapierabrechnungen, Sammelabrechnungen (mehrere Aufträge je Dokument),
 * Dividenden-/Zinsgutschriften und Ertragsmitteilungen. Zahlen immer deutsch.
 * Formate gelernt an öffentlich verfügbaren, anonymisierten Beispielen
 * (Portfolio Performance, EPL – kein Code übernommen).
 */

const STYLE = 'de' as const
// Nur Leerzeichen, keine Zeilenumbrüche: leere Felder („Eigene Spesen :“) dürfen nicht die nächste Zeile lesen
const AMOUNT = (label: string, currency: string = 'EUR') => new RegExp(String.raw`${label} *:? *(?<amount>${NUM}) *(?<cur>${currency})`)
const TRADE_START = /^Nr\.\s?(?<nr>\d+\/\d+)\s+(?<side>Kauf|Verkauf)\b\s*(?<rest>.*)$/
const INCOME_START = new RegExp(String.raw`^Nr\.\s?(?<nr>\d+)\s+(?<rest>.*\(${ISIN}\/[A-Z0-9]{6}\).*)$`)
const NAME_ISIN = new RegExp(String.raw`^(?<name>.*?)\s*\((?<isin>${ISIN})\/(?<wkn>[A-Z0-9]{6})\)`)

function detect(lines: readonly string[]): boolean {
  return lines.slice(0, 30).some((l) => /flatex(?:DEGIRO)? Bank|FinTech Group Bank|flatex\.(?:at|de)/i.test(l))
}

function first(text: string, re: RegExp): RegExpExecArray | null {
  return re.exec(text)
}

function cents(text: string, re: RegExp): number | null {
  const m = first(text, re)
  return m?.groups?.amount ? toCents(m.groups.amount, STYLE) : null
}

function dateOf(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const m = new RegExp(String.raw`${label} *:? *(${DATE})`).exec(text)
    const d = m ? parseDate(m[1] ?? '') : null
    if (d) return d
  }
  return null
}

function check(expected: number, net: number | null, tolerance: number, warnings: string[]): Confidence {
  if (net === null) {
    warnings.push('Endbetrag nicht gefunden – Beträge bitte prüfen.')
    return 'mittel'
  }
  const diff = Math.abs(expected - net)
  if (diff <= tolerance) return 'hoch'
  warnings.push(`Summe weicht um ${(diff / 100).toFixed(2).replace('.', ',')} € vom Endbetrag ab.`)
  return 'mittel'
}

/** Text eines Blocks; Name und ISIN können auf die nächste Zeile umbrechen. */
function nameAndIsin(head: string, next: string): { name: string; isin: string } | null {
  const m = NAME_ISIN.exec(head) ?? NAME_ISIN.exec(`${head} ${next}`)
  if (!m?.groups?.isin) return null
  return { name: cleanName(m.groups.name ?? ''), isin: m.groups.isin }
}

function parseTrades(lines: readonly string[], title: string): ParseResult {
  const notices: string[] = []
  const bookings: ImportedBooking[] = []
  const all = lines.join('\n')
  const starts = lines.map((l, i) => (TRADE_START.test(l) ? i : -1)).filter((i) => i >= 0)
  for (const [n, start] of starts.entries()) {
    const end = starts[n + 1] ?? lines.length
    const block = lines.slice(start, end)
    const text = block.join('\n')
    const head = TRADE_START.exec(block[0] ?? '')?.groups
    const id = nameAndIsin(head?.rest ?? '', block[1] ?? '')
    if (!head || !id) {
      notices.push('Ein Auftrag ohne lesbare ISIN wurde übersprungen.')
      continue
    }
    const warnings: string[] = []
    if (!isValidIsin(id.isin)) warnings.push(`ISIN ${id.isin} hat eine ungültige Prüfziffer.`)
    const kind = head.side === 'Verkauf' ? 'sell' : 'buy'
    const qty = new RegExp(String.raw`(?:Ausgeführt|davon ausgef\.) *:? *(?<qty>${NUM}) *(?<unit>St\.|${CURRENCY})`).exec(text)?.groups
    if (!qty || qty.unit !== 'St.') {
      notices.push(`${id.name}: Anleihen (Nominale statt Stück) werden noch nicht importiert.`)
      continue
    }
    const quantity = toDecimal(qty.qty ?? '', STYLE)
    const occurredOn = dateOf(text, ['Schlusstag', 'Handelstag']) ?? dateOf(all, ['Handelstag', 'Schlusstag', 'Auftragsdatum'])
    const kurswert = first(text, AMOUNT('Kurswert', CURRENCY))?.groups
    const fx = first(text, new RegExp(String.raw`Devisenkurs *:? *(?<rate>${NUM})`))?.groups?.rate
    let amountCents: number | null = null
    if (kurswert?.cur === 'EUR') amountCents = toCents(kurswert.amount ?? '', STYLE)
    else if (kurswert && fx) {
      const amount = toDecimal(kurswert.amount ?? '', STYLE)
      const rate = toDecimal(fx, STYLE)
      amountCents = amount && rate ? foreignToEurCents(amount, rate) : null
      warnings.push(`Kurswert in ${kurswert.cur} mit Devisenkurs ${fx} umgerechnet.`)
    }
    if (!quantity || !occurredOn || amountCents === null) {
      notices.push(`${id.name}: Menge, Datum oder Kurswert nicht lesbar.`)
      continue
    }
    const feeCents = (cents(text, AMOUNT('Provision')) ?? 0) + (cents(text, AMOUNT('Eigene Spesen')) ?? 0) + (cents(text, AMOUNT('Fremde Spesen')) ?? 0)
    const tax = cents(text, AMOUNT(String.raw`Einbeh\. *(?:KESt|Steuer)`)) ?? 0
    const taxCents = Math.max(0, tax)
    const net = cents(text, AMOUNT('Endbetrag'))
    const expected = kind === 'buy' ? -(amountCents + feeCents + taxCents) : amountCents - feeCents - taxCents - Math.min(tax, 0)
    const confidence = check(expected, net, 1, warnings)
    const trade: ImportedBooking = {
      kind,
      occurredOn,
      asset: { kind: 'security', isin: id.isin, symbol: null, name: id.name },
      quantity,
      amountCents,
      feeCents,
      taxCents,
      netCents: net,
      confidence,
      warnings,
      fingerprint: `flatex|${head.nr}|${kind}|${occurredOn}|${id.isin}|${quantity}`,
      note: null,
    }
    bookings.push(trade)
    if (tax < 0) bookings.push(refundBooking(trade, -tax, 'KESt-Gutschrift laut Abrechnung (Verlustausgleich)'))
  }
  if (starts.length === 0) notices.push('Abrechnung erkannt, aber kein Auftrag lesbar.')
  return { source: 'flatex', document: title, bookings, notices }
}

function parseIncome(lines: readonly string[], title: string): ParseResult {
  const text = lines.join('\n')
  const startIdx = lines.findIndex((l) => INCOME_START.test(l))
  const head = startIdx >= 0 ? INCOME_START.exec(lines[startIdx] ?? '')?.groups : undefined
  const id = head ? nameAndIsin(head.rest ?? '', '') : null
  if (!head || !id) return { source: 'flatex', document: title, bookings: [], notices: ['Ertragsmitteilung erkannt, aber Wertpapier nicht lesbar.'] }
  const warnings: string[] = []
  const occurredOn = dateOf(text, ['Zahlungstag', 'Valuta', 'Zuflusstag', 'Zinstermin'])
  const net = first(text, AMOUNT('Endbetrag', CURRENCY))?.groups
  const netCents = net?.cur === 'EUR' ? toCents(net.amount ?? '', STYLE) : null
  const kestCents = cents(text, AMOUNT(String.raw`Einbeh\. *Steuer`)) ?? 0
  if (!occurredOn) return { source: 'flatex', document: title, bookings: [], notices: [`${id.name}: Zahltag nicht lesbar.`] }

  // Thesaurierende Fonds: kein Geld fließt; gebucht wird der ausschüttungsgleiche Ertrag (AGE)
  // mit der darauf belasteten KESt – AGE erhöhen steuerlich die Anschaffungskosten.
  if (/thesaurierend/i.test(text) && !/aussch.ttend/i.test(text)) {
    if (netCents === null || netCents >= 0 || kestCents <= 0) {
      return { source: 'flatex', document: title, bookings: [], notices: [`${id.name}: Ertragsmitteilung ohne Steuerbelastung – nichts zu buchen.`] }
    }
    const asset = { kind: 'security' as const, isin: id.isin, symbol: null, name: id.name }
    const fingerprint = `flatex|age|${head.nr}|${occurredOn}|${id.isin}`
    const thes = first(text, new RegExp(String.raw`Bruttothesaurierung *: *(?<amount>${NUM}) *(?<cur>${CURRENCY})`))?.groups
    const fxRaw = first(text, new RegExp(String.raw`Devisenkurs *:? *(?<rate>${NUM})`))?.groups?.rate
    const thesDecimal = thes ? toDecimal(thes.amount ?? '', STYLE) : null
    const fxRate = fxRaw ? toDecimal(fxRaw, STYLE) : null
    const ageCents = !thes || !thesDecimal ? null : thes.cur === 'EUR' ? toCents(thesDecimal, 'en') : fxRate ? foreignToEurCents(thesDecimal, fxRate) : null
    const consistent = -netCents === kestCents
    if (ageCents && ageCents > 0) {
      // KESt sollte 27,5 % der AGE sein (± 1 Cent Rundung pro Umrechnung)
      const plausible = Math.abs(applyBasisPoints(ageCents as Cents, 2_750) - kestCents) <= 2
      return {
        source: 'flatex',
        document: title,
        notices: [],
        bookings: [
          {
            kind: 'age',
            occurredOn,
            asset,
            quantity: null,
            amountCents: ageCents,
            feeCents: 0,
            taxCents: kestCents,
            netCents,
            confidence: consistent && plausible ? 'hoch' : 'mittel',
            warnings: [
              ...(consistent ? [] : ['Steuerbetrag und Endbetrag passen nicht zusammen – bitte prüfen.']),
              ...(plausible ? [] : ['Die KESt ist nicht 27,5 % des ausschüttungsgleichen Ertrags – bitte mit der Meldung auf my.oekb.at vergleichen.']),
            ],
            fingerprint,
            note: 'Ausschüttungsgleicher Ertrag (thesaurierender Fonds)',
          },
        ],
      }
    }
    // Ohne lesbaren Ertrag nur die Steuer buchen (Anschaffungskosten dann bitte selbst ergänzen)
    return {
      source: 'flatex',
      document: title,
      notices: [],
      bookings: [
        {
          kind: 'tax',
          occurredOn,
          asset,
          quantity: null,
          amountCents: -netCents,
          feeCents: 0,
          taxCents: 0,
          netCents,
          confidence: 'mittel',
          warnings: ['Ausschüttungsgleicher Ertrag nicht lesbar – nur die KESt übernommen; den Ertrag bitte als AGE-Buchung ergänzen.'],
          fingerprint,
          note: 'KESt auf ausschüttungsgleiche Erträge (thesaurierender Fonds)',
        },
      ],
    }
  }

  const gross = first(text, new RegExp(String.raw`(?:Bruttodividende|Bruttoausschüttung|Ausschüttung|Zinsbetrag) *: *(?<amount>${NUM}) *(?<cur>${CURRENCY})`))?.groups
  const fx = first(text, new RegExp(String.raw`Devisenkurs *:? *(?<rate>${NUM})`))?.groups?.rate
  const rate = fx ? toDecimal(fx, STYLE) : null
  const grossDecimal = gross ? toDecimal(gross.amount ?? '', STYLE) : null
  if (!gross || !grossDecimal) return { source: 'flatex', document: title, bookings: [], notices: [`${id.name}: Bruttobetrag nicht lesbar.`] }
  let amountCents: number | null
  let taxCents = Math.max(0, kestCents)
  const withholding = first(text, new RegExp(String.raw`Gez\. *Quellenst\. *: *(?<amount>${NUM}) *(?<cur>${CURRENCY})`))?.groups
  if (gross.cur === 'EUR') {
    amountCents = toCents(grossDecimal, 'en')
    if (withholding?.cur === 'EUR') taxCents += toCents(withholding.amount ?? '', STYLE) ?? 0
  } else if (rate) {
    amountCents = foreignToEurCents(grossDecimal, rate)
    const w = withholding ? toDecimal(withholding.amount ?? '', STYLE) : null
    if (w && withholding?.cur === gross.cur) taxCents += foreignToEurCents(w, rate) ?? 0
  } else {
    amountCents = null
  }
  if (amountCents === null || amountCents <= 0) return { source: 'flatex', document: title, bookings: [], notices: [`${id.name}: Betrag in ${gross.cur} ohne Devisenkurs.`] }
  if (net && net.cur !== 'EUR') warnings.push(`Endbetrag in ${net.cur} – Gutschrift auf einem Fremdwährungskonto.`)
  const refundCents = Math.max(0, -kestCents)
  const confidence = check(amountCents - taxCents + refundCents, netCents, gross.cur === 'EUR' ? 1 : 2, warnings)
  const isInterest = /Zinsgutschrift/i.test(text)
  const quantity = new RegExp(String.raw`St\.(?:\/Nominale)? *: *(?<qty>${NUM})`).exec(text)?.groups?.qty
  const income: ImportedBooking = {
    kind: isInterest ? 'interest' : 'dividend',
    occurredOn,
    asset: { kind: 'security', isin: id.isin, symbol: null, name: id.name },
    quantity: null,
    amountCents,
    feeCents: 0,
    taxCents,
    netCents,
    confidence,
    warnings,
    fingerprint: `flatex|inc|${head.nr}|${occurredOn}|${id.isin}`,
    note: [quantity ? `${quantity} St.` : null, gross.cur === 'EUR' ? null : `Brutto ${gross.amount} ${gross.cur}, Devisenkurs ${fx}`].filter(Boolean).join(' · ') || null,
  }
  const refund = refundCents > 0 ? [refundBooking(income, refundCents, 'KESt-Gutschrift laut Ertragsmitteilung (Verlustausgleich)')] : []
  return { source: 'flatex', document: title, notices: [], bookings: [income, ...refund] }
}

export const parseFlatex: PdfParser = (raw) => {
  const lines = normalizeLines(raw)
  if (!detect(lines)) return null
  const has = (re: RegExp) => lines.some((l) => re.test(l))
  if (has(/^Storno\b/i)) return { source: 'flatex', document: 'Storno', bookings: [], notices: ['Stornos werden nicht automatisch gebucht – die ursprüngliche Buchung bitte von Hand anpassen.'] }
  if (has(/Sammelabrechnung \((?:Kauf\/-verkauf Kryptowerte|Wertpapierkauf\/-verkauf)\)/) && has(/Kryptowerte/)) {
    return { source: 'flatex', document: 'Sammelabrechnung Krypto', bookings: [], notices: ['Krypto-Abrechnungen von flatex werden noch nicht importiert.'] }
  }
  if (has(/^(?:Wertpapierabrechnung (?:Kauf|Verkauf)|Sammelabrechnung \(Wertpapierkauf\/-verkauf\))/)) return parseTrades(lines, has(/^Sammelabrechnung/) ? 'Sammelabrechnung' : 'Wertpapierabrechnung')
  if (has(/^(?:Dividendengutschrift|Ertragsmitteilung|Zinsgutschrift)/)) return parseIncome(lines, 'Dividende/Ertrag')
  return { source: 'flatex', document: 'Sonstiges Dokument', bookings: [], notices: ['Dieses flatex-Dokument (z. B. Kontoauszug, Depotservicegebühr, Vorabpauschale) wird nicht importiert.'] }
}

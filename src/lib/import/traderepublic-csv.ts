import { scaleDecimal, toCents, toDecimal, type NumberStyle } from './numbers'
import { cleanName, isValidIsin } from './text'
import { refundBooking, type CsvParser, type ImportAsset, type ImportedBooking, type ParseResult } from './types'

/**
 * Trade-Republic-Transaktionsexport (App/Web: Profil → Kontoauszüge →
 * Transaktionsexport, seit April 2026). Kein offizielles Formatdokument –
 * Spalten und Typen nach öffentlichen Beschreibungen in Open-Source-Importern
 * (Portfolio Performance Issue #6114, broker-to-edavki, zaster; nur gelesen,
 * kein Code übernommen), Quellen in docs/DATA_SOURCES.md.
 *
 * Format: 23 Spalten, Komma (neuere Fassung: Semikolon und `value_date` statt
 * `mcc_code`), Dezimalpunkt, `datetime` in UTC, `date` = Buchungstag (Berlin).
 * Vorzeichen aus Sicht des Kontos: Kauf `amount` < 0, Verkauf `amount` > 0 und
 * `shares` < 0; `fee`/`tax` < 0 sind Belastungen. `amount` ist der Kurswert bzw.
 * Bruttoertrag, Gebühr und Steuer stehen nur in ihren eigenen Spalten.
 *
 * Übernommen werden nur Wertpapier- und Krypto-Buchungen, Dividenden, Zinsen
 * und Steuerkorrekturen. Karte, Überweisungen, Ein- und Auszahlungen bleiben
 * draußen (kein Girokonto, Brief) – Gegenkonto, IBAN, Verwendungszweck und
 * Händler werden nie gelesen.
 */

const REQUIRED = ['datetime', 'date', 'account_type', 'category', 'type', 'asset_class', 'name', 'symbol', 'shares', 'price', 'amount', 'fee', 'tax', 'currency', 'transaction_id'] as const
type Column = (typeof REQUIRED)[number]

const SECURITY_CLASSES = new Set(['STOCK', 'FUND'])
const TRADE_LABEL: Record<string, string> = {
  SAVINGS_PLAN_EXECUTED: 'Sparplan',
  SAVINGS_PLAN: 'Sparplan',
  SAVEBACK: 'Saveback',
  BENEFITS_SAVEBACK: 'Saveback',
  ROUND_UP: 'Round-up',
  ROUNDUP: 'Round-up',
  BENEFITS_SPARE_CHANGE: 'Round-up',
  SPARE_CHANGE: 'Round-up',
}
/** Cash-Buchungen, die bewusst nicht übernommen werden (kein Girokonto). */
const CASH_IGNORED = /^(?:CUSTOMER_|TRANSFER_|CARD_|DIRECT_DEBIT|PAYMENT|GIFT$|BENEFITS_SAVEBACK$|BENEFITS_)/

interface CorporateRow {
  date: string
  type: string
  isin: string
  name: string
  shares: string
  fingerprint: string
}

const QTY_PLACES = 12
const QTY_SCALE = 10n ** BigInt(QTY_PLACES)

/** Skalierte Stückzahl → Dezimaltext ohne überflüssige Nullen. */
function quantityText(scaled: bigint): string {
  const whole = scaled / QTY_SCALE
  const fraction = (scaled % QTY_SCALE).toString().padStart(QTY_PLACES, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

const dayText = (date: string) => date.split('-').reverse().join('.')

/**
 * Kapitalmaßnahmen und Depotüberträge. Sicher erkennbar ist nur ein Split, den
 * TR als Aus- und Einbuchung derselben ISIN am selben Tag zeigt: die
 * zusätzlichen Stück werden ohne Kosten eingebucht (gleitender Durchschnitt
 * bleibt richtig). Alles andere listen wir zum Buchen von Hand auf.
 */
function corporateActions(rows: readonly CorporateRow[]): { bookings: ImportedBooking[]; manual: string[] } {
  const groups = new Map<string, { pos: bigint; neg: bigint; rows: CorporateRow[] }>()
  for (const r of rows) {
    const key = `${r.date}|${r.isin}`
    const g = groups.get(key) ?? { pos: 0n, neg: 0n, rows: [] }
    const scaled = scaleDecimal(r.shares, QTY_PLACES)
    if (scaled > 0n) g.pos += scaled
    else g.neg -= scaled
    g.rows.push(r)
    groups.set(key, g)
  }
  const bookings: ImportedBooking[] = []
  const manual: string[] = []
  for (const g of groups.values()) {
    const first = g.rows[0]!
    if (g.pos > 0n && g.neg > 0n && g.pos > g.neg) {
      const ratio = Number((g.pos * 1000n) / g.neg) / 1000
      bookings.push({
        kind: 'transfer_in',
        occurredOn: first.date,
        asset: { kind: 'security', isin: first.isin, symbol: null, name: first.name },
        quantity: quantityText(g.pos - g.neg),
        amountCents: 0,
        feeCents: 0,
        taxCents: 0,
        netCents: null,
        confidence: 'mittel',
        warnings: [`Split o. Ä. (etwa ${String(ratio).replace('.', ',')} : 1) – zusätzliche Stück ohne Kosten eingebucht, bitte prüfen.`],
        fingerprint: `trcsv|split|${g.rows.map((r) => r.fingerprint).join('|')}`,
        note: 'Split (Transaktionsexport)',
      })
      continue
    }
    for (const r of g.rows) {
      const sign = r.shares.startsWith('-') ? '' : '+'
      manual.push(`${r.type} · ${r.name} · ${dayText(r.date)} · ${sign}${r.shares.replace('.', ',')} Stück`)
    }
  }
  return { bookings, manual }
}

function numberStyle(raw: string): NumberStyle {
  // Dezimalpunkt laut Format; ein einzelnes Komma ohne Punkt deutet auf deutsche Zahlen
  return /,\d+$/.test(raw) && !raw.includes('.') ? 'de' : 'en'
}

function cents(raw: string | null): number | null {
  if (!raw) return null
  return toCents(raw, numberStyle(raw))
}

function decimal(raw: string | null): string | null {
  if (!raw) return null
  const value = toDecimal(raw, numberStyle(raw))
  // „2.0000000000“ → „2“ (TR schreibt Stück mit zehn Nachkommastellen)
  return value?.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
}

/** Krypto: TR nutzt Pseudo-ISINs wie `XF000BTC0017`; sonst steht das Kürzel direkt da. */
function cryptoSymbol(symbol: string): string | null {
  const pseudo = /^XF000([A-Z]{2,6})\d{1,5}$/.exec(symbol)
  if (pseudo) return pseudo[1] ?? null
  return /^[A-Z0-9]{2,10}$/.test(symbol) && !isValidIsin(symbol) ? symbol : null
}

export const parseTradeRepublicCsv: CsvParser = (rows) => {
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
  if (!REQUIRED.every((c) => header.includes(c)) || !header.includes('counterparty_iban')) return null
  const col = Object.fromEntries(REQUIRED.map((c) => [c, header.indexOf(c)])) as Record<Column, number>
  const get = (r: readonly string[], c: Column): string | null => {
    const v = (r[col[c]] ?? '').trim()
    return v === '' ? null : v
  }

  const bookings: ImportedBooking[] = []
  const skipped = new Map<string, number>()
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
  const unknownTypes = new Set<string>()
  const corporate: CorporateRow[] = []

  for (const r of rows.slice(1)) {
    const account = (get(r, 'account_type') ?? 'DEFAULT').toUpperCase()
    const category = (get(r, 'category') ?? '').toUpperCase()
    const type = (get(r, 'type') ?? '').toUpperCase()
    const assetClass = (get(r, 'asset_class') ?? '').toUpperCase()
    const symbol = (get(r, 'symbol') ?? '').toUpperCase()
    const date = get(r, 'date')
    const id = get(r, 'transaction_id')

    if (account !== 'DEFAULT') {
      skip('Buchungen eines Junior-/Unterkontos (gehört einer anderen Person)')
      continue
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skip('Zeilen ohne gültiges Datum')
      continue
    }
    const currency = (get(r, 'currency') ?? 'EUR').toUpperCase()
    if (currency !== 'EUR') {
      skip(`Buchungen in ${currency} (nur EUR wird übernommen)`)
      continue
    }

    const amount = cents(get(r, 'amount'))
    const fee = cents(get(r, 'fee')) ?? 0
    const tax = cents(get(r, 'tax')) ?? 0
    const shares = decimal(get(r, 'shares'))
    const fingerprint = `trcsv|${id ?? [date, type, symbol, get(r, 'shares'), get(r, 'amount')].join('|')}`
    const warnings: string[] = []
    if (fee > 0) warnings.push('Gebühren-Gutschrift im Export – bitte prüfen.')
    const feeCents = Math.max(0, -fee)
    const taxCents = Math.max(0, -tax)
    // Positive Steuer = Erstattung (z. B. KESt-Verlustausgleich) – eigene Buchung
    const withRefund = (b: ImportedBooking): ImportedBooking[] => (tax > 0 ? [b, refundBooking(b, tax, 'Steuererstattung laut Transaktionsexport')] : [b])

    // ── Handel ────────────────────────────────────────────────────────────
    if (category === 'TRADING') {
      let asset: ImportAsset
      if (SECURITY_CLASSES.has(assetClass)) {
        if (!isValidIsin(symbol)) {
          skip('Wertpapiere ohne gültige ISIN')
          continue
        }
        asset = { kind: 'security', isin: symbol, symbol: null, name: cleanName(get(r, 'name') ?? symbol) }
      } else if (assetClass === 'CRYPTO') {
        const code = cryptoSymbol(symbol)
        if (!code) {
          skip('Krypto ohne erkennbares Kürzel')
          continue
        }
        asset = { kind: 'crypto', isin: null, symbol: code, name: cleanName(get(r, 'name') ?? code) }
      } else {
        skip(
          assetClass === 'BOND'
            ? 'Anleihen (bitte von Hand erfassen)'
            : assetClass === 'DERIVATIVE'
              ? 'Derivate (nicht unterstützt)'
              : `Anlageklasse „${assetClass || 'leer'}“ (nicht unterstützt)`,
        )
        continue
      }
      if (!shares || shares === '0' || amount === null) {
        skip('Käufe/Verkäufe ohne Stückzahl oder Betrag')
        continue
      }
      const isSell = shares.startsWith('-')
      if ((type === 'SELL') !== isSell && (type === 'SELL' || type === 'BUY')) {
        skip('Käufe/Verkäufe mit widersprüchlichem Vorzeichen')
        continue
      }
      const label = TRADE_LABEL[type] ?? null
      const known = type === 'BUY' || type === 'SELL' || label !== null
      if (!known) warnings.push(`Unbekannte Handelsart „${type}“ – als ${isSell ? 'Verkauf' : 'Kauf'} gelesen, bitte prüfen.`)
      const amountCents = Math.abs(amount)
      // Kurswert gegen Stück × Kurs prüfen (Toleranz: Rundung auf Cent)
      const price = decimal(get(r, 'price'))
      if (price) {
        const raw = scaleDecimal(isSell ? shares.slice(1) : shares, 10) * scaleDecimal(price, 6)
        const expected = Number((raw + 5n * 10n ** 13n) / 10n ** 14n)
        if (Math.abs(expected - amountCents) > Math.max(2, Math.round(amountCents / 2000))) warnings.push('Betrag passt nicht zu Stück × Kurs – bitte prüfen.')
      }
      if (amountCents === 0 && !isSell) warnings.push('Ohne Kaufpreis (z. B. Gratisaktie) – Anschaffungskosten 0 übernommen.')
      bookings.push(
        ...withRefund({
          kind: isSell ? 'sell' : 'buy',
          occurredOn: date,
          asset,
          quantity: isSell ? shares.slice(1) : shares,
          amountCents,
          feeCents,
          taxCents,
          netCents: amount + fee + tax,
          // Format ohne offizielle Dokumentation: bekannte Arten „hoch“, Krypto/Unbekanntes „mittel“
          confidence: known && asset.kind === 'security' && warnings.length === 0 ? 'hoch' : 'mittel',
          warnings,
          fingerprint,
          note: label,
        }),
      )
      continue
    }

    // ── Kapitalmaßnahmen, Ein-/Auslieferungen: von Hand ────────────────────
    if (category === 'CORPORATE_ACTION' || category === 'DELIVERY') {
      if (assetClass === 'BOND' || type.includes('MATURITY')) skip('Anleihen (bitte von Hand erfassen)')
      else if (!isValidIsin(symbol) || !shares || shares === '0') skip('Kapitalmaßnahmen ohne ISIN oder Stückzahl')
      else corporate.push({ date, type: type || category, isin: symbol, name: cleanName(get(r, 'name') ?? symbol), shares, fingerprint })
      continue
    }
    if (type === 'TILG' || type === 'FINAL_MATURITY' || type === 'REDEMPTION') {
      skip('Anleihen-Tilgungen (bitte von Hand erfassen)')
      continue
    }

    // ── Erträge und Steuern ───────────────────────────────────────────────
    if (type === 'DIVIDEND' || type === 'DISTRIBUTION') {
      if (!isValidIsin(symbol) || amount === null) {
        skip('Ausschüttungen ohne ISIN oder Betrag')
        continue
      }
      if (amount <= 0) {
        skip('Storno/Korrektur einer Ausschüttung (bitte von Hand)')
        continue
      }
      bookings.push(
        ...withRefund({
          kind: 'dividend',
          occurredOn: date,
          asset: { kind: 'security', isin: symbol, symbol: null, name: cleanName(get(r, 'name') ?? symbol) },
          quantity: null,
          amountCents: amount,
          feeCents,
          taxCents,
          netCents: amount + fee + tax,
          confidence: 'hoch',
          warnings,
          fingerprint,
          note: type === 'DISTRIBUTION' ? 'Ausschüttung' : null,
        }),
      )
      continue
    }
    if (type === 'INTEREST_PAYMENT' || type === 'INTEREST') {
      if (amount === null || amount <= 0) {
        skip('Zinskorrekturen (bitte von Hand)')
        continue
      }
      bookings.push(
        ...withRefund({
          kind: 'interest',
          occurredOn: date,
          asset: null,
          quantity: null,
          amountCents: amount,
          feeCents,
          taxCents,
          netCents: amount + fee + tax,
          confidence: 'hoch',
          warnings,
          fingerprint,
          note: 'Zinsen Verrechnungskonto',
        }),
      )
      continue
    }
    if (type === 'TAX_OPTIMIZATION' || type === 'TAX_REFUND' || type === 'TAX_CORRECTION') {
      const value = (amount ?? 0) + tax
      if (value === 0) {
        skip('Steuerbuchungen ohne Betrag')
        continue
      }
      const asset: ImportAsset | null = isValidIsin(symbol) ? { kind: 'security', isin: symbol, symbol: null, name: cleanName(get(r, 'name') ?? symbol) } : null
      bookings.push({
        kind: value > 0 ? 'tax_refund' : 'tax',
        occurredOn: date,
        asset,
        quantity: null,
        amountCents: Math.abs(value),
        feeCents: 0,
        taxCents: 0,
        netCents: value,
        confidence: 'mittel',
        warnings: ['Steuerausgleich der Bank – bitte mit der Steuerabrechnung abgleichen.'],
        fingerprint,
        note: value > 0 ? 'KESt-Gutschrift (Verlustausgleich)' : 'KESt-Nachbelastung',
      })
      continue
    }

    // ── Konto: bewusst nicht übernommen ───────────────────────────────────
    if (CASH_IGNORED.test(type) || (category === 'CASH' && !symbol)) {
      skip('Ein-/Auszahlungen, Karte und Überweisungen (kein Girokonto)')
      continue
    }
    if (type === 'EARNINGS' || type === 'PRE_DETERMINED_TAX_BASE') {
      skip('Vorabpauschale (deutsches Steuerrecht, in Österreich nicht relevant)')
      continue
    }
    unknownTypes.add(type || 'leer')
    skip('Zeilen unbekannter Art')
  }

  const actions = corporateActions(corporate)
  bookings.push(...actions.bookings)
  const notices = [...skipped.entries()].map(([reason, count]) => `${count} × nicht übernommen: ${reason}`)
  if (actions.manual.length > 0) {
    const shown = actions.manual.slice(0, 15)
    notices.push(
      `${actions.manual.length} × Kapitalmaßnahme oder Depotübertrag – bitte von Hand buchen (Split, Übertrag, Umtausch): ${shown.join('; ')}${actions.manual.length > shown.length ? `; … und ${actions.manual.length - shown.length} weitere` : ''}.`,
    )
  }
  if (unknownTypes.size > 0) notices.push(`Unbekannte Arten: ${[...unknownTypes].slice(0, 8).join(', ')}.`)
  const result: ParseResult = { source: 'traderepublic', document: 'Transaktionsexport (CSV)', bookings, notices }
  return result
}

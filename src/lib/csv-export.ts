/**
 * CSV für Excel/LibreOffice (deutsche Einstellungen: Semikolon, Dezimalkomma,
 * UTF-8 mit BOM). Schutz vor Formel-Injection (OWASP „CSV Injection“): Text,
 * der – auch nach Leerraum – mit = + - @ beginnt (auch in voller Breite),
 * bekommt ein vorangestelltes Apostroph und wird so nie als Formel gelesen.
 * Tabs und Zeilenumbrüche werden zu Leerzeichen. Beträge sind ein eigener
 * Zelltyp aus Integer-Cent – nur sie dürfen mit einem Minus beginnen.
 */

const AMOUNT = Symbol('amount')

export interface CsvAmount {
  readonly [AMOUNT]: true
  readonly cents: number
}

export type CsvValue = string | CsvAmount | null

/** Betragszelle aus Integer-Cent, z. B. -1234,56 */
export function csvAmount(cents: number): CsvAmount {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Beträge nur als ganze Cent.')
  return { [AMOUNT]: true, cents }
}

const isAmount = (value: CsvValue): value is CsvAmount => typeof value === 'object' && value !== null && AMOUNT in value

// = + - @ sowie dieselben Zeichen in voller Breite (U+FF1D, U+FF0B, U+FF0D, U+FF20), davor beliebiger Leerraum inkl. geschütztem Leerzeichen
const FORMULA_START = /^[\s\u00a0]*[=+\-@\uff1d\uff0b\uff0d\uff20]/

function amountText(cents: number): string {
  const abs = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** Textzelle: Steuerzeichen raus, Formelbeginn entschärfen, immer in Anführungszeichen. */
export function csvText(value: string): string {
  const clean = value.replace(/[\t\r\n]+/g, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  const safe = FORMULA_START.test(clean) ? `'${clean}` : clean
  return `"${safe.replaceAll('"', '""')}"`
}

export function csvCell(value: CsvValue): string {
  if (value === null) return ''
  if (isAmount(value)) return amountText(value.cents)
  return csvText(value)
}

export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}

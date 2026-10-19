/**
 * JSON von Kursanbietern parsen, ohne Zahlen durch Float zu schicken: jede Zahl
 * kommt als Original-Text zurück (JSON.parse-Quelltextzugriff, Node ≥ 21).
 * Externe Daten sind nicht vertrauenswürdig – danach immer mit zod prüfen.
 */
export function parseJsonExact(text: string): unknown {
  const reviver = function (this: unknown, _key: string, value: unknown, context?: { source?: string }) {
    return typeof value === 'number' ? (context?.source ?? String(value)) : value
  }
  return JSON.parse(text, reviver as (this: unknown, key: string, value: unknown) => unknown)
}

/** Dezimalzahl als Text (wie aus parseJsonExact), auch in Exponentialschreibweise. */
export const NUMERIC_TEXT = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/

/** Zahl in wissenschaftlicher Schreibweise (z. B. 1.2e-5) in Dezimaltext umwandeln. */
export function expandExponent(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([-+]?\d+)$/.exec(text)
  if (!match) return text
  const [, sign = '', int = '0', frac = '', expText = '0'] = match
  const exp = Number(expText)
  const digits = int + frac
  const point = int.length + exp
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`.replace(/\.?0+$/, '') || '0'
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

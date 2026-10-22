/**
 * Kurze Anzeigenamen für Listen. Offizielle Fondsnamen tragen viel Beiwerk
 * („UCITS ETF USD (Acc)“), das in schmalen Spalten genau den Teil
 * abschneidet, der zwei Fonds unterscheidet. Der volle Name bleibt auf der
 * Wertpapier-Seite und im Titel-Attribut der Liste.
 */

/** Ab hier ist der Rest eines Fondsnamens Beiwerk (Rechtsform, Anteilsklasse, Währung). */
const FUND_BOILERPLATE = /\s+(?:UCITS|ETF|ETC|ETN)(?=\s|$|\))/i

/** Rechtsform am Ende eines Firmennamens („Apple Inc.“ → „Apple“). */
const LEGAL_SUFFIX = /,?\s+(?:Inc\.?|Corp\.?|Corporation|AG|SE|plc|N\.V\.|S\.A\.|Ltd\.?|Co\.)$/i

/** Kürzer als das wirkt der Name abgeschnitten – dann lieber der volle. */
const MIN_LENGTH = 4

export function displayName(name: string): string {
  const full = name.replace(/\s+/g, ' ').trim()
  let short = full
  const boilerplate = FUND_BOILERPLATE.exec(short)
  if (boilerplate && boilerplate.index > 0) short = short.slice(0, boilerplate.index)
  short = short.replace(LEGAL_SUFFIX, '')
  short = short.replace(/[\s,–-]+$/, '').trim()
  return short.length >= MIN_LENGTH ? short : full
}

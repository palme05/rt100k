/** Ein Kurs je Instrument – nie in der DB gespeichert, nur kurz gecacht. */
export interface Quote {
  /** Kurs × 10⁶ in Kurswährung (Edelmetalle: je Gramm) */
  priceMicros: bigint
  currency: string
  asOf: Date
  source: QuoteSource
  /** älter als üblich (z. B. letzter Schlusskurs aus der DB) */
  delayed: boolean
}

export type QuoteSource = 'yahoo' | 'coingecko' | 'gold-api' | 'schlusskurs' | 'testdaten'

/** Suchergebnis beim Anlegen eines Instruments. */
export interface InstrumentCandidate {
  provider: 'yahoo' | 'coingecko' | 'metal'
  /** Yahoo-Symbol, CoinGecko-ID oder Metallkürzel */
  key: string
  name: string
  kind: 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'metal'
  detail: string
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(`${provider}: ${message}`)
    this.name = 'ProviderError'
  }
}

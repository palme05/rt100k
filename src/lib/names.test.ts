import { describe, expect, it } from 'vitest'
import { displayName } from './names'

describe('displayName', () => {
  it('kürzt Fondsnamen auf den unterscheidenden Teil', () => {
    expect(displayName('iShares Core MSCI World UCITS ETF USD (Acc)')).toBe('iShares Core MSCI World')
    expect(displayName('Vanguard FTSE All-World UCITS ETF USD Accumulation')).toBe('Vanguard FTSE All-World')
    expect(displayName('Vanguard FTSE All-World UCITS ETF (Acc)')).toBe('Vanguard FTSE All-World')
    expect(displayName('Xtrackers MSCI World Swap UCITS ETF 1C')).toBe('Xtrackers MSCI World Swap')
    expect(displayName('SPDR S&P 500 ETF Trust')).toBe('SPDR S&P 500')
    expect(displayName('Invesco Physical Gold ETC')).toBe('Invesco Physical Gold')
  })

  it('lässt „EURO“ und ähnliche Wortteile stehen', () => {
    expect(displayName('iShares Core EURO STOXX 50 UCITS ETF EUR (Dist)')).toBe('iShares Core EURO STOXX 50')
    expect(displayName('Amundi ETFlex Europe')).toBe('Amundi ETFlex Europe')
  })

  it('entfernt die Rechtsform am Ende von Firmennamen', () => {
    expect(displayName('Apple Inc.')).toBe('Apple')
    expect(displayName('Siemens AG')).toBe('Siemens')
    expect(displayName('Unilever PLC')).toBe('Unilever')
    expect(displayName('Muster Holding')).toBe('Muster Holding')
  })

  it('behält kurze oder einfache Namen unverändert', () => {
    expect(displayName('Bitcoin')).toBe('Bitcoin')
    expect(displayName('Gold')).toBe('Gold')
    expect(displayName('SAP SE')).toBe('SAP SE')
    expect(displayName('ETF')).toBe('ETF')
    expect(displayName('  Ethereum   Classic ')).toBe('Ethereum Classic')
  })
})

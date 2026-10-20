import { describe, expect, it } from 'vitest'
import type { LedgerBooking } from './holdings'
import { detectSavingsPlans, nextMonthSameDay } from './savings'

let n = 0
const buy = (day: string, cents: number, instrumentId = 'etf', portfolioId = 'tr'): LedgerBooking & { portfolioId: string } => ({
  id: `b${++n}`,
  portfolioId,
  type: 'buy',
  occurredOn: day,
  instrumentId,
  quantity: '1',
  factor: null,
  amountCents: cents,
  feeCents: 0,
  taxCents: 0,
})

describe('Sparpläne erkennen', () => {
  it('drei Käufe im Monatsabstand mit ähnlichem Betrag → Plan mit nächster Ausführung', () => {
    const plans = detectSavingsPlans([buy('2026-07-02', 20_000), buy('2026-08-03', 19_990), buy('2026-09-02', 20_000), buy('2026-10-02', 20_000)], '2026-10-20')
    expect(plans).toEqual([{ portfolioId: 'tr', instrumentId: 'etf', amountCents: 20_000, executions: 4, lastOn: '2026-10-02', nextOn: '2026-11-02', overdue: false }])
  })

  it('Einzelkäufe dazwischen stören nicht; andere Beträge zählen nicht', () => {
    const plans = detectSavingsPlans([buy('2026-08-01', 10_000), buy('2026-08-15', 250_000), buy('2026-09-01', 10_000), buy('2026-10-01', 10_000)], '2026-10-05')
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ executions: 3, amountCents: 10_000 })
    expect(detectSavingsPlans([buy('2026-08-01', 10_000), buy('2026-09-01', 30_000), buy('2026-10-01', 10_000)], '2026-10-05')).toEqual([])
  })

  it('zu wenige, unregelmäßige oder alte Käufe → kein Plan', () => {
    expect(detectSavingsPlans([buy('2026-09-01', 10_000), buy('2026-10-01', 10_000)], '2026-10-05')).toEqual([])
    expect(detectSavingsPlans([buy('2026-06-01', 10_000), buy('2026-08-01', 10_000), buy('2026-10-01', 10_000)], '2026-10-05')).toEqual([])
    expect(detectSavingsPlans([buy('2026-03-01', 10_000), buy('2026-04-01', 10_000), buy('2026-05-01', 10_000)], '2026-10-05')).toEqual([])
  })

  it('überfällig erst nach Karenz; je Depot und Wert getrennt', () => {
    const bookings = [buy('2026-07-02', 5_000), buy('2026-08-02', 5_000), buy('2026-09-02', 5_000)]
    expect(detectSavingsPlans(bookings, '2026-10-07')[0]?.overdue).toBe(false)
    expect(detectSavingsPlans(bookings, '2026-10-08')[0]?.overdue).toBe(true)
    const split = detectSavingsPlans([buy('2026-08-02', 5_000, 'etf', 'a'), buy('2026-09-02', 5_000, 'etf', 'b'), buy('2026-10-02', 5_000, 'etf', 'a')], '2026-10-05')
    expect(split).toEqual([])
  })

  it('Monatsende', () => {
    expect(nextMonthSameDay('2026-01-31')).toBe('2026-02-28')
    expect(nextMonthSameDay('2026-12-15')).toBe('2027-01-15')
  })
})

import { describe, expect, it } from 'vitest'
import { planGoal, requiredMonthly } from './goals'

describe('requiredMonthly', () => {
  it('ohne Rendite: Lücke durch Monate', () => {
    expect(requiredMonthly(1_000, 7_000, 12, 0)).toBeCloseTo(500, 6)
  })

  it('mit Rendite: weniger als ohne, und genau passend', () => {
    const p = requiredMonthly(0, 10_000, 120, 0.06)
    expect(p).toBeLessThan(10_000 / 120)
    // Gegenprobe: 120 Monate mit dieser Rate ergeben das Ziel
    const r = 1.06 ** (1 / 12) - 1
    let v = 0
    for (let m = 0; m < 120; m++) v = v * (1 + r) + p
    expect(v).toBeCloseTo(10_000, 6)
  })

  it('reicht die Rendite schon, ist nichts mehr nötig', () => {
    expect(requiredMonthly(9_000, 10_000, 60, 0.05)).toBe(0)
  })
})

describe('planGoal', () => {
  const base = { nowMonth: '2026-10', annualReturn: 0 }

  it('Fortschritt und fehlender Betrag', () => {
    const plan = planGoal({ ...base, current: 2_500, target: 10_000, targetMonth: null, monthly: null })
    expect(plan).toMatchObject({ progress: 0.25, reached: false, missing: 7_500, monthsLeft: null, requiredMonthly: null, etaMonth: null, onTrack: null })
  })

  it('mit Datum: nötige Sparrate; mit Sparrate: Ankunft und ob es reicht', () => {
    const plan = planGoal({ ...base, current: 1_000, target: 7_000, targetMonth: '2027-10', monthly: 400 })
    expect(plan.monthsLeft).toBe(12)
    expect(plan.requiredMonthly).toBeCloseTo(500, 6)
    expect(plan.etaMonth).toBe('2028-01') // 1.000 + 15 × 400 = 7.000
    expect(plan.onTrack).toBe(false)
    expect(planGoal({ ...base, current: 1_000, target: 7_000, targetMonth: '2027-10', monthly: 500 }).onTrack).toBe(true)
  })

  it('erreicht: 100 %, nichts mehr nötig', () => {
    const plan = planGoal({ ...base, current: 12_000, target: 10_000, targetMonth: '2030-01', monthly: 0 })
    expect(plan).toMatchObject({ reached: true, missing: 0, requiredMonthly: null, etaMonth: '2026-10', onTrack: true })
    expect(plan.progress).toBeCloseTo(1.2, 6)
  })

  it('abgelaufenes Datum: keine Rate, Ziel nicht geschafft', () => {
    const plan = planGoal({ ...base, current: 1_000, target: 2_000, targetMonth: '2026-01', monthly: 100 })
    expect(plan).toMatchObject({ monthsLeft: 0, requiredMonthly: null, onTrack: false })
  })

  it('ohne Sparrate und Rendite nie erreichbar', () => {
    expect(planGoal({ ...base, current: 100, target: 1_000, targetMonth: null, monthly: 0 }).etaMonth).toBeNull()
  })
})

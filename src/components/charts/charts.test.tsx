import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BarList } from './BarList'
import { bucketMonths } from './columns'
import { DeltaBars } from './DeltaBars'
import { LineChart } from './LineChart'
import { Sparkline } from './Sparkline'

describe('LineChart auf dem Server', () => {
  it('zeichnet ohne gemessene Breite nur einen Platzhalter fester Höhe – keine geratene Geometrie', () => {
    const html = renderToStaticMarkup(
      <LineChart title="Test" labels={['Jän 2026', 'Feb 2026', 'Mär 2026']} series={[{ id: 'a', label: 'A', values: [1, 2, 3], tone: 'accent' }]} height={240} />,
    )
    expect(html).toContain('height="240"')
    expect(html).toContain('width="100%"')
    expect(html).not.toContain('<path')
    // Tabellenansicht ist schon im Server-HTML (zugängliche Alternative)
    expect(html).toContain('<table')
    expect(html).not.toContain('style=')
  })
})

describe('bucketMonths', () => {
  const months = Array.from({ length: 36 }, (_, i) => {
    const index = 2024 * 12 + 10 + i
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })
  const values = months.map(() => 10)

  it('fasst über 24 Säulen zu Quartalen zusammen, ohne erhalten und erwartet zu mischen', () => {
    const { buckets, unit } = bucketMonths(months, values, { forecastFrom: 24, maxBars: 24 })
    expect(unit).toBe(3)
    expect(buckets.length).toBeLessThanOrEqual(24)
    expect(buckets.reduce((s, b) => s + b.value, 0)).toBe(360)
    for (const b of buckets) for (let i = b.from; i <= b.to; i++) expect(i >= 24).toBe(b.forecast)
    expect(buckets[0]?.label).toBe('Nov–Dez 2024')
    expect(buckets[1]?.label).toBe('Jän–Mär 2025')
  })

  it('bleibt bei wenigen Monaten monatlich', () => {
    const { buckets, unit } = bucketMonths(months.slice(0, 12), values.slice(0, 12), { maxBars: 24 })
    expect(unit).toBe(1)
    expect(buckets).toHaveLength(12)
    expect(buckets[0]?.label).toBe('Nov 2024')
  })
})

describe('BarList', () => {
  it('Balkenlänge als Anteil, Rest grau am Ende, Werte als Text', () => {
    const html = renderToStaticMarkup(
      <BarList
        title="Nach Währung"
        items={[
          { key: 'eur', label: 'EUR', value: 800, share: 0.8 },
          { key: 'usd', label: 'USD', value: 150, share: 0.15 },
          { key: 'chf', label: 'CHF', value: 50, share: 0.05 },
        ]}
        limit={2}
      />,
    )
    expect(html).toContain('aria-label="Nach Währung"')
    expect(html).toContain('width="80.00%"')
    expect(html.indexOf('EUR')).toBeLessThan(html.indexOf('Übrige'))
    expect(html).toMatch(/80,0[\s\u00a0]%/)
    expect(html).not.toContain('style=')
  })
})

describe('Sparkline', () => {
  it('zeichnet flache Reihen flach (Mindestspanne) und setzt einen Endpunkt', () => {
    const html = renderToStaticMarkup(<Sparkline values={[100, 100.1, 100.05, 100.1]} label="Verlauf" />)
    const ys = [...html.matchAll(/[ML ,](\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]))
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(4)
    expect(html).toContain('<circle')
  })

  it('braucht mindestens zwei Werte', () => {
    expect(renderToStaticMarkup(<Sparkline values={[1]} label="x" />)).toBe('')
  })
})

describe('DeltaBars', () => {
  it('legt Balken um eine gemeinsame Nulllinie, Beträge mit Vorzeichen', () => {
    const html = renderToStaticMarkup(
      <DeltaBars
        title="Veränderung im September"
        items={[
          { key: 'kurse', label: 'Kurse', value: -100, kind: 'market' },
          { key: 'fluss', label: 'Zu- und Abflüsse', value: 300, kind: 'flow' },
          { key: 'summe', label: 'Veränderung', value: 200, kind: 'total' },
        ]}
      />,
    )
    // Null bei 25 % (−100 … +300): Verlust links davon, Zufluss rechts
    expect(html).toContain('x1="25.00%"')
    expect(html).toContain('x="0.00%" width="25.00%"')
    expect(html).toContain('x="25.00%" width="75.00%"')
    expect(html).toMatch(/\+300,00/)
    expect(html).toMatch(/-100,00|−100,00/)
    expect(html).not.toContain('style=')
  })
})

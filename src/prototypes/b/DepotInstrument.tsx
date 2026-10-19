'use client'

import { useState } from 'react'
import { Sparkline } from '../shared/charts'
import { share } from '../shared/format'
import { Amount } from '../shared/privacy'
import styles from './b.module.css'
import { PositionsTable, type PositionItem } from './PositionsTable'
import { Trend } from './Trend'

/** Positionen links, Detail des gewählten Instruments rechts. */
export function DepotInstrument({ items }: { items: readonly PositionItem[] }) {
  const [selected, setSelected] = useState(items.reduce((a, b) => (b.value > a.value ? b : a)).id)
  const item = items.find((i) => i.id === selected) ?? items[0]
  if (!item) return null
  return (
    <div className={styles.panelGrid}>
      <section className={`${styles.panel} ${styles.s9}`} aria-labelledby="pos-depot">
        <h2 id="pos-depot" className={styles.label}>
          Positionen <span>Zeile wählen für Details</span>
        </h2>
        <PositionsTable items={items} showDepot={false} selectedId={selected} onSelect={setSelected} />
      </section>
      <section className={`${styles.panel} ${styles.s3}`} aria-live="polite" aria-labelledby="instrument">
        <h2 className={styles.label}>Instrument</h2>
        <div className={styles.instrument}>
          <h3 id="instrument" className={styles.instrumentName}>
            {item.name}
            <small>
              {item.symbol}
              {item.isin ? ` · ${item.isin}` : ''} · {item.currency}
            </small>
          </h3>
          <Sparkline values={item.sparkline} width={260} height={56} className={styles.instrumentSpark} label={`30-Tage-Verlauf ${item.name}`} />
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt>Kurs</dt>
              <dd>
                <Amount value={item.price} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Heute</dt>
              <dd>
                <Trend value={item.changeToday} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Ø Einstandskurs</dt>
              <dd>
                <Amount value={item.price > 0 && item.value > 0 ? item.cost / (item.value / item.price) : 0} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Kursgewinn</dt>
              <dd>
                <Trend value={item.gainPct} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Gewicht im Depot</dt>
              <dd>{share(item.weight)}</dd>
            </div>
            <div className={styles.readout}>
              <dt>Erträge 12 M</dt>
              <dd>
                <Amount value={item.incomeTtm} />
              </dd>
            </div>
            {item.ter !== undefined ? (
              <div className={styles.readout}>
                <dt>TER p. a.</dt>
                <dd>{share(item.ter, 2)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>
    </div>
  )
}

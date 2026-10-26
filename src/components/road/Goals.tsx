'use client'

import { useActionState, useCallback, useEffect, useId, useState, useTransition } from 'react'
import { monthLabel, share } from '@/lib/display'
import { centsToInput } from '@/lib/money'
import { haptic } from '../hooks/haptics'
import { Amount } from '../privacy/privacy'
import { Icon } from '../shell/icons'
import { Actions, Button, Checkbox, describedBy, Field, Form, FormRow, Input, Message } from '../ui/forms'
import { Note } from '../ui/layout'
import styles from './goals.module.css'

export interface GoalResult {
  ok: boolean
  error: string | null
  field: string | null
}

/** Server Action: Ziel anlegen (`id` null) oder ändern */
export type SaveGoal = (id: string | null, prev: GoalResult, formData: FormData) => Promise<GoalResult>

/** Ziel mit heutigem Stand – auf dem Server berechnet (src/server/goals.ts). */
export interface GoalItem {
  id: string
  name: string
  targetCents: number
  targetDate: string | null
  monthlyCents: number | null
  /** eigene Rendite als Eingabetext („6,5“) oder leer */
  returnInput: string
  /** „6,5 % p. a. (Road)“ */
  returnLabel: string
  scope: 'all' | 'selected'
  portfolioIds: string[]
  portfolioNames: string[]
  currentCents: number
  progress: number
  reached: boolean
  missingCents: number
  requiredMonthlyCents: number | null
  etaMonth: string | null
  onTrack: boolean | null
}

export interface GoalPortfolio {
  id: string
  name: string
}

const initial: GoalResult = { ok: false, error: null, field: null }

/** Fortschrittsbalken über die volle Breite (SVG: keine Inline-Styles nötig); Prozent steht daneben als Text. */
function GoalBar({ progress }: { progress: number }) {
  const width = Math.max(0, Math.min(100, progress * 100))
  return (
    <svg className={styles.bar} viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className={styles.track} width="100" height="8" />
      {width > 0 ? <rect className={styles.fill} width={width} height="8" /> : null}
    </svg>
  )
}

function Status({ goal }: { goal: GoalItem }) {
  if (goal.reached)
    return (
      <p className={styles.statusDone}>
        <Icon name="check" size={16} /> Erreicht
        {goal.currentCents > goal.targetCents ? (
          <>
            {' '}
            · <Amount value={(goal.currentCents - goal.targetCents) / 100} whole /> darüber
          </>
        ) : null}
      </p>
    )
  const monthly = goal.monthlyCents !== null ? <Amount value={goal.monthlyCents / 100} whole /> : null
  return (
    <div className={styles.status}>
      {goal.targetDate ? (
        <p>
          Bis {monthLabel(goal.targetDate.slice(0, 7), 'long')}:{' '}
          {goal.requiredMonthlyCents !== null ? (
            <>
              nötig <Amount value={goal.requiredMonthlyCents / 100} whole /> im Monat
            </>
          ) : (
            'Zieldatum erreicht'
          )}
        </p>
      ) : null}
      {monthly ? (
        goal.etaMonth ? (
          <p className={goal.onTrack === false ? styles.behind : undefined}>
            {goal.onTrack === false ? <Icon name="alert" size={14} /> : null}
            {goal.onTrack === false ? 'Erst ' : ''}≈ {monthLabel(goal.etaMonth, 'long')} mit {monthly} im Monat
          </p>
        ) : (
          <p className={styles.behind}>
            <Icon name="alert" size={14} />
            Mit {monthly} im Monat nicht in 50 Jahren
          </p>
        )
      ) : goal.targetDate ? null : (
        <p className={styles.muted}>Sparrate eintragen, dann zeigt rt100k das voraussichtliche Datum.</p>
      )}
    </div>
  )
}

/** Liste der Ziele mit Bearbeiten und Löschen (zweistufig). */
export function GoalList({ goals, portfolios, save, remove }: { goals: readonly GoalItem[]; portfolios: readonly GoalPortfolio[]; save: SaveGoal; remove: (id: string) => Promise<GoalResult> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (goals.length === 0) return <Note>Noch keine eigenen Ziele. Zum Beispiel ein Notgroschen von drei Monatsausgaben oder das Kinderdepot zum 18. Geburtstag.</Note>
  return (
    <ul className={styles.list}>
      {goals.map((g) => (
        <li key={g.id} className={styles.goal}>
          <div className={styles.head}>
            <h3 className={styles.name}>
              <Icon name="target" size={18} />
              {g.name}
            </h3>
            <span className={styles.pct}>{share(Math.min(g.progress, 9.99), 0)}</span>
          </div>
          <GoalBar progress={g.progress} />
          <p className={styles.figures}>
            <Amount value={g.currentCents / 100} whole /> von <Amount value={g.targetCents / 100} whole />
            {g.reached ? null : (
              <>
                {' '}
                · noch <Amount value={g.missingCents / 100} whole />
              </>
            )}
          </p>
          <Status goal={g} />
          <p className={styles.meta}>
            {g.scope === 'all' ? 'Alle Depots und Konten' : g.portfolioNames.length > 0 ? g.portfolioNames.join(', ') : 'Keine Depots mehr ausgewählt'} · {g.returnLabel}
          </p>

          {editing === g.id ? (
            <div className={styles.edit}>
              <GoalForm save={save} portfolios={portfolios} goal={g} submitLabel="Ziel speichern" onDone={() => setEditing(null)} />
            </div>
          ) : confirming === g.id ? (
            <div className={styles.confirm} role="group" aria-label="Löschen bestätigen" onKeyDown={(e) => e.key === 'Escape' && setConfirming(null)}>
              <span>Ziel „{g.name}“ löschen? Buchungen und Depots bleiben.</span>
              <Actions>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const result = await remove(g.id)
                      if (!result.ok) setError(result.error)
                      else haptic('success')
                      setConfirming(null)
                    })
                  }
                >
                  Ja, löschen
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(null)} autoFocus>
                  Abbrechen
                </Button>
              </Actions>
            </div>
          ) : (
            <Actions>
              <Button variant="quiet" onClick={() => setEditing(g.id)}>
                Bearbeiten
              </Button>
              <Button variant="quiet" onClick={() => setConfirming(g.id)}>
                Löschen
              </Button>
            </Actions>
          )}
          {error && confirming === null && editing === null ? <Message tone="error">{error}</Message> : null}
        </li>
      ))}
    </ul>
  )
}

/** Ziel anlegen oder ändern. Depots: alle oder Auswahl (Kästchen). */
export function GoalForm({ save, portfolios, goal, submitLabel, onDone }: { save: SaveGoal; portfolios: readonly GoalPortfolio[]; goal?: GoalItem; submitLabel: string; onDone?: () => void }) {
  const id = useId()
  const goalId = goal?.id ?? null
  const [scope, setScope] = useState<'all' | 'selected'>(goal?.scope ?? 'all')
  const action = useCallback((prev: GoalResult, formData: FormData) => save(goalId, prev, formData), [save, goalId])
  const [state, dispatch, pending] = useActionState(action, initial)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (!state.ok) return
    haptic('success')
    if (onDone) onDone()
    // Neues Ziel: Formular leeren
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setFormKey((k) => k + 1)
  }, [state, onDone])

  const err = (field: string) => (state.field === field ? state.error : null)
  const f = (name: string) => `${id}-${name}`
  return (
    <Form key={formKey} action={dispatch}>
      <Field id={f('name')} label="Name" error={err('name')}>
        <Input id={f('name')} name="name" required maxLength={60} defaultValue={goal?.name ?? ''} placeholder="z. B. Notgroschen" autoComplete="off" {...describedBy(f('name'), null, err('name'))} />
      </Field>
      <FormRow>
        <Field id={f('target')} label="Zielbetrag in €" error={err('target')}>
          <Input id={f('target')} name="target" required inputMode="decimal" defaultValue={goal ? centsToInput(goal.targetCents, { grouped: true }) : ''} placeholder="10.000" autoComplete="off" {...describedBy(f('target'), null, err('target'))} />
        </Field>
        <Field id={f('targetDate')} label="Bis wann" hint="optional" error={err('targetDate')}>
          <Input id={f('targetDate')} name="targetDate" type="date" defaultValue={goal?.targetDate ?? ''} {...describedBy(f('targetDate'), true, err('targetDate'))} />
        </Field>
      </FormRow>
      <FormRow>
        <Field id={f('monthly')} label="Sparrate je Monat in €" hint="optional – für das voraussichtliche Datum" error={err('monthly')}>
          <Input id={f('monthly')} name="monthly" inputMode="decimal" defaultValue={goal?.monthlyCents != null ? centsToInput(goal.monthlyCents, { grouped: true }) : ''} autoComplete="off" {...describedBy(f('monthly'), true, err('monthly'))} />
        </Field>
        <Field id={f('returnPct')} label="Rendite p. a. in %" hint="leer = Annahme der Road (Konten 0 %)" error={err('returnPct')}>
          <Input id={f('returnPct')} name="returnPct" inputMode="decimal" defaultValue={goal?.returnInput ?? ''} autoComplete="off" {...describedBy(f('returnPct'), true, err('returnPct'))} />
        </Field>
      </FormRow>
      <fieldset className={styles.scope}>
        <legend className={styles.legend}>Was zählt</legend>
        <label className={styles.radio}>
          <input type="radio" name="scope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} />
          Alle Depots und Konten
        </label>
        <label className={styles.radio}>
          <input type="radio" name="scope" value="selected" checked={scope === 'selected'} onChange={() => setScope('selected')} />
          Nur ausgewählte
        </label>
        {scope === 'selected' ? (
          <div className={styles.picks}>
            {portfolios.map((p) => (
              <Checkbox key={p.id} name="portfolioIds" value={p.id} label={p.name} defaultChecked={goal?.portfolioIds.includes(p.id) ?? false} />
            ))}
            {err('portfolioIds') ? <span className={styles.error}>{err('portfolioIds')}</span> : null}
          </div>
        ) : null}
      </fieldset>
      {state.error && !['name', 'target', 'targetDate', 'monthly', 'returnPct', 'portfolioIds'].includes(state.field ?? '') ? <Message tone="error">{state.error}</Message> : null}
      <Actions>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? 'Speichern …' : submitLabel}
        </Button>
        {onDone ? (
          <Button variant="quiet" onClick={onDone}>
            Abbrechen
          </Button>
        ) : null}
      </Actions>
    </Form>
  )
}

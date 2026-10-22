'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { isTypingTarget, usePrivacy } from '../privacy/privacy'
import { Icon } from '../shell/icons'
import { useIsApple } from '../shell/useMedia'
import styles from './command.module.css'

export interface Command {
  id: string
  label: string
  group: string
  hint?: string
  href?: string
  action?: 'toggle-privacy'
}

/** Treffer nach Gruppen in der Reihenfolge ihres ersten Auftretens. */
function groupResults(results: readonly Command[]): { group: string; items: Command[] }[] {
  const groups = new Map<string, Command[]>()
  for (const command of results) {
    const list = groups.get(command.group)
    if (list) list.push(command)
    else groups.set(command.group, [command])
  }
  return Array.from(groups, ([group, items]) => ({ group, items }))
}

/**
 * Command Palette (⌘K / Strg+K). Tastatur-first: Pfeile, Enter, Esc. Als
 * natives `<dialog>` in der obersten Ebene (nie unter der Kopfzeile).
 * Auslöser ab 1280 px als Suchfeld mit Tastenhilfe, darunter als Symbol.
 */
export function CommandPalette({
  commands,
  triggerLabel = 'Suchen',
  placeholder = 'Wohin? Depot, Ansicht, Aktion …',
}: {
  commands: readonly Command[]
  triggerLabel?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const router = useRouter()
  const { toggle } = usePrivacy()
  const apple = useIsApple()
  const dialog = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groupResults(q ? commands.filter((c) => `${c.label} ${c.group} ${c.hint ?? ''}`.toLowerCase().includes(q)) : commands)
  }, [commands, query])
  const results = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const optionId = (command: Command) => `${listId}-${command.id}`

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Öffnen/Schließen am Dialog-Element; es gibt den Fokus beim Schließen selbst zurück
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      inputRef.current?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  // aktiven Treffer bei Pfeiltasten sichtbar halten
  useEffect(() => {
    if (!open) return
    const current = results[active]
    if (current) document.getElementById(`${listId}-${current.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, results, listId])

  const reset = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const run = (command: Command | undefined) => {
    if (!command) return
    reset()
    if (command.action === 'toggle-privacy') toggle()
    else if (command.href) router.push(command.href)
  }

  const onKey = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (event.key === 'Home' && event.ctrlKey) {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End' && event.ctrlKey) {
      event.preventDefault()
      setActive(Math.max(0, results.length - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[active])
    } else if (event.key === 'Tab') {
      // Fokus bleibt im Eingabefeld
      event.preventDefault()
      inputRef.current?.focus()
    }
  }

  const shortcut = apple === null ? null : apple ? '⌘K' : 'Strg K'

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        title={shortcut ? `${triggerLabel} (${shortcut})` : triggerLabel}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Icon name="search" size={18} />
        <span className={styles.triggerText} aria-hidden="true">
          {triggerLabel} …
        </span>
        <kbd className={styles.triggerKbd} aria-hidden="true">
          {shortcut}
        </kbd>
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label="Befehle"
        onKeyDown={onKey}
        onClose={reset}
        onClick={(e) => {
          // Klick auf den dunklen Rand schließt
          if (e.target === e.currentTarget) reset()
        }}
      >
        {open ? (
          <div className={styles.panel}>
            <div className={styles.inputRow}>
              <Icon name="search" size={18} className={styles.inputIcon} />
              <input
                ref={inputRef}
                className={styles.input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder={placeholder}
                aria-label="Ziel oder Aktion suchen"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[active] ? optionId(results[active]) : undefined}
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              <kbd className={styles.esc}>Esc</kbd>
            </div>
            <div id={listId} className={styles.list} role="listbox" aria-label="Ergebnisse">
              {groups.map(({ group, items }, g) => (
                <div key={group} role="group" aria-labelledby={`${listId}-g${g}`} className={styles.group}>
                  <div id={`${listId}-g${g}`} role="presentation" className={styles.groupLabel}>
                    {group}
                  </div>
                  {items.map((c) => {
                    const index = results.indexOf(c)
                    return (
                      <div
                        key={c.id}
                        id={optionId(c)}
                        role="option"
                        aria-selected={index === active}
                        className={styles.item}
                        onPointerMove={() => index !== active && setActive(index)}
                        onClick={() => run(c)}
                      >
                        <span className={styles.label}>{c.label}</span>
                        {c.hint ? (
                          <span className={styles.hint}>
                            {c.hint.split(' ').map((key) => (
                              <kbd key={key}>{key}</kbd>
                            ))}
                          </span>
                        ) : null}
                        <Icon name="arrowRight" size={16} className={styles.go} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            {results.length === 0 ? (
              <p className={styles.empty} role="status">
                Nichts gefunden für „{query.trim()}“.
              </p>
            ) : null}
            <p className={styles.footer} aria-hidden="true">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> auswählen
              </span>
              <span>
                <kbd>↵</kbd> öffnen
              </span>
              <span>
                <kbd>Esc</kbd> schließen
              </span>
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  )
}

/**
 * Tastenfolgen „g + Buchstabe“ für schnelle Navigation, z. B. `{ d: '/', r: '/road' }`.
 * In Eingabefeldern inaktiv.
 */
export function useGoHotkeys(routes: Readonly<Record<string, string>>) {
  const router = useRouter()
  useEffect(() => {
    let armed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (armed) {
        armed = false
        const href = routes[key]
        if (href) router.push(href)
        return
      }
      if (key === 'g') {
        armed = true
        clearTimeout(timer)
        timer = setTimeout(() => (armed = false), 1200)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [routes, router])
}

export function GoHotkeys({ routes }: { routes: Readonly<Record<string, string>> }) {
  useGoHotkeys(routes)
  return null
}

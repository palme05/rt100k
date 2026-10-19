'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { isTypingTarget, usePrivacy } from '../privacy/privacy'
import button from '../ui/button.module.css'
import styles from './command.module.css'

export interface Command {
  id: string
  label: string
  group: string
  hint?: string
  href?: string
  action?: 'toggle-privacy'
}

/**
 * Command Palette (⌘K / Strg+K). Tastatur-first: Pfeile, Enter, Esc.
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
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const listId = useId()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? commands.filter((c) => `${c.label} ${c.group} ${c.hint ?? ''}`.toLowerCase().includes(q)) : [...commands]
  }, [commands, query])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        returnFocus.current = document.activeElement as HTMLElement | null
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      returnFocus.current?.focus?.()
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const run = (command: Command | undefined) => {
    if (!command) return
    close()
    if (command.action === 'toggle-privacy') toggle()
    else if (command.href) router.push(command.href)
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[active])
    } else if (event.key === 'Tab') {
      // Fokus bleibt im Dialog
      event.preventDefault()
      inputRef.current?.focus()
    }
  }

  return (
    <>
      <button
        type="button"
        className={button.button}
        onClick={() => {
          returnFocus.current = document.activeElement as HTMLElement | null
          setOpen(true)
        }}
        aria-haspopup="dialog"
      >
        {triggerLabel} <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Befehle" onKeyDown={onKey}>
            <input
              ref={inputRef}
              className={styles.input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              placeholder={placeholder}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
              aria-autocomplete="list"
            />
            <ul id={listId} className={styles.list} role="listbox" aria-label="Ergebnisse">
              {results.length === 0 ? <li className={styles.empty}>Nichts gefunden.</li> : null}
              {results.map((c, i) => (
                <li
                  key={c.id}
                  id={`${listId}-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={styles.item}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => run(c)}
                >
                  <span className={styles.group}>{c.group}</span>
                  <span>{c.label}</span>
                  {c.hint ? <span className={styles.hint}>{c.hint}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
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

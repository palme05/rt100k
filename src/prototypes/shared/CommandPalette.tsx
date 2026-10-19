'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { usePrivacy } from './privacy'

export interface Command {
  id: string
  label: string
  group: string
  hint?: string
  href?: string
  action?: 'toggle-privacy'
}

export interface CommandPaletteClassNames {
  backdrop?: string | undefined
  dialog?: string | undefined
  input?: string | undefined
  list?: string | undefined
  group?: string | undefined
  item?: string | undefined
  itemActive?: string | undefined
  hint?: string | undefined
  empty?: string | undefined
  trigger?: string | undefined
}

/**
 * Command Palette (⌘K / Strg+K). Tastatur-first: Pfeile, Enter, Esc.
 * Headless – Optik kommt über classNames.
 */
export function CommandPalette({
  commands,
  classNames,
  triggerLabel = 'Befehle',
  placeholder = 'Wohin? Depot, Ansicht, Aktion …',
}: {
  commands: readonly Command[]
  classNames: CommandPaletteClassNames
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
        className={classNames.trigger}
        onClick={() => {
          returnFocus.current = document.activeElement as HTMLElement | null
          setOpen(true)
        }}
        aria-haspopup="dialog"
      >
        {triggerLabel} <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className={classNames.backdrop} onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div className={classNames.dialog} role="dialog" aria-modal="true" aria-label="Befehle" onKeyDown={onKey}>
            <input
              ref={inputRef}
              className={classNames.input}
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
            <ul id={listId} className={classNames.list} role="listbox" aria-label="Ergebnisse">
              {results.length === 0 ? <li className={classNames.empty}>Nichts gefunden.</li> : null}
              {results.map((c, i) => (
                <li
                  key={c.id}
                  id={`${listId}-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={[classNames.item, i === active ? classNames.itemActive : ''].filter(Boolean).join(' ')}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => run(c)}
                >
                  <span className={classNames.group}>{c.group}</span>
                  <span>{c.label}</span>
                  {c.hint ? <span className={classNames.hint}>{c.hint}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function prototypeCommands(base: string): Command[] {
  return [
    { id: 'dash', group: 'Ansicht', label: 'Übersicht', href: base, hint: 'G D' },
    { id: 'road', group: 'Ansicht', label: 'Road to 100k', href: `${base}/road`, hint: 'G R' },
    { id: 'tr', group: 'Depot', label: 'Trade Republic · Hauptdepot', href: `${base}/depot/trade-republic` },
    { id: 'flatex', group: 'Depot', label: 'Flatex · Österreich-Depot', href: `${base}/depot/flatex` },
    { id: 'bitpanda', group: 'Depot', label: 'Bitpanda · Krypto', href: `${base}/depot/bitpanda` },
    { id: 'tg', group: 'Depot', label: 'Tagesgeld · Notgroschen', href: `${base}/depot/tagesgeld` },
    { id: 'tresor', group: 'Depot', label: 'Tresor · Edelmetalle', href: `${base}/depot/tresor` },
    { id: 'privacy', group: 'Aktion', label: 'Beträge ein-/ausblenden', action: 'toggle-privacy', hint: 'P' },
    { id: 'pa', group: 'Prototyp', label: 'A · Road Trip', href: '/prototypes/a' },
    { id: 'pb', group: 'Prototyp', label: 'B · Mission Control', href: '/prototypes/b' },
    { id: 'pc', group: 'Prototyp', label: 'C · Editorial', href: '/prototypes/c' },
  ]
}

/** Tastenfolgen „g d“ / „g r“ für schnelle Navigation. */
export function useGoHotkeys(base: string) {
  const router = useRouter()
  useEffect(() => {
    let armed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (armed) {
        armed = false
        if (key === 'd') router.push(base)
        if (key === 'r') router.push(`${base}/road`)
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
  }, [base, router])
}

export function GoHotkeys({ base }: { base: string }) {
  useGoHotkeys(base)
  return null
}

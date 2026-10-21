import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import styles from './forms.module.css'

/**
 * Formular-Bausteine. Labels sind immer sichtbar, Fehler stehen als Text am
 * Feld (aria-describedby) und nie nur als rote Umrandung.
 */

/** Formular, höchstens `--measure-form` breit; `wide` füllt die Spalte. */
export function Form({ wide = false, ...props }: React.FormHTMLAttributes<HTMLFormElement> & { wide?: boolean }) {
  return <form {...props} className={wide ? `${styles.form} ${styles.wide}` : styles.form} />
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className={styles.row}>{children}</div>
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  error?: string | null | undefined
  children: React.ReactNode
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className={styles.error}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

/** aria-Verknüpfung zu Hinweis und Fehler eines Feldes. */
export function describedBy(id: string, hint?: unknown, error?: unknown): { 'aria-describedby'?: string; 'aria-invalid'?: true } {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ')
  return { ...(ids ? { 'aria-describedby': ids } : {}), ...(error ? { 'aria-invalid': true as const } : {}) }
}

export function Input({ code = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { code?: boolean }) {
  return <input {...props} className={code ? `${styles.control} ${styles.code}` : styles.control} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={styles.control} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={styles.control} />
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}

export function Button({
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'quiet' }) {
  return <button type={type} {...props} className={styles[variant]} />
}

export function Actions({ children }: { children: React.ReactNode }) {
  return <div className={styles.actions}>{children}</div>
}

/** Meldung mit Titelwort, damit der Ton nicht nur über Farbe erkennbar ist. */
export function Message({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'error' ? styles.messageError : tone === 'success' ? styles.messageSuccess : styles.messageInfo
  const title = tone === 'error' ? 'Fehler:' : tone === 'success' ? 'Erledigt:' : 'Hinweis:'
  return (
    <p className={cls} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={styles.messageTitle}>{title}</span>
      {children}
    </p>
  )
}

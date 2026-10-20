import Link from 'next/link'
import styles from './data.module.css'

/** Auswahl als Links (z. B. Depot): funktioniert ohne JavaScript, Zurück-Taste inklusive. */
export function LinkChips({ label, options, value }: { label: string; options: readonly { id: string; label: string; href: string }[]; value: string | null }) {
  return (
    <nav aria-label={label} className={styles.chipNav}>
      <ul className={styles.chips}>
        {options.map((o) => (
          <li key={o.id}>
            <Link className={styles.chip} href={o.href} aria-current={value === o.id ? 'true' : undefined} replace scroll={false}>
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

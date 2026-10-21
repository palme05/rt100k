import Link from 'next/link'
import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from '../shell/icons'
import styles from './iconbutton.module.css'

/**
 * Knopf nur mit Symbol. `label` ist Pflicht (aria-label und Tooltip), eine
 * Zahl (`badge`) liegt über dem Symbol und ändert die Breite nicht.
 */
export function IconButton({
  icon,
  label,
  badge,
  size = 20,
  type = 'button',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & { icon: IconName; label: string; badge?: string | number | null; size?: number }) {
  return (
    <button type={type} aria-label={label} title={label} {...props} className={props.className ? `${styles.button} ${props.className}` : styles.button}>
      <Icon name={icon} size={size} />
      {badge ? (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

/** Wie IconButton, aber als Link (z. B. Glocke → Hinweise). */
export function IconLink({ href, icon, label, badge, current = false, size = 20 }: { href: string; icon: IconName; label: string; badge?: string | number | null; current?: boolean; size?: number }) {
  return (
    <Link href={href} aria-label={label} title={label} aria-current={current ? 'page' : undefined} className={styles.button}>
      <Icon name={icon} size={size} />
      {badge ? (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}

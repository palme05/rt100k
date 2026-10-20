import Link from 'next/link'
import { LinkPending } from '../shell/LinkPending'
import styles from './table.module.css'

/** Tabelle mit horizontalem Scrollen auf schmalen Bildschirmen. */
export function DataTable({
  caption,
  head,
  children,
  align = 'top',
}: {
  caption: string
  head: React.ReactNode
  children: React.ReactNode
  /** `middle` für Zeilen mit Sparklines */
  align?: 'top' | 'middle'
}) {
  return (
    <div className={styles.scroll}>
      <table className={align === 'middle' ? `${styles.table} ${styles.middle}` : styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Spaltenkopf; `hideSm` blendet die Spalte am Handy aus, `left` für Textspalten (wie `NameCell`). */
export function Th({ children, hideSm = false, left = false }: { children: React.ReactNode; hideSm?: boolean; left?: boolean }) {
  const cls = [hideSm ? styles.hideSm : '', left ? styles.left : ''].filter(Boolean).join(' ')
  return (
    <th scope="col" className={cls || undefined}>
      {children}
    </th>
  )
}

export function Td({ children, hideSm = false, colSpan }: { children: React.ReactNode; hideSm?: boolean; colSpan?: number }) {
  return (
    <td className={hideSm ? styles.hideSm : undefined} colSpan={colSpan}>
      {children}
    </td>
  )
}

/** Namenszelle (linksbündig): Name, darunter Zusatz und optional weiterer Inhalt; optional als Link über die ganze Zelle. */
export function NameCell({ name, sub, href, children }: { name: string; sub?: React.ReactNode; href?: string; children?: React.ReactNode }) {
  const content = (
    <>
      <span className={styles.name}>{name}</span>
      {sub ? <small>{sub}</small> : null}
      {children}
    </>
  )
  return (
    <td className={styles.left}>
      {href ? (
        <Link className={styles.link} href={href}>
          {content}
          <LinkPending />
        </Link>
      ) : (
        content
      )}
    </td>
  )
}

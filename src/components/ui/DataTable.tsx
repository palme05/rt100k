import Link from 'next/link'
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

/** Spaltenkopf; `hideSm` blendet die Spalte am Handy aus. */
export function Th({ children, hideSm = false }: { children: React.ReactNode; hideSm?: boolean }) {
  return (
    <th scope="col" className={hideSm ? styles.hideSm : undefined}>
      {children}
    </th>
  )
}

export function Td({ children, hideSm = false }: { children: React.ReactNode; hideSm?: boolean }) {
  return <td className={hideSm ? styles.hideSm : undefined}>{children}</td>
}

/** Erste Zelle: Name, darunter Zusatz; optional als Link über die ganze Zelle. */
export function NameCell({ name, sub, href }: { name: string; sub?: React.ReactNode; href?: string }) {
  const content = (
    <>
      <span className={styles.name}>{name}</span>
      {sub ? <small>{sub}</small> : null}
    </>
  )
  return (
    <td>
      {href ? (
        <Link className={styles.link} href={href}>
          {content}
        </Link>
      ) : (
        content
      )}
    </td>
  )
}

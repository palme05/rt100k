import { PageHead, TextLink } from '../ui/layout'
import styles from './shell.module.css'

/** 404 innerhalb der App: gleicher Text wie die eigene 404-Seite, Weg zurück zur Übersicht. */
export function NotFoundState({ homeHref }: { homeHref: string }) {
  return (
    <div className={styles.errorState}>
      <PageHead id="nicht-gefunden" eyebrow="404" title="Diese Seite gibt es nicht." sub="Vielleicht ein alter Link, ein Tippfehler in der Adresse – oder der Eintrag gehört zu einem anderen Konto." />
      <div className={styles.errorActions}>
        <TextLink href={homeHref}>Zur Übersicht</TextLink>
      </div>
    </div>
  )
}

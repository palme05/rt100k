'use client'

import { useTransition } from 'react'
import { Button } from '../ui/forms'
import { PageHead, TextLink } from '../ui/layout'
import { AuthLink, StatusFrame } from './AuthFrame'
import auth from './auth.module.css'
import styles from './shell.module.css'

const TITLE = 'Das hat gerade nicht geklappt.'
const TEXT = 'Meist wacht nur die Datenbank nach einer Pause auf oder eine Kursquelle antwortet langsam. Deine Daten bleiben unverändert – bitte gleich noch einmal versuchen.'

/** „Erneut versuchen“: lädt den Abschnitt neu (Daten vom Server), ohne die ganze Seite. */
function RetryButton({ retry }: { retry: () => void }) {
  const [pending, start] = useTransition()
  return (
    <Button onClick={() => start(retry)} disabled={pending} aria-busy={pending || undefined}>
      {pending ? 'Wird neu geladen …' : 'Erneut versuchen'}
    </Button>
  )
}

/** Kennung für die Server-Protokolle – ohne Details zum Fehler selbst. */
function ErrorCode({ digest, className }: { digest: string | undefined; className: string | undefined }) {
  if (!digest) return null
  return (
    <p className={className}>
      Fehlercode <code>{digest}</code>
    </p>
  )
}

/** Fehler in einer App-Seite: Kopfzeile und Navigation bleiben, darunter ruhig erklärt. */
export function AppErrorState({ digest, retry, homeHref }: { digest?: string | undefined; retry: () => void; homeHref: string }) {
  return (
    <div className={styles.errorState}>
      <PageHead id="fehler" eyebrow="Fehler" title={TITLE} sub={TEXT} />
      <div className={styles.errorActions}>
        <RetryButton retry={retry} />
        <TextLink href={homeHref}>Zur Übersicht</TextLink>
        <ErrorCode digest={digest} className={styles.errorCode} />
      </div>
    </div>
  )
}

/** Fehler außerhalb der App oder im Rahmen selbst: eigene ruhige Seite. */
export function StandaloneErrorState({ digest, retry }: { digest?: string | undefined; retry: () => void }) {
  return (
    <StatusFrame eyebrow="Fehler" title={TITLE} lead={TEXT}>
      <RetryButton retry={retry} />
      <AuthLink href="/" variant="secondary">
        Zur Startseite
      </AuthLink>
      <ErrorCode digest={digest} className={auth.code} />
    </StatusFrame>
  )
}

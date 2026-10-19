'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Actions, Button, Field, Form, Input, Message } from '@/components/ui/forms'
import { QrCode } from '@/components/ui/QrCode'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import styles from './security.module.css'

type Step = { kind: 'idle' } | { kind: 'verify'; uri: string; secret: string; codes: string[] } | { kind: 'codes'; codes: string[] }

export function TwoFactorSettings({ enabled, isAdmin }: { enabled: boolean; isAdmin: boolean }) {
  const router = useRouter()
  const id = useId()
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const password = (form: HTMLFormElement) => String(new FormData(form).get('password') ?? '')

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const { data, error: failure } = await authClient.twoFactor.enable({ password: password(event.currentTarget), issuer: 'rt100k' })
    setPending(false)
    if (failure || !data || data.method !== 'totp') return setError(authErrorMessage(failure))
    const secret = new URL(data.totpURI).searchParams.get('secret') ?? ''
    setStep({ kind: 'verify', uri: data.totpURI, secret, codes: data.backupCodes })
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code })
    setPending(false)
    if (failure) return setError(authErrorMessage(failure))
    setStep({ kind: 'idle' })
    setDone('Die Zwei-Faktor-Anmeldung ist aktiv. Bewahre die Backup-Codes sicher auf.')
    router.refresh()
  }

  /** Ein Passwortfeld, zwei Aktionen: neue Backup-Codes oder ausschalten. */
  async function manage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value
    const pw = password(event.currentTarget)
    if (intent === 'disable') {
      const { error: failure } = await authClient.twoFactor.disable({ password: pw })
      setPending(false)
      if (failure) return setError(authErrorMessage(failure))
      setDone('Die Zwei-Faktor-Anmeldung ist ausgeschaltet.')
      router.refresh()
      return
    }
    const { data, error: failure } = await authClient.twoFactor.generateBackupCodes({ password: pw })
    setPending(false)
    if (failure || !data) return setError(authErrorMessage(failure))
    setStep({ kind: 'codes', codes: data.backupCodes })
  }

  const codesList = (codes: string[]) => (
    <ol className={styles.codes} aria-label="Backup-Codes">
      {codes.map((c) => (
        <li key={c}>
          <code>{c}</code>
        </li>
      ))}
    </ol>
  )

  return (
    <div className={styles.stack}>
      {error ? <Message tone="error">{error}</Message> : null}
      {done ? <Message tone="success">{done}</Message> : null}

      {step.kind === 'verify' ? (
        <>
          <p className={styles.text}>
            1. Scanne den QR-Code mit einer Authenticator-App (z. B. Aegis, 2FAS, Google oder Microsoft Authenticator) oder gib den Schlüssel von Hand ein.
          </p>
          <div className={styles.qr}>
            <QrCode value={step.uri} label="QR-Code für die Authenticator-App" />
            <p className={styles.secret}>
              Schlüssel: <code>{step.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            </p>
          </div>
          <p className={styles.text}>2. Notiere die Backup-Codes. Jeder funktioniert einmal, falls das Handy fehlt.</p>
          {codesList(step.codes)}
          <Form onSubmit={verify}>
            <Field id={`${id}-code`} label="3. Code aus der App zur Bestätigung">
              <Input id={`${id}-code`} name="code" required code inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} />
            </Field>
            <Actions>
              <Button type="submit" disabled={pending}>
                Aktivieren
              </Button>
              <Button variant="quiet" onClick={() => setStep({ kind: 'idle' })}>
                Abbrechen
              </Button>
            </Actions>
          </Form>
        </>
      ) : step.kind === 'codes' ? (
        <>
          <Message tone="info">Neue Backup-Codes – die alten gelten nicht mehr.</Message>
          {codesList(step.codes)}
          <Actions>
            <Button variant="secondary" onClick={() => setStep({ kind: 'idle' })}>
              Erledigt
            </Button>
          </Actions>
        </>
      ) : enabled ? (
        <>
          <p className={styles.status}>
            <span className={styles.on} aria-hidden="true" /> Aktiv
          </p>
          <Form onSubmit={manage}>
            <Field id={`${id}-pw-codes`} label="Passwort" hint="Zum Erzeugen neuer Backup-Codes oder zum Ausschalten.">
              <Input id={`${id}-pw-codes`} name="password" type="password" required autoComplete="current-password" />
            </Field>
            <Actions>
              <Button type="submit" name="intent" value="codes" variant="secondary" disabled={pending}>
                Neue Backup-Codes
              </Button>
              {isAdmin ? null : (
                <Button type="submit" name="intent" value="disable" variant="danger" disabled={pending}>
                  Ausschalten
                </Button>
              )}
            </Actions>
          </Form>
          {isAdmin ? <p className={styles.text}>Für Admins ist die Zwei-Faktor-Anmeldung Pflicht und kann nicht ausgeschaltet werden.</p> : null}
        </>
      ) : (
        <>
          <p className={styles.status}>
            <span className={styles.off} aria-hidden="true" /> Nicht eingerichtet
          </p>
          <Form onSubmit={start}>
            <Field id={`${id}-pw`} label="Passwort" hint="Zur Bestätigung, dass du es bist.">
              <Input id={`${id}-pw`} name="password" type="password" required autoComplete="current-password" />
            </Field>
            <Actions>
              <Button type="submit" disabled={pending}>
                Einrichten
              </Button>
            </Actions>
          </Form>
        </>
      )}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import { Divider } from '@/components/shell/AuthFrame'
import { Icon } from '@/components/shell/icons'
import { Button, Field, Form, Input, Message } from '@/components/ui/forms'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'

export function LoginForm() {
  const router = useRouter()
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Passkeys im Autofill des E-Mail-Feldes anbieten (Conditional UI)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential?.isConditionalMediationAvailable) return
    let cancelled = false
    void window.PublicKeyCredential.isConditionalMediationAvailable().then(async (available) => {
      if (!available || cancelled) return
      const result = await authClient.signIn.passkey({ autoFill: true })
      if (!cancelled && result && !result.error) {
        router.push('/app')
        router.refresh()
      }
    })
    return () => {
      cancelled = true
    }
  }, [router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(event.currentTarget)
    const { data, error: failure } = await authClient.signIn.email({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    })
    setPending(false)
    if (failure) {
      setError(authErrorMessage(failure))
      return
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      router.push('/anmelden/2fa')
      return
    }
    router.push('/app')
    router.refresh()
  }

  async function withPasskey() {
    setError(null)
    setPending(true)
    const result = await authClient.signIn.passkey()
    setPending(false)
    if (result?.error) {
      setError(result.error.status === 400 || result.error.status === 401 ? 'Passkey-Anmeldung abgebrochen oder unbekannt.' : authErrorMessage(result.error))
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <>
      {error ? <Message tone="error">{error}</Message> : null}
      <Button variant="secondary" onClick={withPasskey} disabled={pending}>
        <Icon name="key" size={18} />
        Mit Passkey anmelden
      </Button>
      <Divider>oder mit Passwort</Divider>
      <Form onSubmit={onSubmit} noValidate={false}>
        <Field id={`${id}-email`} label="E-Mail">
          <Input id={`${id}-email`} name="email" type="email" required autoComplete="username webauthn" inputMode="email" />
        </Field>
        <Field id={`${id}-password`} label="Passwort">
          <Input id={`${id}-password`} name="password" type="password" required autoComplete="current-password" minLength={12} />
        </Field>
        {/* direkt im Formular-Raster: volle Breite wie „Mit Passkey anmelden“ */}
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? 'Anmelden …' : 'Anmelden'}
        </Button>
      </Form>
    </>
  )
}

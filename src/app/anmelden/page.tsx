import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/shell/AuthFrame'
import { ClearOfflineSnapshot } from '@/components/shell/pwa'
import { Message } from '@/components/ui/forms'
import { getCurrentUser } from '@/server/auth/session'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Anmelden' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getCurrentUser()) redirect('/app')
  const { geloescht } = await searchParams
  return (
    <AuthFrame title="Anmelden" footnote="Neu hier? Konten gibt es nur per Einladungslink. Passwort vergessen? Bitte den Admin um einen neuen Link.">
      {geloescht ? <Message tone="success">Dein Konto und alle Daten sind gelöscht.</Message> : null}
      <LoginForm />
      {/* Abgemeldet → gespeicherten Offline-Stand vom Gerät entfernen */}
      <ClearOfflineSnapshot />
    </AuthFrame>
  )
}

import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/shell/AuthFrame'
import { getCurrentUser } from '@/server/auth/session'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Anmelden' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/app')
  return (
    <AuthFrame title="Anmelden" footnote="Neu hier? Konten gibt es nur per Einladungslink. Passwort vergessen? Bitte den Admin um einen neuen Link.">
      <LoginForm />
    </AuthFrame>
  )
}

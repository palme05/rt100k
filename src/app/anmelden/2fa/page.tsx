import { AuthFrame } from '@/components/shell/AuthFrame'
import { TwoFactorForm } from './TwoFactorForm'

export const metadata = { title: 'Zwei-Faktor-Anmeldung' }

export default function TwoFactorPage() {
  return (
    <AuthFrame title="Zweiter Schritt" lead="Bitte den Code aus deiner Authenticator-App eingeben.">
      <TwoFactorForm />
    </AuthFrame>
  )
}

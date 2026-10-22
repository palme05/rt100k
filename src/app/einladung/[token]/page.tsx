import { AuthFrame, AuthLink } from '@/components/shell/AuthFrame'
import { isInvitationValid } from '@/server/dal/invitations'
import { RegisterForm } from './RegisterForm'

export const metadata = { title: 'Einladung', referrer: 'no-referrer' }

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await isInvitationValid(token))) {
    return (
      <AuthFrame title="Link ungültig" lead="Dieser Einladungslink ist abgelaufen, wurde widerrufen oder schon verwendet." footnote="Bitte den Admin um einen neuen Link.">
        <AuthLink href="/anmelden" variant="secondary">
          Schon ein Konto? Zur Anmeldung
        </AuthLink>
      </AuthFrame>
    )
  }
  return (
    <AuthFrame
      title="Willkommen bei rt100k"
      lead="Leg dein Konto an. Danach richtest du einen Passkey oder die Zwei-Faktor-Anmeldung ein."
      footnote="Deine Daten sieht nur du. Auch der Admin sieht keine Beträge."
    >
      <RegisterForm token={token} />
    </AuthFrame>
  )
}

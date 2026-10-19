import Link from 'next/link'
import { AuthFrame } from '@/components/shell/AuthFrame'
import { isInvitationValid } from '@/server/dal/invitations'
import { RegisterForm } from './RegisterForm'

export const metadata = { title: 'Einladung', referrer: 'no-referrer' }

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await isInvitationValid(token))) {
    return (
      <AuthFrame title="Link ungültig" lead="Dieser Einladungslink ist abgelaufen, wurde widerrufen oder schon verwendet.">
        <p>
          Bitte den Admin um einen neuen Link. Schon ein Konto? <Link href="/anmelden">Zur Anmeldung</Link>
        </p>
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

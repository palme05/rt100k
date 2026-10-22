import { redirect } from 'next/navigation'
import { AuthFrame, AuthLink } from '@/components/shell/AuthFrame'
import { getCurrentUser } from '@/server/auth/session'

export default async function Home() {
  if (await getCurrentUser()) redirect('/app')
  return (
    <AuthFrame
      title="Road to 100k"
      lead="Ein selbst gehosteter, quelloffener Vermögenstracker für Familie und Freunde: Depots, Konten und der Weg zum Ziel an einem Ort."
      footnote="Konten gibt es nur per Einladungslink."
    >
      <AuthLink href="/anmelden">Anmelden</AuthLink>
    </AuthFrame>
  )
}

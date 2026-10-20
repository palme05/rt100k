import { AcceptShare } from '@/components/share/AcceptShare'
import { Note, PageHead } from '@/components/ui/layout'
import { dayLabel } from '@/lib/display'
import { requireUser } from '@/server/auth/session'
import { peekShare } from '@/server/dal/shares'
import { acceptShareAction } from '../actions'

export const metadata = { title: 'Freigabe' }

/** Freigabe-Link öffnen: Vorschau und Annehmen (nur angemeldet). */
export default async function AcceptSharePage({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser()
  const { token } = await params
  const preview = await peekShare(user, token)
  if (!preview) {
    return (
      <>
        <PageHead id="freigabe-titel" title="Freigabe">
          Dieser Link ist ungültig, abgelaufen, wurde schon verwendet oder gehört zu deinem eigenen Depot.
        </PageHead>
        <Note>Bitte um einen neuen Link.</Note>
      </>
    )
  }
  return (
    <>
      <PageHead id="freigabe-titel" title="Depot ansehen?">
        {preview.ownerName} teilt das Depot „{preview.portfolioName}“ mit dir – nur zum Ansehen. Du siehst Positionen und Buchungen, kannst aber nichts ändern.
      </PageHead>
      <AcceptShare accept={acceptShareAction.bind(null, token)} />
      <Note>Der Link gilt bis {dayLabel(preview.expiresAt.slice(0, 10))} und nur einmal. Du kannst die Freigabe später jederzeit verlassen.</Note>
    </>
  )
}

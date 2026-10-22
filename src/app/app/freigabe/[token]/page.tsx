import { AcceptShare } from '@/components/share/AcceptShare'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
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
      <PageHead id="freigabe-titel" eyebrow="Freigabe" title="Depot ansehen?">
        {preview.ownerName} teilt das Depot „{preview.portfolioName}“ mit dir – nur zum Ansehen.
      </PageHead>
      <Grid>
        <Section id="freigabe-umfang" title="Was du siehst" span="twoThirds">
          <Rows>
            <Row label="Positionen und Buchungen" sub="aktuell, solange die Freigabe besteht" value="✓ sichtbar" />
            <Row label="Ändern, buchen, löschen" sub="das Depot bleibt bei der Person, die es teilt" value="✗ nicht möglich" />
            <Row label="Deine eigenen Depots" sub="werden nicht geteilt" value="✗ unsichtbar" />
          </Rows>
          <AcceptShare accept={acceptShareAction.bind(null, token)} />
          <Note>Der Link gilt bis {dayLabel(preview.expiresAt.slice(0, 10))} und nur einmal. Du kannst die Freigabe später jederzeit verlassen.</Note>
        </Section>
      </Grid>
    </>
  )
}

import { AcceptShare } from '@/components/share/AcceptShare'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { dayLabel } from '@/lib/display'
import { requireUser } from '@/server/auth/session'
import { peekGoalShare } from '@/server/dal/goal-shares'
import { acceptGoalShareAction } from '../../../freigabe/actions'

export const metadata = { title: 'Freigabe' }

/** Link zu einem geteilten Ziel öffnen: Vorschau und Annehmen (nur angemeldet). */
export default async function AcceptGoalSharePage({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser()
  const { token } = await params
  const preview = await peekGoalShare(user, token)
  if (!preview) {
    return (
      <>
        <PageHead id="freigabe-titel" title="Freigabe">
          Dieser Link ist ungültig, abgelaufen, wurde schon verwendet oder gehört zu deinem eigenen Ziel.
        </PageHead>
        <Note>Bitte um einen neuen Link.</Note>
      </>
    )
  }
  const edit = preview.role === 'edit'
  return (
    <>
      <PageHead id="freigabe-titel" eyebrow="Freigabe" title={edit ? 'Ziel mitbearbeiten?' : 'Ziel ansehen?'}>
        {preview.ownerName} teilt das Ziel „{preview.goalName}“ mit dir – {edit ? 'zum Ansehen und Mitbearbeiten' : 'nur zum Ansehen'}.
      </PageHead>
      <Grid>
        <Section id="freigabe-umfang" title="Was du siehst" span="twoThirds">
          <Rows>
            <Row label="Stand und Plan des Ziels" sub="Summe der gezählten Depots, aktuell, solange die Freigabe besteht" value="✓ sichtbar" />
            <Row label="Betrag, Datum, Sparrate, Rendite ändern" sub={edit ? 'die Person, die teilt, sieht das unter „Aktivität“' : 'bleibt bei der Person, die teilt'} value={edit ? '✓ möglich' : '✗ nicht möglich'} />
            <Row label="Positionen und Buchungen" sub="nur die Summe wird geteilt" value="✗ unsichtbar" />
            <Row label="Deine eigenen Depots und Ziele" sub="werden nicht geteilt" value="✗ unsichtbar" />
          </Rows>
          <AcceptShare accept={acceptGoalShareAction.bind(null, token)} />
          <Note>Der Link gilt bis {dayLabel(preview.expiresAt.slice(0, 10))} und nur einmal. Du kannst die Freigabe später jederzeit verlassen.</Note>
        </Section>
      </Grid>
    </>
  )
}

import { DiscardTasks } from '@/components/tasks/DiscardTasks'
import { TaskList } from '@/components/tasks/TaskList'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { requireUser } from '@/server/auth/session'
import { listCsvMappings } from '@/server/dal/imports'
import { listTasks } from '@/server/dal/notifications'
import { listPortfolios } from '@/server/dal/portfolios'
import { completeTaskAction } from '../hinweise/actions'
import { discardTasksAction } from './actions'
import { ImportFlow } from './ImportFlow'

export const metadata = { title: 'Import' }
// Vorbereitung fragt Kursanbieter nacheinander ab (siehe PREPARE_MAX_ASSETS)
export const maxDuration = 60

export default async function ImportPage() {
  const user = await requireUser()
  const [portfolios, mappings, tasks] = await Promise.all([listPortfolios(user), listCsvMappings(user), listTasks(user)])
  return (
    <>
      <PageHead id="import-titel" title="Abrechnungen importieren">
        Kauf, Verkauf, Sparplan, Dividende und Zinsen aus PDF oder CSV. Vor dem Speichern siehst du jede erkannte Buchung.
      </PageHead>
      <ImportFlow portfolios={portfolios.map((p) => ({ id: p.id, name: p.name, kind: p.kind, broker: p.broker }))} mappings={mappings} />
      {tasks.length > 0 ? (
        <Grid>
          <Section id="von-hand" title="Von Hand zu buchen" meta={tasks.length === 1 ? '1 Punkt' : `${tasks.length} Punkte`}>
            <Note>
              Was frühere Importe nicht selbst buchen konnten: Kapitalmaßnahmen und Buchungen ohne zugeordneten Wert. Sie fehlen im Bestand – die Datei erneut importieren und den Wert zuordnen, von Hand buchen, oder
              verwerfen, wenn du den Wert nicht mehr hältst.
            </Note>
            <TaskList tasks={tasks.map((t) => ({ key: t.id, title: t.title, body: t.body, href: null, taskId: t.id }))} complete={completeTaskAction} />
            <DiscardTasks count={tasks.length} discard={discardTasksAction} />
          </Section>
        </Grid>
      ) : null}
    </>
  )
}

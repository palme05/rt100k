import { PageLoading } from '@/components/shell/PageLoading'
import { Note, PageHead } from '@/components/ui/layout'

/** Die Analyse lädt beim ersten Aufruf die Kurshistorie – bis dahin sofort sichtbar warten. */
export default function Loading() {
  return (
    <>
      <PageHead id="analyse-titel" title="Analyse">
        Rendite, Risiko, Erträge und Kosten über alle Depots.
      </PageHead>
      <PageLoading label="Analyse wird berechnet …" />
      <Note>Beim ersten Aufruf des Tages lädt die App die Kurshistorie – das dauert ein paar Sekunden. Danach ist die Analyse schnell.</Note>
    </>
  )
}

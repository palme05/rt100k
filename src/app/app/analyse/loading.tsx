import { Note, PageHead } from '@/components/ui/layout'
import { Progress } from '@/components/ui/Progress'

/** Die Analyse lädt beim ersten Aufruf die Kurshistorie – bis dahin sofort sichtbar warten. */
export default function Loading() {
  return (
    <>
      <PageHead id="analyse-titel" title="Analyse">
        Rendite, Risiko, Erträge und Kosten über alle Depots.
      </PageHead>
      <Progress label="Analyse wird berechnet …" />
      <Note>Beim ersten Aufruf lädt die App die Kurshistorie aller Werte – das kann bis zu einer halben Minute dauern. Danach kommt sie 12 Stunden aus dem Zwischenspeicher.</Note>
    </>
  )
}

import { PageLoading } from '@/components/shell/PageLoading'

/** Sofortige Rückmeldung nach dem Klick, solange der Server rechnet. */
export default function Loading() {
  return <PageLoading label="Datenstand wird geprüft …" />
}

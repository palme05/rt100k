import { PageLoading } from '@/components/shell/PageLoading'

/** Nur die Liste (eigene Gruppe): Depot-Seiten mit `notFound()` brauchen ihren 404. */
export default function Loading() {
  return <PageLoading label="Depots werden bewertet …" />
}

'use client'

import { StandaloneErrorState } from '@/components/shell/ErrorState'

/** Fehler außerhalb der App-Seiten oder im App-Rahmen (Anmeldung prüfen, Depots laden). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <StandaloneErrorState digest={error.digest} retry={retry} />
}

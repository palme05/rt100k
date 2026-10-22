'use client'

import '@fontsource-variable/instrument-sans'
import { StandaloneErrorState } from '@/components/shell/ErrorState'
import './globals.css'

/**
 * Letztes Netz für Fehler im Wurzel-Layout: eigenes Dokument mit eigenen
 * Stilen (Farben folgen dem Gerät, die Darstellungs-Wahl ist hier nicht
 * lesbar).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="de-AT">
      <body>
        <title>Fehler · rt100k</title>
        <StandaloneErrorState digest={error.digest} retry={retry} />
      </body>
    </html>
  )
}

'use client'

import { AppErrorState } from '@/components/shell/ErrorState'
import { APP_BASE } from './navigation'

/**
 * Fehler in einer App-Seite (z. B. Datenbank wacht gerade auf): Kopfzeile
 * bleibt, darunter „Erneut versuchen“. Fehler im Rahmen selbst fängt
 * src/app/error.tsx.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AppErrorState digest={error.digest} retry={retry} homeHref={APP_BASE} />
}

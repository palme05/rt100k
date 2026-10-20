import { LastSnapshot } from '@/components/shell/LastSnapshot'

/**
 * Nur die Übersicht (eigene Gruppe): Seiten mit `notFound()` dürfen keine
 * Ladeansicht haben, sonst antworten sie mit 200 statt 404.
 */
export default function Loading() {
  return <LastSnapshot />
}

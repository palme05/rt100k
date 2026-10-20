'use client'

import { useEffect } from 'react'

/** Nach dem Anzeigen alle Hinweise als gelesen markieren (Glocke zählt zurück). */
export function MarkRead({ unread, action }: { unread: number; action: () => Promise<void> }) {
  useEffect(() => {
    if (unread > 0) void action()
  }, [unread, action])
  return null
}

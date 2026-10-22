'use client'

import { useTransition } from 'react'
import { Actions, Button } from '@/components/ui/forms'
import { Note } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { formatDate, formatTime } from '@/lib/format'
import type { SessionDto } from '@/server/dal/sessions'
import { revokeAllSessionsAction, revokeOtherSessionsAction, revokeSessionAction } from './actions'

export function SessionList({ sessions }: { sessions: readonly SessionDto[] }) {
  const [pending, start] = useTransition()
  const when = (iso: string) => `${formatDate(new Date(iso))}, ${formatTime(new Date(iso))}`
  return (
    <>
      <Rows>
        {sessions.map((s) => (
          <Row
            key={s.id}
            label={s.current ? `${s.device} (dieses Gerät)` : s.device}
            sub={`zuletzt aktiv ${when(s.lastActiveAt)}${s.ip ? ` · Netz ${s.ip}` : ''}`}
            value={
              s.current ? null : (
                <Button variant="quiet" disabled={pending} onClick={() => start(() => revokeSessionAction(s.id))} aria-label={`Sitzung ${s.device} beenden`}>
                  Beenden
                </Button>
              )
            }
          />
        ))}
      </Rows>
      {sessions.length < 2 ? <Note>Keine anderen Geräte angemeldet.</Note> : null}
      <Actions>
        {sessions.length >= 2 ? (
          <Button variant="secondary" disabled={pending} onClick={() => start(() => revokeOtherSessionsAction())}>
            Alle anderen abmelden
          </Button>
        ) : null}
        <Button variant="danger" disabled={pending} onClick={() => start(() => revokeAllSessionsAction())}>
          Überall abmelden
        </Button>
      </Actions>
    </>
  )
}

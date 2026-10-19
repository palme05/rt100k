'use client'

import { useTransition } from 'react'
import { Actions, Button } from '@/components/ui/forms'
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
      <Actions>
        <Button variant="secondary" disabled={pending || sessions.length < 2} onClick={() => start(() => revokeOtherSessionsAction())}>
          Alle anderen abmelden
        </Button>
        <Button variant="danger" disabled={pending} onClick={() => start(() => revokeAllSessionsAction())}>
          Überall abmelden
        </Button>
      </Actions>
    </>
  )
}

import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { Stats } from '@/components/ui/Summary'
import { formatDate } from '@/lib/format'
import { requireAdmin } from '@/server/auth/session'
import { listInvitations } from '@/server/dal/invitations'
import { databaseSizeBytes, listUsers } from '@/server/dal/users'
import { InviteForm } from './InviteForm'
import { RevokeButton } from './RevokeButton'

export const metadata = { title: 'Admin' }

const STATUS_LABEL = { offen: 'offen', verwendet: 'verwendet', widerrufen: 'widerrufen', abgelaufen: 'abgelaufen' } as const

export default async function AdminPage() {
  const admin = await requireAdmin()
  const [users, invitations, dbBytes] = await Promise.all([listUsers(admin), listInvitations(admin), databaseSizeBytes(admin)])
  const mb = (dbBytes / 1_048_576).toFixed(1).replace('.', ',')

  return (
    <>
      <PageHead id="admin-titel" title="Admin">
        Nutzer und Einladungen verwalten. Vermögensdaten anderer Nutzer sind hier bewusst nicht sichtbar.
      </PageHead>
      <Grid>
        <Section id="einladen" title="Einladen" meta="Link gilt 72 Stunden, einmalig" span="half">
          <InviteForm />
        </Section>
        <Section id="einladungen" title="Einladungen" span="half">
          {invitations.length === 0 ? (
            <Note>Noch keine Einladungen.</Note>
          ) : (
            <Rows>
              {invitations.map((i) => (
                <Row
                  key={i.id}
                  label={i.note ?? (i.role === 'admin' ? 'Admin-Einladung' : 'Einladung')}
                  sub={`${STATUS_LABEL[i.status]}${i.usedByName ? ` von ${i.usedByName}` : ''} · erstellt ${formatDate(new Date(i.createdAt))}${i.role === 'admin' ? ' · Admin' : ''}`}
                  value={i.status === 'offen' ? <RevokeButton id={i.id} label={i.note ?? ''} /> : null}
                />
              ))}
            </Rows>
          )}
        </Section>
        <Section id="nutzer" title="Nutzer" meta={`${users.length} Konten`}>
          <DataTable
            caption="Nutzerkonten"
            head={
              <>
                <Th>Name</Th>
                <Th>Rolle</Th>
                <Th hideSm>2FA</Th>
                <Th hideSm>Passkeys</Th>
                <Th>Zuletzt aktiv</Th>
              </>
            }
          >
            {users.map((u) => (
              <tr key={u.id}>
                <NameCell name={u.name} sub={u.email} />
                <Td>{u.role === 'admin' ? 'Admin' : 'Mitglied'}</Td>
                <Td hideSm>{u.twoFactorEnabled ? 'ja' : 'nein'}</Td>
                <Td hideSm>{u.passkeys}</Td>
                <Td>{u.lastActiveAt ? formatDate(new Date(u.lastActiveAt)) : '–'}</Td>
              </tr>
            ))}
          </DataTable>
        </Section>
        <Section id="betrieb" title="Betrieb" meta="Neon Free: 1 GB Speicher, 100 CU-Stunden/Monat">
          <Stats items={[{ label: 'Datenbankgröße', value: `${mb} MB` }]} />
          <Note>Der CU-Verbrauch braucht einen Neon-API-Schlüssel und folgt in Phase 6 (Neon-Konsole → Usage).</Note>
        </Section>
      </Grid>
    </>
  )
}

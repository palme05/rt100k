import { Message } from '@/components/ui/forms'
import { Grid, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { auditLabel } from '@/lib/audit-labels'
import { formatDate, formatTime } from '@/lib/format'
import { requireUser } from '@/server/auth/session'
import { isLastAdmin } from '@/server/dal/account'
import { listAuditEvents, recentNewDeviceLogin } from '@/server/dal/audit'
import { listPasskeys } from '@/server/dal/credentials'
import { listPortfolios } from '@/server/dal/portfolios'
import { listSessions } from '@/server/dal/sessions'
import { SignOutButton } from '../SignOutButton'
import { DataSettings } from './DataSettings'
import { DeleteAccount } from './DeleteAccount'
import { PasskeySettings } from './PasskeySettings'
import { PasswordSettings } from './PasswordSettings'
import { SessionList } from './SessionList'
import { TwoFactorSettings } from './TwoFactorSettings'

export const metadata = { title: 'Konto und Sicherheit' }

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  const params = await searchParams
  const [passkeys, sessions, events, recentNewDevice, portfolios, lastAdmin] = await Promise.all([
    listPasskeys(user),
    listSessions(user),
    listAuditEvents(user, 30),
    recentNewDeviceLogin(user),
    listPortfolios(user),
    isLastAdmin(user),
  ])
  const when = (iso: string) => `${formatDate(new Date(iso))}, ${formatTime(new Date(iso))}`
  const mustSetup2fa = user.role === 'admin' && !user.twoFactorEnabled

  return (
    <>
      <PageHead id="sicherheit-titel" title="Konto und Sicherheit">
        {user.name} · {user.email} · {user.role === 'admin' ? 'Admin' : 'Mitglied'}
      </PageHead>

      {params.willkommen ? (
        <Message tone="success">Dein Konto ist angelegt. Richte jetzt einen Passkey oder die Zwei-Faktor-Anmeldung ein – beides schützt dein Konto, falls das Passwort einmal in falsche Hände gerät.</Message>
      ) : null}
      {mustSetup2fa ? <Message tone="info">Als Admin musst du die Zwei-Faktor-Anmeldung einrichten, bevor du die App nutzen kannst.</Message> : null}
      {recentNewDevice ? (
        <Message tone="info">
          Neue Anmeldung von {recentNewDevice.userAgent ?? 'einem unbekannten Gerät'} am {when(recentNewDevice.createdAt)}. Warst du das nicht? Dann „Überall abmelden“ und das Passwort ändern.
        </Message>
      ) : null}

      <Grid>
        <Section id="passkeys" title="Passkeys" span="half">
          <PasskeySettings passkeys={passkeys} />
        </Section>
        <Section id="zwei-faktor" title="Zwei-Faktor-Anmeldung" meta={user.role === 'admin' ? 'Pflicht für Admins' : 'empfohlen'} span="half">
          <TwoFactorSettings enabled={user.twoFactorEnabled} isAdmin={user.role === 'admin'} />
        </Section>
        <Section id="sitzungen" title="Angemeldete Geräte" meta="Sitzungen laufen nach 7 Tagen ohne Nutzung ab" span="half" actions={<SignOutButton />}>
          <SessionList sessions={sessions} />
        </Section>
        <Section id="passwort" title="Passwort" span="half">
          <PasswordSettings />
        </Section>
        <Section id="aktivitaet" title="Aktivität" meta="letzte 30 Ereignisse, Aufbewahrung 2 Jahre">
          <Rows>
            {events.map((e) => (
              <Row
                key={e.id}
                date={formatDate(new Date(e.createdAt)).slice(0, 6)}
                label={auditLabel(e.type)}
                sub={[formatTime(new Date(e.createdAt)), e.userAgent, e.ip ? `Netz ${e.ip}` : null, e.byOther ? 'durch Admin' : null].filter(Boolean).join(' · ')}
                value={null}
              />
            ))}
          </Rows>
        </Section>
        <Section id="daten" title="Daten und Backup" span="half">
          <DataSettings canRestore={portfolios.length === 0} />
        </Section>
        <Section id="konto-loeschen" title="Konto löschen" span="half">
          <DeleteAccount lastAdmin={lastAdmin} />
        </Section>
      </Grid>
    </>
  )
}

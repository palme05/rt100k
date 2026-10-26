import { cookies } from 'next/headers'
import { DismissibleMessage } from '@/components/ui/DismissibleMessage'
import { Message } from '@/components/ui/forms'
import { PageHead } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { auditLabel } from '@/lib/audit-labels'
import { formatDate, formatTime } from '@/lib/format'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { requireUser } from '@/server/auth/session'
import { isLastAdmin } from '@/server/dal/account'
import { listAuditEvents, recentNewDeviceLogin } from '@/server/dal/audit'
import { listPasskeys } from '@/server/dal/credentials'
import { listPortfolios } from '@/server/dal/portfolios'
import { listSessions } from '@/server/dal/sessions'
import { DataSettings } from './DataSettings'
import { DeleteAccount } from './DeleteAccount'
import { PasskeySettings } from './PasskeySettings'
import { PasswordSettings } from './PasswordSettings'
import { SessionList } from './SessionList'
import { SettingsGroup, SettingsGroups } from './SettingsGroup'
import styles from './security.module.css'
import { HapticsSetting } from './HapticsSetting'
import { ThemeSettings } from './ThemeSettings'
import { TwoFactorSettings } from './TwoFactorSettings'
import { setThemeAction } from './actions'
import { confirmNewDeviceAction } from '../(start)/actions'

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
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

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
        <DismissibleMessage label="Hinweis schließen – das war ich" dismiss={confirmNewDeviceAction.bind(null, recentNewDevice.id)}>
          Neue Anmeldung von {recentNewDevice.userAgent ?? 'einem unbekannten Gerät'} am {when(recentNewDevice.createdAt)}. Warst du das nicht? Dann „Überall abmelden“ und das Passwort ändern.
        </DismissibleMessage>
      ) : null}

      <SettingsGroups>
        <SettingsGroup id="darstellung" title="Darstellung" meta="nur dieses Gerät" intro="„Wie das Gerät“ folgt der Einstellung von iPhone, Android, macOS oder Windows – auch automatisch am Abend. Haptik vibriert kurz beim Antippen und Wischen.">
          <ThemeSettings theme={theme} save={setThemeAction} />
          <HapticsSetting />
        </SettingsGroup>
        <SettingsGroup id="passkeys" title="Passkeys" meta="empfohlen" intro="Passkeys ersetzen das Passwort durch Fingerabdruck, Gesicht oder PIN deines Geräts. Sie sind fälschungssicher und funktionieren nur auf dieser Website.">
          <PasskeySettings passkeys={passkeys} />
        </SettingsGroup>
        <SettingsGroup
          id="zwei-faktor"
          title="Zwei-Faktor-Anmeldung"
          meta={user.role === 'admin' ? 'Pflicht für Admins' : 'empfohlen'}
          intro="Nach dem Passwort fragt rt100k zusätzlich nach einem Code aus einer Authenticator-App."
        >
          <TwoFactorSettings enabled={user.twoFactorEnabled} isAdmin={user.role === 'admin'} />
        </SettingsGroup>
        <SettingsGroup id="passwort" title="Passwort" intro="Nach dem Ändern werden alle anderen Geräte abgemeldet.">
          <PasswordSettings />
        </SettingsGroup>
        <SettingsGroup id="sitzungen" title="Angemeldete Geräte" meta="Sitzungen laufen nach 7 Tagen ohne Nutzung ab" intro="Ein unbekanntes Gerät? Beenden und danach das Passwort ändern.">
          <SessionList sessions={sessions} />
        </SettingsGroup>
        <SettingsGroup id="aktivitaet" title="Aktivität" meta="letzte 30 Ereignisse, Aufbewahrung 2 Jahre" intro="Anmeldungen und Änderungen an der Sicherheit deines Kontos.">
          <div className={styles.wide}>
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
          </div>
        </SettingsGroup>
        <SettingsGroup
          id="daten"
          title="Daten und Backup"
          intro="Vollständiges Backup als JSON (Depots, Buchungen, Verlauf, Einstellungen, Aktivität) oder nur die Buchungen als CSV für Excel. Passwort, Passkeys und Sitzungen sind nie enthalten."
        >
          <DataSettings canRestore={portfolios.length === 0} />
        </SettingsGroup>
        <SettingsGroup
          id="konto-loeschen"
          title="Konto löschen"
          meta="endgültig"
          tone="danger"
          intro="Löscht dein Konto mit allen Depots, Buchungen, dem Verlauf, Einstellungen, Passkeys und Sitzungen. Das lässt sich nicht rückgängig machen – lade vorher ein Backup herunter."
        >
          <DeleteAccount lastAdmin={lastAdmin} />
        </SettingsGroup>
      </SettingsGroups>
    </>
  )
}

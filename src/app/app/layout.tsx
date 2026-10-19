import type { Metadata } from 'next'
import { PrivacyProvider } from '@/components/privacy/privacy'
import { AppShell } from '@/components/shell/AppShell'
import { requireUser } from '@/server/auth/session'
import { listPortfolios } from '@/server/dal/portfolios'
import { AccountMenu } from './AccountMenu'
import { APP_BASE, APP_HOTKEYS, appCommands, appNav } from './navigation'

export const metadata: Metadata = { title: { default: 'Übersicht', template: '%s · rt100k' } }

/**
 * Rahmen der App. Achtung: Layouts laufen bei Navigation nicht immer neu –
 * jede Seite und jede Server Action prüft die Session selbst (requireUser).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  const isAdmin = user.role === 'admin'
  const portfolios = await listPortfolios(user)
  return (
    <PrivacyProvider>
      <AppShell
        homeHref={APP_BASE}
        nav={appNav(isAdmin)}
        commands={appCommands(portfolios, isAdmin)}
        hotkeys={APP_HOTKEYS}
        account={<AccountMenu name={user.name} />}
      >
        {children}
      </AppShell>
    </PrivacyProvider>
  )
}

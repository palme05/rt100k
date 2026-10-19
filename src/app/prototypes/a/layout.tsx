import { AppShell } from '@/components/shell/AppShell'
import { BASE, COMMANDS, HOTKEYS, NAV } from '@/prototypes/navigation'

export const metadata = { title: { default: 'Strecke', template: '%s · Strecke' } }

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell homeHref={BASE} nav={NAV} commands={COMMANDS} hotkeys={HOTKEYS}>
      {children}
    </AppShell>
  )
}

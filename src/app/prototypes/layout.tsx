import type { Metadata } from 'next'
import { PrivacyProvider } from '@/prototypes/shared/privacy'

export const metadata: Metadata = {
  title: { default: 'Prototypen', template: '%s · rt100k Prototyp' },
  robots: { index: false, follow: false },
}

export default function PrototypesLayout({ children }: { children: React.ReactNode }) {
  return <PrivacyProvider>{children}</PrivacyProvider>
}

import { PageTransition } from '@/components/shell/PageTransition'

/** Läuft bei jedem Seitenwechsel neu – dadurch der Übergang. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}

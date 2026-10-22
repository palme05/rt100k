import { AuthLink, StatusFrame } from '@/components/shell/AuthFrame'

export const metadata = { title: 'Seite nicht gefunden' }

export default function NotFound() {
  return (
    <StatusFrame eyebrow="404" title="Diese Seite gibt es nicht." lead="Vielleicht ein alter Link oder ein Tippfehler in der Adresse.">
      <AuthLink href="/">Zur Startseite</AuthLink>
    </StatusFrame>
  )
}

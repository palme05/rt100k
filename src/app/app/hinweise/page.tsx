import { MarkRead } from '@/components/notify/MarkRead'
import { PriceAlerts } from '@/components/notify/PriceAlerts'
import { PushSettings } from '@/components/notify/PushSettings'
import { Amount } from '@/components/privacy/privacy'
import { Grid, Muted, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { dayLabel } from '@/lib/display'
import { viennaDay } from '@/lib/format'
import { PRICE_ONE } from '@/lib/quantity'
import { requireUser } from '@/server/auth/session'
import { listNotifications, listPriceAlerts, unreadCount, type NotificationDto } from '@/server/dal/notifications'
import { valuePortfolios } from '@/server/overview'
import { vapidKeys } from '@/server/push'
import { quoteInEur } from '@/server/quotes/service'
import { createPriceAlertAction, deletePriceAlertAction, deletePushSubscriptionAction, markAllReadAction, savePushSubscriptionAction } from './actions'

export const metadata = { title: 'Hinweise' }

const KIND_LABEL: Record<NotificationDto['kind'], string> = { price_alert: 'Kursalarm', dividend: 'Dividende', milestone: 'Meilenstein', speculation_end: 'Spekulationsfrist', task: 'Aufgabe', savings_plan: 'Sparplan', import_reminder: 'Import' }

export default async function NotificationsPage() {
  const user = await requireUser()
  const [notifications, unread, alerts, valuation] = await Promise.all([listNotifications(user), unreadCount(user), listPriceAlerts(user), valuePortfolios(user)])

  // Kursalarme nur für gehaltene Werte mit laufendem Kurs
  const instruments = [...valuation.instruments.values()]
    .filter((i) => i.symbol || i.coingeckoId || i.metal)
    .map((i) => {
      const q = valuation.quotes.get(i.id)
      const eur = q ? quoteInEur(q, valuation.fx) : null
      return { id: i.id, name: i.name, price: eur === null ? null : Number(eur) / Number(PRICE_ONE) }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return (
    <>
      <PageHead id="hinweise-titel" title="Hinweise">
        Kursalarme, Dividenden, Meilensteine und Spekulationsfristen – erzeugt beim täglichen Lauf nach Börsenschluss.
      </PageHead>
      <MarkRead unread={unread} action={markAllReadAction} />

      <Grid>
        <Section id="hinweise-liste" title="Neueste Hinweise" meta={unread > 0 ? `${unread} neu` : undefined} span="twoThirds">
          {notifications.length === 0 ? (
            <Note>Noch keine Hinweise. Sie erscheinen, sobald eine Dividende eingeht, ein Kursalarm auslöst, ein Meilenstein erreicht ist oder eine Spekulationsfrist abläuft.</Note>
          ) : (
            <Rows>
              {notifications.map((n) => (
                <Row
                  key={n.id}
                  date={dayLabel(viennaDay(new Date(n.createdAt)), false)}
                  label={n.link ? <TextLink href={n.link}>{n.title}</TextLink> : n.title}
                  sub={
                    <>
                      {n.fresh ? '● neu · ' : null}
                      {KIND_LABEL[n.kind]}
                      {n.body ? ` · ${n.body}` : null}
                    </>
                  }
                  value={n.amount === null ? <Muted>–</Muted> : <Amount value={n.amount} />}
                />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="kursalarme" title="Kursalarme" meta="täglich nach Börsenschluss geprüft, je Alarm einmal" span="third">
          <PriceAlerts instruments={instruments} alerts={alerts.map((a) => ({ id: a.id, instrumentName: a.instrumentName, direction: a.direction, threshold: a.threshold, triggeredAt: a.triggeredAt }))} create={createPriceAlertAction} remove={deletePriceAlertAction} />
        </Section>

        <Section id="mitteilungen" title="Mitteilungen auf diesem Gerät" span="half">
          <PushSettings publicKey={vapidKeys()?.publicKey ?? null} save={savePushSubscriptionAction} remove={deletePushSubscriptionAction} />
          <Note>Die Mitteilung sagt nur „Neue Hinweise in rt100k“ – keine Beträge, keine Namen. Was es Neues gibt, steht nach der Anmeldung hier. Beim Abmelden wird sie auf diesem Gerät ausgeschaltet.</Note>
        </Section>
      </Grid>
    </>
  )
}

import { historyStatus, providerStatus } from '@/server/quotes/status'

/** Öffentlicher Status der Kursquellen und der Kurshistorie (nur ja/nein, 10 Minuten gecacht). */
export async function GET() {
  const [quellen, historie] = await Promise.all([providerStatus(), historyStatus()])
  return Response.json({ quellen, historie }, { headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } })
}

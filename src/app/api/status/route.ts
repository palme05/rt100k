import { historyStatus, intradayStatus, providerStatus } from '@/server/quotes/status'

/** Öffentlicher Status der Kursquellen, der Kurshistorie und des Tagesverlaufs (nur ja/nein, 10 Minuten gecacht). */
export async function GET() {
  const [quellen, historie, tagesverlauf] = await Promise.all([providerStatus(), historyStatus(), intradayStatus()])
  return Response.json({ quellen, historie, tagesverlauf }, { headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } })
}

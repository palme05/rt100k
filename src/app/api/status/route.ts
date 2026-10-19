import { providerStatus } from '@/server/quotes/status'

/** Öffentlicher Status der Kursquellen (nur ja/nein, 10 Minuten gecacht). */
export async function GET() {
  const status = await providerStatus()
  return Response.json({ quellen: status }, { headers: { 'cache-control': 'public, max-age=300' } })
}

import 'server-only'
import { parseJsonExact } from './json'
import { ProviderError } from './types'

const USER_AGENT = 'Mozilla/5.0 (compatible; rt100k/1.0; +https://github.com/palme05/rt100k)'
/** Zeitlimit je Abruf – die Seite wartet darauf, danach greifen Cache und gespeicherte Kurse */
const TIMEOUT_MS = 4_000
const MAX_BYTES = 1_000_000

/**
 * Abruf bei Kursanbietern: nur serverseitig, Zeitlimit, Größenlimit, Cache über
 * den Next-Data-Cache (auf Vercel instanzübergreifend). Gibt geparstes JSON
 * (Zahlen als Text) oder Text zurück.
 */
export async function providerFetch(provider: string, url: string, init: { revalidate: number; headers?: Record<string, string>; as?: 'json' | 'text'; method?: 'GET' | 'POST'; body?: string }): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      ...(init.body === undefined ? {} : { body: init.body }),
      headers: { 'user-agent': USER_AGENT, accept: init.as === 'text' ? 'application/xml,text/xml,*/*' : 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: init.revalidate },
    })
  } catch (error) {
    throw new ProviderError(provider, error instanceof Error && error.name === 'TimeoutError' ? 'Zeitüberschreitung' : 'nicht erreichbar')
  }
  if (!response.ok) throw new ProviderError(provider, `HTTP ${response.status}`)
  const text = await response.text()
  if (text.length > MAX_BYTES) throw new ProviderError(provider, 'Antwort zu groß')
  if (init.as === 'text') return text
  try {
    return parseJsonExact(text)
  } catch {
    throw new ProviderError(provider, 'ungültiges JSON')
  }
}

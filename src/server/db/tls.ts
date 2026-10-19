const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * Erzwingt für entfernte Datenbanken TLS mit Zertifikats- und Hostnamenprüfung
 * (sslmode=verify-full). node-postgres behandelt `require` heute noch genauso,
 * ab pg 9 aber nach libpq-Semantik ohne Prüfung – das soll nie unbemerkt passieren.
 * Lokale Datenbanken (Tests, CI) bleiben unverändert.
 */
export function withStrictTls(connectionString: string): string {
  const url = new URL(connectionString)
  if (LOCAL_HOSTS.has(url.hostname)) return connectionString
  url.searchParams.set('sslmode', 'verify-full')
  url.searchParams.delete('uselibpqcompat')
  return url.toString()
}

import { getAuth } from '@/server/auth/auth'

/** Better-Auth-Endpunkte (Login, 2FA, Passkeys, Sessions). Origin-Prüfung und Rate-Limit macht Better Auth. */
export async function GET(request: Request) {
  return getAuth().handler(request)
}

export async function POST(request: Request) {
  return getAuth().handler(request)
}

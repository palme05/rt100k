/**
 * Wer handelt. Kommt ausschließlich aus der serverseitig geprüften Session
 * (src/server/auth/session.ts) – nie aus Formularen oder URL-Parametern.
 */
export interface Actor {
  id: string
  role: 'member' | 'admin'
}

export function isAdmin(actor: Actor): boolean {
  return actor.role === 'admin'
}

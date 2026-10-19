import { z } from 'zod'
import { NotFoundError } from './errors'

const uuid = z.uuid()

/** IDs aus URLs/Formularen prüfen; ungültige verhalten sich wie unbekannte. */
export function parseId(value: unknown): string {
  const result = uuid.safeParse(value)
  if (!result.success) throw new NotFoundError()
  return result.data
}

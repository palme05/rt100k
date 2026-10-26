'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { deleteCsvMapping, findSimilarImports, ImportConflictError, importBookings, saveCsvMapping, type CsvMappingDto, type SimilarBooking } from '@/server/dal/imports'
import { addTasks, discardAllTasks } from '@/server/dal/notifications'
import { prepareImport, type PreparedImport } from '@/server/imports'
import { consumeRateLimit } from '@/server/dal/rate-limit'

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; conflicts?: string[] }

function fail(error: unknown): { ok: false; error: string; conflicts?: string[] } {
  if (error instanceof ImportConflictError) return { ok: false, error: error.message, conflicts: error.instrumentIds }
  if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
  if (error instanceof Error && error.name === 'ZodError') return { ok: false, error: 'Ungültige Import-Daten.' }
  throw error
}

/** Instrumente zuordnen, Duplikate und schon importierte Dateien melden. */
export async function prepareImportAction(input: unknown): Promise<Result<PreparedImport>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    return { ok: true, ...(await prepareImport(user, input)) }
  } catch (error) {
    return fail(error)
  }
}

/** Zeilen, die einer schon gespeicherten Buchung im Zieldepot fast gleichen (z. B. von Hand erfasst). */
export async function similarImportAction(input: unknown): Promise<Result<{ similar: SimilarBooking[] }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    return { ok: true, similar: await findSimilarImports(user, input) }
  } catch (error) {
    return fail(error)
  }
}

export async function commitImportAction(input: unknown): Promise<Result<{ created: number; duplicates: number }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    const result = await importBookings(user, input)
    revalidatePath('/app', 'layout')
    return { ok: true, ...result }
  } catch (error) {
    return fail(error)
  }
}

/** Kapitalmaßnahmen, die der Import nicht selbst buchen konnte, als Aufgaben merken. */
export async function saveImportTasksAction(texts: unknown): Promise<Result<{ created: number }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'import')
    const created = await addTasks(user, texts)
    revalidatePath('/app', 'layout')
    return { ok: true, created }
  } catch (error) {
    return fail(error)
  }
}

/** Alle Nacharbeiten aus Importen verwerfen (die Buchungen bleiben unberührt). */
export async function discardTasksAction(): Promise<{ ok: boolean; error: string | null }> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await discardAllTasks(user)
  } catch (error) {
    return { ok: false, error: fail(error).error }
  }
  revalidatePath('/app', 'layout')
  return { ok: true, error: null }
}

export async function saveMappingAction(name: unknown, mapping: unknown): Promise<Result<{ mapping: CsvMappingDto }>> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    return { ok: true, mapping: await saveCsvMapping(user, { name, mapping }) }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteMappingAction(id: unknown): Promise<Result<object>> {
  const user = await requireUser()
  try {
    await deleteCsvMapping(user, id)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

import 'server-only'
import type { Actor } from './dal/actor'
import { listBookings } from './dal/bookings'
import { getInstruments } from './dal/instruments'

export interface HeldInstrumentDto {
  id: string
  name: string
  kind: string
}

/** Werte, die in einem Depot schon gebucht sind – für die Auswahl im Buchungsformular. */
export async function loadHeldInstruments(actor: Actor, portfolioId: string): Promise<HeldInstrumentDto[]> {
  const bookings = await listBookings(actor, portfolioId)
  // neueste zuerst: zuletzt gebuchter Wert ist vorausgewählt
  const ids = [...new Set(bookings.map((b) => b.instrumentId).filter((v): v is string => !!v))]
  const found = new Map((await getInstruments(actor, ids)).map((i) => [i.id, i]))
  return ids.flatMap((id) => {
    const i = found.get(id)
    return i ? [{ id: i.id, name: i.name, kind: i.kind }] : []
  })
}

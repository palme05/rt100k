import { beforeAll, describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { createGoal, deleteGoal, listGoals, MAX_GOALS, updateGoal } from './goals'
import { createPortfolio, deletePortfolio } from './portfolios'

let alice: Actor
let bob: Actor
let cash: string
let depot: string
let bobsDepot: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  cash = (await createPortfolio(alice, { name: 'Tagesgeld', kind: 'cash' })).id
  depot = (await createPortfolio(alice, { name: 'Kinderdepot', kind: 'depot' })).id
  bobsDepot = (await createPortfolio(bob, { name: 'Bobs Depot', kind: 'depot' })).id
})

const notgroschen = () => ({ name: 'Notgroschen', target: '10.000', targetDate: '', monthly: '200', returnPct: '', scope: 'selected', portfolioIds: [cash] })

describe('Eigene Ziele', () => {
  it('legt ein Ziel mit Depot-Auswahl an und listet es', async () => {
    const g = await createGoal(alice, notgroschen())
    expect(g).toMatchObject({ name: 'Notgroschen', targetCents: 1_000_000, targetDate: null, monthlyCents: 20_000, returnBp: null, scope: 'selected', portfolioIds: [cash] })
    expect(await listGoals(alice)).toEqual([g])
  })

  it('Rendite in Prozent, Zieldatum in der Zukunft, alle Depots', async () => {
    const g = await createGoal(alice, { name: 'Kinderdepot zum 18.', target: '25.000,00', targetDate: '2040-06-01', monthly: '', returnPct: '6,5', scope: 'all', portfolioIds: [depot] })
    expect(g).toMatchObject({ returnBp: 650, targetDate: '2040-06-01', monthlyCents: null, scope: 'all', portfolioIds: [] })
  })

  it.each([
    [{ name: '' }, 'name'],
    [{ target: '0' }, 'target'],
    [{ target: 'viel' }, 'target'],
    [{ targetDate: '2020-01-01' }, 'targetDate'],
    [{ targetDate: '01.01.2030' }, 'targetDate'],
    [{ monthly: '-5' }, 'monthly'],
    [{ returnPct: '45' }, 'returnPct'],
    [{ returnPct: 'abc' }, 'returnPct'],
    [{ scope: 'hack' }, 'scope'],
    [{ scope: 'selected', portfolioIds: [] }, 'portfolioIds'],
  ])('prüft Eingaben: %o → %s', async (patch, field) => {
    const error = await createGoal(alice, { ...notgroschen(), ...patch }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).field).toBe(field)
  })

  it('fremde Depots lassen sich nicht wählen, fremde Ziele nicht sehen, ändern oder löschen', async () => {
    await expect(createGoal(alice, { ...notgroschen(), portfolioIds: [bobsDepot] })).rejects.toBeInstanceOf(NotFoundError)
    await expect(createGoal(alice, { ...notgroschen(), portfolioIds: [cash, bobsDepot] })).rejects.toBeInstanceOf(NotFoundError)
    const [own] = await listGoals(alice)
    expect(await listGoals(bob)).toEqual([])
    await expect(updateGoal(bob, own!.id, { ...notgroschen(), portfolioIds: [bobsDepot] })).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteGoal(bob, own!.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(updateGoal(alice, own!.id, { ...notgroschen(), portfolioIds: [bobsDepot] })).rejects.toBeInstanceOf(NotFoundError)
    expect((await listGoals(alice))[0]).toEqual(own)
  })

  it('ändern ersetzt die Auswahl; gelöschte Depots fallen heraus', async () => {
    const extra = (await createPortfolio(alice, { name: 'Festgeld', kind: 'cash' })).id
    const [own] = await listGoals(alice)
    const changed = await updateGoal(alice, own!.id, { ...notgroschen(), target: '12.000', portfolioIds: [cash, extra] })
    expect(changed).toMatchObject({ targetCents: 1_200_000, portfolioIds: [cash, extra] })
    await deletePortfolio(alice, extra)
    expect((await listGoals(alice)).find((g) => g.id === own!.id)?.portfolioIds).toEqual([cash])
  })

  it('löschen und Obergrenze', async () => {
    const goals = await listGoals(alice)
    await deleteGoal(alice, goals[1]!.id)
    await expect(deleteGoal(alice, goals[1]!.id)).rejects.toBeInstanceOf(NotFoundError)
    const carl = await createUser('Carl')
    for (let i = 0; i < MAX_GOALS; i++) await createGoal(carl, { name: `Ziel ${i}`, target: '100', scope: 'all' })
    await expect(createGoal(carl, { name: 'eins zu viel', target: '100', scope: 'all' })).rejects.toBeInstanceOf(ValidationError)
  })
})

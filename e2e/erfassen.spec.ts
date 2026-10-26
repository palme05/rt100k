import { expect, test, type Locator, type Page } from '@playwright/test'
import { TR_CSV_EXPORT } from '../src/lib/import/fixtures'
import { addPriceClose, amountMode, buyEtf, buyEtfUnit, collectProblems, createPortfolio, daysAgo, expectNoOverflow, pickEtf, register } from './helpers/app'

/** Wischen per Touch (Pointer-Ereignisse wie auf dem Handy). */
async function swipe(row: Locator, direction: 'left' | 'right') {
  const box = (await row.boundingBox())!
  const y = box.y + box.height / 2
  const [from, to] = direction === 'left' ? [box.x + box.width - 16, box.x + 16] : [box.x + 16, box.x + box.width - 16]
  await row.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: from, clientY: y })
  await row.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, clientX: to, clientY: y })
}

const saveBooking = async (page: Page) => {
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()
}

test('Schnell buchen: „+“ am Handy, „+ Buchung“ und G B am Desktop, Depot wählen', async ({ page, isMobile }) => {
  const problems = collectProblems(page)
  await register(page)
  const depot = await createPortfolio(page, 'Depot')
  const cash = await createPortfolio(page, 'Tagesgeld', 'cash')

  // aus einem Depot heraus: dieses Depot ist vorgewählt
  await page.goto(`/app/depots/${depot}`)
  await page.getByRole('link', { name: 'Neue Buchung' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/buchen\\?depot=${depot}$`))
  await expect(page.getByRole('heading', { name: 'Neue Buchung', level: 1 })).toBeVisible()
  const chooser = page.getByRole('navigation', { name: 'Depot oder Konto' })
  await expect(chooser.getByRole('link', { name: 'Depot', exact: true })).toHaveAttribute('aria-current', 'true')
  await buyEtf(page, '2', '256,90')
  // auf der Erfassungsseite selbst kein „+“
  await expect(page.getByRole('link', { name: 'Neue Buchung' })).toHaveCount(0)

  await chooser.getByRole('link', { name: 'Tagesgeld', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`depot=${cash}$`))
  await expect(chooser.getByRole('link', { name: 'Tagesgeld', exact: true })).toHaveAttribute('aria-current', 'true')
  await page.getByLabel('Betrag in €', { exact: true }).fill('500,00')
  await saveBooking(page)
  await expectNoOverflow(page)

  if (!isMobile) {
    await page.goto('/app')
    // Tastenkürzel greifen erst nach dem Laden der Seite – bis dahin erneut drücken
    await expect(async () => {
      await page.keyboard.press('g')
      await page.keyboard.press('b')
      await expect(page).toHaveURL(/\/app\/buchen$/, { timeout: 1000 })
    }).toPass({ timeout: 15_000 })
  }
  expect(problems).toEqual([])
})

test('Cash-Konto: Kontostand abgleichen bucht nur den Unterschied', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Tagesgeld', 'cash')
  await page.getByLabel('Betrag in €', { exact: true }).fill('1.000,00')
  await saveBooking(page)

  const section = page.getByRole('region', { name: 'Kontostand abgleichen' })
  await expect(section).toContainText(/Gebucht sind 1\.000,00\s€/)
  const balance = section.getByLabel('Kontostand laut Bank')
  await balance.fill('1.012,34')
  await section.getByRole('button', { name: 'Abgleichen' }).click()
  await expect(section.getByText(/Abgeglichen: \+12,34\s€ als Einzahlung/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('2 Buchungen')
  await expect(section).toContainText(/Gebucht sind 1\.012,34\s€/)

  await balance.fill('1.012,34')
  await section.getByRole('button', { name: 'Abgleichen' }).click()
  await expect(section.getByText(/Der Stand stimmt schon/)).toBeVisible()
  await balance.fill('viel')
  await section.getByRole('button', { name: 'Abgleichen' }).click()
  await expect(section.getByText(/bitte als Betrag angeben/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('2 Buchungen')
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Buchung löschen fragt nach – am Handy auch wischen (links löschen, rechts bearbeiten)', async ({ page, isMobile }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00')
  await buyEtf(page, '5', '600,00')

  const list = page.getByRole('region', { name: 'Buchungen' })
  const confirm = list.getByRole('group', { name: 'Löschen bestätigen' })
  await list.getByRole('button', { name: /^Kauf vom .* löschen$/ }).first().click()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(list).toContainText('2 Buchungen')

  await list.getByRole('button', { name: /^Kauf vom .* löschen$/ }).first().click()
  await confirm.getByRole('button', { name: /^Ja, Kauf vom .* löschen$/ }).click()
  await expect(list).toContainText('1 Buchung')

  if (isMobile) {
    const row = list.locator('li[data-swipe]').first()
    await swipe(row, 'left')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Abbrechen' }).click()
    await swipe(row, 'right')
    await expect(page).toHaveURL(new RegExp(`/app/depots/${id}/buchung/[0-9a-f-]{36}$`))
    await expect(page.getByRole('heading', { name: 'Buchung bearbeiten', level: 1 })).toBeVisible()
  }
  expect(problems).toEqual([])
})

test('Offene Punkte: fehlende Kaufkosten beheben, Aufgabe aus dem Import abhaken', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Trade Republic')

  // Übertrag ohne Anschaffungskosten
  await page.getByLabel('Art', { exact: true }).selectOption('transfer_in')
  await page.getByLabel('Wertpapier').fill('IE00BK5BQT80')
  await page.getByRole('button', { name: /Vanguard FTSE All-World/ }).click()
  await page.getByLabel('Stück', { exact: true }).fill('3')
  // Ø Einstandskurs leer bzw. 0 → Anschaffungskosten 0
  await page.getByLabel(/Einstandskurs/).fill('0')
  await saveBooking(page)

  // Export mit einem Kauf und einer Kapitalmaßnahme, die von Hand zu buchen ist
  const head = TR_CSV_EXPORT.split('\n')[0]!
  const csv = [
    head,
    '"2026-03-10T09:00:00.000Z","2026-03-10","DEFAULT","TRADING","BUY","FUND","FTSE All-World USD (Acc)","IE00BK5BQT80","2.0000000000","120.000000","-240.00","-1.00","","EUR","","","","","e2e-aufgabe-1","","","",""',
    '"2026-04-02T06:00:00.000Z","2026-04-02","DEFAULT","CORPORATE_ACTION","DELISTING","STOCK","Testaktie","FR0000120271","-7","","","","","EUR","","","","","e2e-aufgabe-2","","","",""',
    // erfundene, gültige ISIN, die kein Kursanbieter kennt → bleibt ohne Zuordnung
    '"2026-05-04T09:00:00.000Z","2026-05-04","DEFAULT","TRADING","BUY","STOCK","Muster Holding","DE000TEST009","3.0000000000","50.000000","-150.00","-1.00","","EUR","","","","","e2e-aufgabe-3","","","",""',
  ].join('\n')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('button', { name: /Buchung(en)? übernehmen$/ }).click()
  await expect(page.getByText(/unter „Offene Punkte“/)).toBeVisible()

  await page.goto('/app')
  const tasks = page.getByRole('region', { name: 'Offene Punkte' })
  await expect(tasks).toContainText('Kaufkosten fehlen: Vanguard')
  await expect(tasks).toContainText(/DELISTING · Testaktie/)
  await expect(tasks).toContainText('Kauf Muster Holding (DE000TEST009) vom 04.05.2026: Wertpapier nicht zugeordnet')
  await tasks.getByRole('button', { name: /^Erledigt: .*DELISTING/ }).click()
  await expect(tasks).not.toContainText('DELISTING')
  await expectNoOverflow(page)

  await tasks.getByRole('link', { name: /^Beheben: Kaufkosten fehlen/ }).click()
  await expect(page.getByRole('heading', { name: 'Buchung bearbeiten', level: 1 })).toBeVisible()
  // 3 Stück × 100,00 € = 300,00 € Anschaffungskosten
  await page.getByLabel(/Einstandskurs/).fill('100,00')
  await expect(page.getByText(/=\s300,00\s€\sAnschaffungskosten/)).toBeVisible()
  await page.getByRole('button', { name: 'Änderung speichern' }).click()
  await expect(page.getByText('Änderung gespeichert.')).toBeVisible()
  await page.goto('/app')
  // ohne Zwei-Faktor bleibt „Offene Punkte“ sichtbar – der behobene Punkt ist weg
  await expect(page.getByRole('region', { name: 'Offene Punkte' })).not.toContainText('Kaufkosten fehlen')
  expect(problems).toEqual([])
})

test('Kauf mit Kurs je Stück: Vorschau, Umschalten, Bearbeiten, Eingabeart bleibt', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')

  // Standard: Kurs je Stück; der Server rechnet Stück × Kurs (kaufmännisch gerundet)
  await pickEtf(page)
  await expect(page.getByRole('group', { name: 'Betrag eingeben als' }).getByRole('button', { name: 'Kurs je Stück', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Stück', { exact: true }).fill('15,399543')
  await page.getByLabel(/Kurs je Stück/).fill('97,41')
  await expect(page.getByText(/=\s1\.500,07\s€\sKurswert/)).toBeVisible()
  await page.getByLabel('Gebühren in €').fill('1,00')
  await expect(page.getByText(/Belastung gesamt/)).toBeVisible()
  await expect(page.getByText(/^1\.501,07\s€$/)).toBeVisible()
  await saveBooking(page)
  // Bestätigung an der Schaltfläche, Felder für die nächste Buchung leer
  await expect(page.getByRole('status').filter({ hasText: 'Buchung gespeichert.' })).toContainText(/Kauf · Vanguard.*1\.500,07\s€/)
  await expect(page.getByLabel('Stück', { exact: true })).toHaveValue('')
  const list = page.getByRole('region', { name: 'Buchungen' })
  await expect(list).toContainText('1.500,07')

  // Bearbeiten: vorbelegt mit genau dem Kurs, der den Betrag ergibt; Umschalten rechnet in den Gesamtbetrag um
  await list.getByRole('link', { name: /Kauf vom .* bearbeiten/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Buchung bearbeiten', level: 1 })).toBeVisible()
  await expect(page.getByLabel(/Kurs je Stück/)).toHaveValue('97,41')
  await amountMode(page, 'Gesamtbetrag')
  await expect(page.getByLabel(/Kurswert/)).toHaveValue('1.500,07')
  await expect(page.getByText(/Ø Kurs 97,41\s€ je Stück/)).toBeVisible()
  await expectNoOverflow(page)

  // die gewählte Eingabeart bleibt auf diesem Gerät
  await page.goto('/app/buchen')
  await expect(page.getByRole('group', { name: 'Betrag eingeben als' }).getByRole('button', { name: 'Gesamtbetrag' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel(/Kurswert/)).toBeVisible()
  expect(problems).toEqual([])
})

test('Kurs statt Kurswert: unter „Offene Punkte“ gemeldet und mit einem Klick behoben', async ({ page, isMobile }, testInfo) => {
  const problems = collectProblems(page)
  // eigener Tag je Projekt und Wiederholung, mehr als eine Woche auseinander:
  // Schlusskurse sind für alle Tests gemeinsam und zählen bis zu 6 Tage später
  const day = daysAgo(10 + (isMobile ? 10 : 0) + 40 * testInfo.retry)
  await register(page)
  const id = await createPortfolio(page, 'Depot')
  // 15 Stück, aber den Kurs eines Stücks als Gesamtbetrag eingetragen
  await buyEtf(page, '15', '128,45', { date: day })
  // Schlusskurs erst danach – sonst fragt schon das Speichern nach
  await addPriceClose('IE00BK5BQT80', day, 128_450_000)

  await page.goto('/app')
  const tasks = page.getByRole('region', { name: 'Offene Punkte' })
  await expect(tasks).toContainText('Kurs statt Kurswert? Vanguard')
  await expect(tasks).toContainText(/Kauf vom .*: -93,3\s%\szum Schlusskurs – Kurs je Stück eintragen/)
  await expectNoOverflow(page)
  await tasks.getByRole('link', { name: /^Beheben: Kurs statt Kurswert/ }).click()

  await expect(page.getByRole('heading', { name: 'Buchung bearbeiten', level: 1 })).toBeVisible()
  await expect(page.getByText(/entspricht etwa dem Kurs eines Stücks/)).toBeVisible()
  await page.getByRole('button', { name: 'Betrag als Kurs je Stück übernehmen' }).click()
  await expect(page.getByLabel(/Kurs je Stück/)).toHaveValue('128,45')
  await expect(page.getByText(/=\s1\.926,75\s€\sKurswert/)).toBeVisible()
  await page.getByRole('button', { name: 'Änderung speichern' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/depots/${id}`))
  await expect(page.getByText('Änderung gespeichert.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('1.926,75')

  await page.goto('/app')
  // ohne weitere offene Punkte fehlt der Abschnitt ganz (das Absichern steht unter „Erste Schritte“)
  await expect(page.getByRole('region', { name: 'Gesamtvermögen' })).toBeVisible()
  await expect(page.getByText(/Kurs statt Kurswert/)).toHaveCount(0)
  expect(problems).toEqual([])
})

test('Speichern fragt bei unplausiblem Kurs nach – „Kurs stimmt – trotzdem speichern“', async ({ page, isMobile }, testInfo) => {
  const problems = collectProblems(page)
  const day = daysAgo(100 + (isMobile ? 10 : 0) + 40 * testInfo.retry)
  await addPriceClose('IE00BK5BQT80', day, 128_450_000)
  await register(page)
  await createPortfolio(page, 'Depot')

  await pickEtf(page)
  await page.getByLabel('Datum').fill(day)
  await amountMode(page, 'Gesamtbetrag')
  await page.getByLabel('Stück', { exact: true }).fill('10')
  await page.getByLabel(/Kurswert/).fill('128,45')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()

  const confirm = page.getByLabel('Kurs stimmt – trotzdem speichern')
  await expect(confirm).toBeVisible()
  await expect(confirm).toBeFocused()
  await expect(page.getByText(/je Stück wären das nur 12,85\s€, der Schlusskurs am .* war 128,45\s€ \(-90,0\s%\)/)).toBeVisible()
  await expect(page.getByText('Buchung gespeichert.')).toHaveCount(0)
  // eingetragene Werte bleiben stehen
  await expect(page.getByLabel(/Kurswert/)).toHaveValue('128,45')
  await expectNoOverflow(page)

  await confirm.check()
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('128,45')

  // mit Kurs je Stück passt es ohne Rückfrage
  await buyEtfUnit(page, '2', '128,45', { date: day })
  expect(problems).toEqual([])
})

test('Darstellung: dunkel wählen – bleibt nach dem Neuladen, „Wie das Gerät“ nimmt es zurück', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await page.goto('/app/sicherheit')
  const group = page.getByRole('group', { name: 'Darstellung' })
  const saved = () => page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/app/sicherheit'))

  await Promise.all([saved(), group.getByRole('button', { name: 'Dunkel' }).click()])
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(group.getByRole('button', { name: 'Dunkel' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(19, 20, 22)')

  await Promise.all([saved(), group.getByRole('button', { name: 'Wie das Gerät' }).click()])
  await page.reload()
  expect(await page.locator('html').getAttribute('data-theme')).toBeNull()
  expect(problems).toEqual([])
})

import { expect, test, type Page } from '@playwright/test'
import { BITPANDA_CSV, GENERIC_CSV, TR_CSV_EXPORT, TR_KAUF_AT } from '../src/lib/import/fixtures'
import { makePdf } from '../src/test/pdf'
import { collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

/** Synthetische Dokumente – echte Abrechnungen kommen nie ins Repo. */
function upload(page: Page, name: string, mimeType: string, content: Uint8Array | string) {
  return page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer: Buffer.from(content) })
}

const review = (page: Page) => page.getByRole('table', { name: 'Erkannte Buchungen zum Prüfen' })

test('PDF: Trade-Republic-Kauf erkennen, prüfen, übernehmen – der zweite Import ist ein Duplikat', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  const pdf = makePdf(TR_KAUF_AT)

  await upload(page, 'abrechnung.pdf', 'application/pdf', pdf)
  await expect(review(page)).toContainText('Kauf · Vanguard FTSE All-World U.ETF')
  await expect(review(page)).toContainText('999,90')
  await expect(review(page)).toContainText('sicher erkannt')
  await expect(review(page)).toContainText('→ Vanguard FTSE All-World UCITS ETF USD Accumulation')
  await expectNoOverflow(page)
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto(`/app/depots/${id}`)
  await expect(page.getByRole('table', { name: /Positionen/ })).toContainText('Vanguard')

  await page.goto('/app/import')
  await upload(page, 'abrechnung.pdf', 'application/pdf', pdf)
  await expect(page.getByText(/schon einmal importiert/)).toBeVisible()
  await expect(review(page)).toContainText('schon importiert')
  await expect(page.getByRole('button', { name: '0 Buchungen übernehmen' })).toBeDisabled()
  expect(problems).toEqual([])
})

test('Importierte Buchungen eines Depots löschen – danach lässt sich die Datei neu importieren', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Trade Republic')
  const pdf = makePdf(TR_KAUF_AT)
  await page.goto('/app/import')
  await upload(page, 'abrechnung.pdf', 'application/pdf', pdf)
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto(`/app/depots/${id}`)
  const remove = page.getByRole('button', { name: 'Importierte Buchungen löschen' })
  await page.getByLabel('1 importierte Buchung löschen').fill('weg')
  await remove.click()
  await expect(page.getByText('Zum Bestätigen bitte „löschen“ eintippen.')).toBeVisible()
  await page.getByLabel('1 importierte Buchung löschen').fill('löschen')
  await remove.click()
  await expect(page.getByText(/Importierte Buchungen gelöscht/)).toBeVisible()
  await expect(page.getByText('Noch keine Buchungen.')).toBeVisible()
  await expectNoOverflow(page)

  await page.goto('/app/import')
  await upload(page, 'abrechnung.pdf', 'application/pdf', pdf)
  await expect(review(page)).toContainText('Kauf · Vanguard FTSE All-World U.ETF')
  await expect(page.getByText(/schon einmal importiert/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '1 Buchung übernehmen' })).toBeEnabled()
  expect(problems).toEqual([])
})

test('CSV: Bitpanda-Export – erkannte Coins und Gold übernehmen, unbekannte bleiben abgewählt', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Bitpanda', 'krypto')
  await page.goto('/app/import')
  await upload(page, 'bitpanda.csv', 'text/csv', BITPANDA_CSV)

  await expect(review(page)).toContainText('Kauf · BTC')
  await expect(review(page)).toContainText('nicht zugeordnet')
  await expect(page.getByText(/2 × übersprungen: Euro-Ein- und Auszahlungen/)).toBeVisible()
  await expect(page.getByRole('button', { name: '3 Buchungen übernehmen' })).toBeEnabled()
  await page.getByRole('button', { name: '3 Buchungen übernehmen' }).click()
  await expect(page.getByText(/3 Buchungen übernommen/)).toBeVisible()
})

test('CSV: Trade-Republic-Transaktionsexport – automatisch erkannt, Konto-Buchungen bleiben draußen', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'TR')
  await page.goto('/app/import')
  await upload(page, 'Transaktionsexport.csv', 'text/csv', TR_CSV_EXPORT)

  // keine Spaltenzuordnung nötig
  await expect(page.getByText(/Trade Republic · Transaktionsexport \(CSV\)/)).toBeVisible()
  await expect(page.getByText('Erste Zeile ist eine Kopfzeile')).toHaveCount(0)
  await expect(page.getByText(/3 × nicht übernommen: Ein-\/Auszahlungen, Karte und Überweisungen/)).toBeVisible()
  await expect(review(page)).toContainText('Kauf')
  await expect(review(page)).toContainText('Zinsen')
  await expect(review(page)).not.toContainText('Bäckerei')
  const save = page.getByRole('button', { name: /Buchungen? übernehmen$/ })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText(/übernommen/).first()).toBeVisible()
  expect(problems.filter((p) => !/status of 4\d\d/.test(p))).toEqual([])
})

test('Bestand würde negativ: betroffene Wertpapiere werden abgewählt, der Rest gespeichert', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'TR')
  await page.goto('/app/import')
  const head = TR_CSV_EXPORT.split('\n')[0]
  const row = (cells: string[]) => cells.map((c) => `"${c}"`).join(',')
  const csv = [
    head,
    row(['2026-02-02T09:00:00Z', '2026-02-02', 'DEFAULT', 'TRADING', 'BUY', 'FUND', 'FTSE All-World', 'IE00BK5BQT80', '2', '120.00', '-240.00', '-1.00', '', 'EUR', '', '', '', '', 'c1', '', '', '', '']),
    row(['2026-03-02T09:00:00Z', '2026-03-02', 'DEFAULT', 'TRADING', 'SELL', 'FUND', 'FTSE All-World', 'IE00BK5BQT80', '-5', '125.00', '625.00', '-1.00', '', 'EUR', '', '', '', '', 'c2', '', '', '', '']),
    row(['2026-04-01T00:10:00Z', '2026-04-01', 'DEFAULT', 'CASH', 'INTEREST_PAYMENT', '', '', '', '', '', '3.21', '', '-0.88', 'EUR', '', '', '', '', 'c3', '', '', '', '']),
  ].join('\n')
  await upload(page, 'Transaktionsexport.csv', 'text/csv', csv)
  await page.getByRole('button', { name: '3 Buchungen übernehmen' }).click()
  const result = page.getByText(/1 Buchung übernommen\. 2 Buchungen zu .* nicht übernommen: Der Bestand würde negativ/)
  await expect(result).toBeVisible()
  await expect(review(page)).toContainText('vermutlich fehlt ein Split oder Depotübertrag')
  await expect(page.getByText('0 von 2 ausgewählt')).toBeVisible()
})

test('Unbekannte Datei und Fremdformat werden abgewiesen', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Depot')
  await page.goto('/app/import')
  await upload(page, 'bild.png', 'image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  await expect(page.getByText('Nur PDF- und CSV-Dateien werden unterstützt.')).toBeVisible()
  await upload(page, 'andere-bank.pdf', 'application/pdf', makePdf(['Irgendeine Bank AG', 'Kontoauszug']))
  await expect(page.getByText(/wird \(noch\) nicht erkannt/)).toBeVisible()
})

test('CSV mit eigener Zuordnung: Spalten zuordnen, Zuordnung speichern, übernehmen', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Hausbank')
  await page.goto('/app/import')
  await upload(page, 'hausbank.csv', 'text/csv', GENERIC_CSV)

  await expect(page.getByText('Vorschau: 3 von 5 Zeilen erkannt.')).toBeVisible()
  await page.getByLabel('Zuordnung speichern als').fill('Hausbank')
  await page.getByRole('button', { name: 'Zuordnung speichern' }).click()
  await expect(page.getByText('Zuordnung „Hausbank“ gespeichert.')).toBeVisible()
  await page.getByRole('button', { name: 'Zeilen übernehmen' }).click()

  await expect(review(page)).toContainText('Verkauf · Vanguard FTSE All-World')
  // Die Dividende hat eine ISIN, die die Testkurse nicht kennen → bleibt zur Zuordnung abgewählt
  await expect(page.getByRole('button', { name: '2 Buchungen übernehmen' })).toBeEnabled()
  await page.getByRole('button', { name: '2 Buchungen übernehmen' }).click()
  await expect(page.getByText(/2 Buchungen übernommen/)).toBeVisible()

  // Gespeicherte Zuordnung steht beim nächsten Mal bereit
  await page.goto('/app/import')
  await upload(page, 'hausbank.csv', 'text/csv', GENERIC_CSV)
  await expect(page.getByRole('button', { name: 'Hausbank laden' })).toBeVisible()
})

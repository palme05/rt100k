/*
 * Offline-Seite: zeigt den zuletzt gespeicherten Stand (src/lib/offline.ts).
 * Nur textContent, keine HTML-Einfügung; Daten werden vor der Anzeige geprüft.
 * Privatsphäre-Modus (Taste P in der App) blendet Beträge auch hier aus.
 */
;(function () {
  var SNAPSHOT_CACHE = 'rt100k-letzter-stand'
  var SNAPSHOT_URL = '/__offline/letzter-stand'
  var MASK = '•••• €'
  var hidden = false
  try {
    hidden = window.localStorage.getItem('rt100k:privacy') === '1'
  } catch {
    hidden = false
  }

  var money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
  var stamp = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Vienna' })

  function eur(cents, signed) {
    if (hidden) return MASK
    var text = money.format(cents / 100)
    return signed && cents > 0 ? '+' + text : text
  }

  function isCents(n) {
    return typeof n === 'number' && Number.isSafeInteger(n)
  }

  function valid(s) {
    if (!s || s.v !== 1 || typeof s.savedAt !== 'string') return false
    if (!isCents(s.totalCents) || !isCents(s.investedCents) || !isCents(s.incomeCents)) return false
    if (!Array.isArray(s.slices) || s.slices.length > 8) return false
    for (var i = 0; i < s.slices.length; i++) {
      var x = s.slices[i]
      if (!x || typeof x.label !== 'string' || x.label.length > 40 || typeof x.share !== 'number' || !(x.share >= 0 && x.share <= 1)) return false
    }
    return true
  }

  function set(id, text) {
    var el = document.getElementById(id)
    if (el) el.textContent = text
  }

  function show(s) {
    var gain = s.totalCents - s.investedCents
    var saved = new Date(s.savedAt)
    set('stand-zeit', 'Gespeichert ' + (isNaN(saved.getTime()) ? '' : stamp.format(saved)) + (s.quotesAt ? ' · Kurse von ' + stamp.format(new Date(s.quotesAt)) : ''))
    set('gesamt', eur(s.totalCents))
    set('eingesetzt', eur(s.investedCents))
    set('gewinn', (gain < 0 ? '▼ ' : gain > 0 ? '▲ ' : '') + eur(gain, true))
    set('ertraege', eur(s.incomeCents))
    var list = document.getElementById('aufteilung')
    s.slices.forEach(function (x) {
      var li = document.createElement('li')
      var label = document.createElement('span')
      label.textContent = x.label
      var value = document.createElement('span')
      value.textContent = (x.share * 100).toFixed(1).replace('.', ',') + ' %'
      li.appendChild(label)
      li.appendChild(value)
      list.appendChild(li)
    })
    document.getElementById('stand').hidden = false
    document.getElementById('kein-stand').hidden = true
  }

  document.getElementById('neu').addEventListener('click', function () {
    window.location.reload()
  })
  window.addEventListener('online', function () {
    window.location.reload()
  })

  if (!('caches' in window)) return
  caches
    .open(SNAPSHOT_CACHE)
    .then(function (cache) {
      return cache.match(SNAPSHOT_URL)
    })
    .then(function (response) {
      return response ? response.json() : null
    })
    .then(function (snapshot) {
      if (valid(snapshot)) show(snapshot)
    })
    .catch(function () {})
})()

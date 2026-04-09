// AnkiLogic.js — Helper functions, SM-2 algorithm, file parsing
// Separated so Anki.jsx is small enough to upload on GitHub

export function cleanDeckId(val) {
  if (!val || val === 'none' || val === '') return null
  return val
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export function deckName(decks, deckId) {
  if (!deckId) return 'Unassigned'
  const d = decks.find(x => x.id === deckId)
  return d ? d.name : 'Unknown'
}

export function dueStatus(card) {
  const today = todayStr()
  if (!card.last_reviewed) return { label: 'New', color: 'var(--teal)' }
  if (!card.next_review_date || card.next_review_date <= today) return { label: 'Due', color: 'var(--coral)' }
  return { label: 'Later', color: 'var(--sage)' }
}

export function nextReviewLabel(card) {
  if (!card.last_reviewed) return { text: 'Not scheduled', cls: 'later' }
  const today = new Date(todayStr() + 'T00:00:00')
  const next = new Date((card.next_review_date || todayStr()) + 'T00:00:00')
  const diff = Math.ceil((next - today) / 86400000)
  if (diff <= 0) return { text: 'Due now', cls: 'due' }
  if (diff === 1) return { text: 'Tomorrow', cls: 'soon' }
  if (diff <= 7) return { text: `In ${diff} days`, cls: 'soon' }
  if (diff <= 30) return { text: `In ${Math.ceil(diff / 7)}w`, cls: 'mid' }
  return { text: `In ${Math.ceil(diff / 30)}mo`, cls: 'later' }
}

export function maturityLabel(card) {
  if (!card.last_reviewed) return 'New'
  if ((card.times_reviewed || 0) >= 5) return 'Mature'
  return 'Learning'
}

export function computeReview(outcome, card) {
  const ef = Number(card.ease_factor || 2.5)
  const intv = Number(card.interval_days || 0)
  const isFirst = intv === 0
  let newEf, newIntv
  switch (outcome) {
    case 'again':
      newEf = Math.max(1.3, ef - 0.2); newIntv = 1; break
    case 'hard':
      newEf = Math.max(1.3, ef - 0.15); newIntv = isFirst ? 3 : Math.max(2, Math.ceil(intv * 1.2)); break
    case 'good':
      newEf = ef; newIntv = isFirst ? 6 : Math.max(2, Math.ceil(intv * ef)); break
    case 'easy':
      newEf = ef + 0.15; newIntv = isFirst ? 10 : Math.max(2, Math.ceil(intv * ef * 1.3)); break
    default:
      newEf = ef; newIntv = intv
  }
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + newIntv)
  return {
    ease_factor: newEf,
    interval_days: newIntv,
    times_reviewed: (card.times_reviewed || 0) + 1,
    last_reviewed: todayStr(),
    next_review_date: nextDate.toISOString().split('T')[0],
  }
}

export async function parseApkg(file) {
  const JSZip = (await import('jszip')).default
  const initSqlJs = (await import('sql.js')).default
  const zip = await JSZip.loadAsync(file)
  let dbBuf = null
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    const f = zip.file(name)
    if (f) { dbBuf = await f.async('uint8array'); break }
  }
  if (!dbBuf) throw new Error('No Anki database found in .apkg file')
  const SQL = await initSqlJs({
    locateFile: () => 'https://sql.js.org/dist/sql-wasm.wasm'
  })
  const db = new SQL.Database(dbBuf)
  try {
    const result = db.exec('SELECT flds FROM notes')
    if (!result.length || !result[0].values.length) throw new Error('No notes found')
    const out = []
    for (const row of result[0].values) {
      const fields = String(row[0]).split('\x1f').map(f => f.trim())
      if (fields.length >= 2 && fields[0] && fields[1]) {
        out.push({ front: fields[0], back: fields[1] })
      }
    }
    return out
  } finally {
    db.close()
  }
}

export function parseCsvTsv(text, filename) {
  const sep = filename.endsWith('.tsv') ? '\t' : ','
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const first = parts[0].toLowerCase()
      if (i === 0 && (first === 'front' || first === 'question' || first === 'term' || first === 'card')) continue
      out.push({ front: parts[0], back: parts[1] })
    }
  }
  return out
}

export function parseTxt(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const out = []
  let curFront = null, curBack = null
  for (const line of lines) {
    if (line.includes('\t')) {
      const [f, ...rest] = line.split('\t')
      if (f.trim() && rest.join('\t').trim()) { out.push({ front: f.trim(), back: rest.join('\t').trim() }); curFront = curBack = null; continue }
    }
    const dashIdx = line.indexOf(' - ')
    if (dashIdx > 0) {
      const f = line.substring(0, dashIdx).trim(), b = line.substring(dashIdx + 3).trim()
      if (f && b) { out.push({ front: f, back: b }); curFront = curBack = null; continue }
    }
    const colonIdx = line.indexOf(': ')
    if (colonIdx > 0) {
      const f = line.substring(0, colonIdx).trim(), b = line.substring(colonIdx + 2).trim()
      if (f && b) { out.push({ front: f, back: b }); curFront = curBack = null; continue }
    }
    if (!line.trim()) { if (curFront && curBack) out.push({ front: curFront, back: curBack }); curFront = curBack = null; continue }
    if (!curFront) curFront = line.trim()
    else if (!curBack) curBack = line.trim()
  }
  if (curFront && curBack) out.push({ front: curFront, back: curBack })
  return out
}

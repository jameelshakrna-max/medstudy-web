import JSZip from 'jszip'
import initSqlJs from 'sql.js'

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<img[^>]*>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim()
}

function extractImgSrc(html) {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}

function processCloze(text, ord) {
  if (!text) return { front: '', back: '' }
  const clozeNum = ord + 1
  let clean = stripHtml(text)
  if (!clean.match(/\{\{c\d+::/)) return { front: clean, back: clean }
  const front = clean.replace(/\{\{c(\d+)::([^:}]+?)(?:::([^}]+))?\}\}/g, (m, num, hidden, hint) =>
    parseInt(num) === clozeNum ? (hint ? ' [' + hint + '] ' : ' [...] ') : ' ' + hidden + ' ')
  const back = clean.replace(/\{\{c(\d+)::([^:}]+?)(?:::([^}]+))?\}\}/g, (m, num, hidden, hint) =>
    parseInt(num) === clozeNum ? ' **' + hidden + '** ' : ' ' + hidden + ' ')
  const cs = s => s.replace(/,\s*,/g, ',').replace(/\s+,\s*/g, ', ').replace(/\.([A-Z])/g, '. $1')
    .replace(/\s+/g, ' ').replace(/\s\.\s/g, '. ').replace(/\.\s{2,}/g, '. ').trim()
  return { front: cs(front), back: cs(back) }
}

export async function parseApkg(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  let mediaMap = {}
  const mediaFile = zip.file('media')
  if (mediaFile) mediaMap = JSON.parse(await mediaFile.async('string'))

  const mediaUrls = {}
  for (const [num, filename] of Object.entries(mediaMap)) {
    const zf = zip.file(num)
    if (!zf) continue
    const ext = filename.split('.').pop().toLowerCase()
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' }
    const mime = mimeMap[ext] || 'image/png'
    try {
      const base64 = await zf.async('base64')
      mediaUrls[filename] = mime === 'image/svg+xml' ? 'data:image/svg+xml;base64,' + base64 : 'data:' + mime + ';base64,' + base64
    } catch {}
  }

  const dbFile = zip.file('collection.anki21b') || zip.file('collection.anki21') || zip.file('collection.anki2') || zip.file('collection.db')
  if (!dbFile) throw new Error('No database found in .apkg')

  const dbBuffer = await dbFile.async('arraybuffer')
  const SQL = await initSqlJs()
  const db = new SQL.Database(new Uint8Array(dbBuffer))

  const tableInfo = db.exec("PRAGMA table_info(notes)")
  const colNames = tableInfo.length ? tableInfo[0].values.map(r => r[1]) : []
  const fldsCol = colNames.includes('flds') ? 'flds' : colNames.includes('fields') ? 'fields' : null
  if (!fldsCol) { db.close(); throw new Error('No fields column found') }

  const hasMid = colNames.includes('mid')
  const noteMap = {}
  let noteResult
  if (hasMid) {
    noteResult = db.exec(`SELECT id, mid, ${fldsCol} FROM notes`)
    if (noteResult.length) { for (const row of noteResult[0].values) noteMap[row[0]] = { fields: row[2], mid: String(row[1]) } }
  } else {
    noteResult = db.exec(`SELECT id, ${fldsCol} FROM notes`)
    if (noteResult.length) { for (const row of noteResult[0].values) noteMap[row[0]] = { fields: row[1], mid: null } }
  }

  const modelTemplates = {}
  try {
    const colCols = db.exec("PRAGMA table_info(col)")
    const cols = colCols.length ? colCols[0].values.map(r => r[1]) : []
    const modelsCol = cols.includes('models') ? 'models' : null
    if (modelsCol) {
      const mr = db.exec(`SELECT ${modelsCol} FROM col LIMIT 1`)
      if (mr.length && mr[0].values[0]) {
        const models = JSON.parse(mr[0].values[0][0])
        for (const [mid, model] of Object.entries(models)) {
          if (model.tmpls && model.flds) {
            const fieldNames = model.flds.map(f => f.name.toLowerCase())
            modelTemplates[mid] = model.tmpls.map(t => ({ frontTemplate: t.qfmt || '', backTemplate: t.afmt || '', fieldNames }))
          }
        }
      }
    }
  } catch {}

  try {
    const ntInfo = db.exec("PRAGMA table_info(notetypes)")
    if (ntInfo.length) {
      const ntCols = ntInfo[0].values.map(r => r[1])
      if (ntCols.includes('flds') && ntCols.includes('tmpls')) {
        const nr = db.exec('SELECT id, flds, tmpls FROM notetypes')
        if (nr.length) {
          for (const row of nr[0].values) {
            try {
              const fields = JSON.parse(row[1]), tmpls = JSON.parse(row[2])
              const fieldNames = fields.map(f => f.name.toLowerCase())
              modelTemplates[String(row[0])] = tmpls.map(t => ({ frontTemplate: t.qfmt || '', backTemplate: t.afmt || '', fieldNames }))
            } catch {}
          }
        }
      }
    }
  } catch {}

  const cardResult = db.exec(`SELECT id, nid, did, ord FROM cards`)
  const cards = []
  if (cardResult.length) {
    for (const row of cardResult[0].values) {
      const nid = row[1], ord = row[3] || 0
      const note = noteMap[nid]
      if (!note || !note.fields) continue
      const fieldParts = String(note.fields).split('\x1f')
      if (fieldParts.length < 1) continue
      const mainField = fieldParts[0]
      const isCloze = !!mainField.match(/\{\{c\d+::/)
      let frontText = '', backText = '', imageUrl = null
      if (isCloze) {
        const cr = processCloze(mainField, ord)
        frontText = cr.front; backText = cr.back
        if (fieldParts.length > 1) {
          const extra = fieldParts.slice(1).map(f => stripHtml(f)).filter(f => f && f.length > 0 && !f.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) && !f.match(/^Watch associated/i)).join('\n')
          if (extra) backText += '\n' + extra
        }
        for (const fp of fieldParts) { const img = extractImgSrc(fp); if (img && mediaUrls[img]) { imageUrl = mediaUrls[img]; break } }
      } else {
        if (fieldParts.length < 2) continue
        let frontHtml = fieldParts[0], backHtml = fieldParts.length === 2 ? fieldParts[1] : fieldParts.slice(1).join('<br>')
        const mid = note.mid
        if (mid && modelTemplates[mid] && modelTemplates[mid][ord]) {
          const t = modelTemplates[mid][ord], names = t.fieldNames
          if (names.length >= 2 && t.frontTemplate.includes(names[1]) && !t.frontTemplate.includes(names[0])) {
            frontHtml = fieldParts[1] || fieldParts[0]; backHtml = fieldParts[0] || fieldParts[1]
            if (fieldParts.length > 2) backHtml = fieldParts[0] + '<br>' + fieldParts.slice(2).join('<br>')
          }
        }
        frontText = stripHtml(frontHtml)
        backText = stripHtml(backHtml).split(/\n|<br>/).map(l => l.trim()).filter(l => !l.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).join('\n')
        const fi = extractImgSrc(frontHtml) || extractImgSrc(backHtml)
        if (fi && mediaUrls[fi]) imageUrl = mediaUrls[fi]
      }
      cards.push({ front: frontText, back: backText, image_url: imageUrl })
    }
  }
  db.close()
  return cards
}

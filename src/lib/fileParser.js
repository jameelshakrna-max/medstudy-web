/**
 * lib/fileParser.js
 * Parses .apkg, .colpkg, .csv, .tsv, .txt files into flashcard arrays.
 * .apkg files extract images from media and return base64 data URLs.
 * Reads Anki model templates to correctly identify front/back fields.
 */

import JSZip from 'jszip'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

/* ── helpers ────────────────────────────────────────────── */

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<img[^>]*>/gi, '')          // remove img tags from text
    .replace(/<[^>]+>/g, '')               // strip all HTML tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
}

/**
 * Extract the first <img> src from HTML content
 * Returns the filename referenced in the src attribute
 */
function extractImgSrc(html) {
  if (!html) return null
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : null
}

/**
 * Resize a Blob/Binary data to a base64 data URL
 * Works in the browser using Canvas
 */
function resizeBlobToDataUrl(blob, maxWidth = 800, maxHeight = 600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width))
        width = maxWidth
      }
      if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height))
        height = maxHeight
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/webp', quality)
      URL.revokeObjectURL(url)
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

/**
 * Convert a base64 string to a Blob
 */
function base64ToBlob(base64, mime = 'application/octet-stream') {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

/* ── .apkg parser ──────────────────────────────────────── */

async function parseApkg(file, onProgress) {
  onProgress?.('Extracting .apkg archive...')
  const zip = await JSZip.loadAsync(file)

  // Read the media mapping (number → filename)
  let mediaMap = {}
  const mediaFile = zip.file('media')
  if (mediaFile) {
    const mediaJson = await mediaFile.async('string')
    mediaMap = JSON.parse(mediaJson)
  }

  // Extract and resize media files
  onProgress?.('Processing images...')
  const mediaUrls = {}  // filename → base64 data URL
  const mediaEntries = Object.entries(mediaMap)
  let processed = 0

  for (const [num, filename] of mediaEntries) {
    const zippedFile = zip.file(num)
    if (!zippedFile) continue

    // Determine MIME type from extension
    const ext = filename.split('.').pop().toLowerCase()
    const mimeMap = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      svg: 'image/svg+xml', avif: 'image/avif'
    }
    const mime = mimeMap[ext] || 'image/png'

    try {
      const base64 = await zippedFile.async('base64')
      const blob = base64ToBlob(base64, mime)

      // Only resize raster images (skip SVG)
      if (mime !== 'image/svg+xml') {
        mediaUrls[filename] = await resizeBlobToDataUrl(blob)
      } else {
        mediaUrls[filename] = 'data:image/svg+xml;base64,' + base64
      }
    } catch (e) {
      console.warn('Skipping media file:', filename, e.message)
    }

    processed++
    if (processed % 10 === 0) {
      onProgress?.(`Processing images... ${processed}/${mediaEntries.length}`)
    }
  }

  // Read the SQLite database
  // Try all known Anki database file names (newest first)
  onProgress?.('Reading cards...')
  const dbFile =
    zip.file('collection.anki21b') ||  // Anki 23.10+
    zip.file('collection.anki21')  ||  // Anki 2.1.45+
    zip.file('collection.anki2')   ||  // Anki 2.0/2.1 early
    zip.file('collection.db')           // very old or alternative exports

  if (!dbFile) {
    const files = Object.keys(zip.files).join(', ')
    throw new Error('Invalid .apkg file: no database found. Files in archive: ' + files)
  }

  const dbBuffer = await dbFile.async('arraybuffer')

  // Use sql.js to read the SQLite database (Vite serves WASM as URL asset)
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl
  })
  const db = new SQL.Database(new Uint8Array(dbBuffer))

  // Discover the actual column names in the notes table
  const tableInfo = db.exec("PRAGMA table_info(notes)")
  const colNames = tableInfo.length ? tableInfo[0].values.map(r => r[1]) : []

  // Find the fields column (Anki versions use different names)
  const fldsCol = colNames.includes('flds') ? 'flds'
    : colNames.includes('fields') ? 'fields'
    : null

  if (!fldsCol) {
    db.close()
    throw new Error('Could not find fields column in notes table. Columns: ' + colNames.join(', '))
  }

  // Check if notes table has mid (model id) column
  const hasMid = colNames.includes('mid')

  // Read model (template) info to determine field names
  // This tells us which field is "front" vs "back"
  let modelFieldNames = {}  // mid → array of field names like ["Front", "Back", "Extra"]
  try {
    // Anki stores models as JSON in the col table
    const colTableInfo = db.exec("PRAGMA table_info(col)")
    const colCols = colTableInfo.length ? colTableInfo[0].values.map(r => r[1]) : []
    const modelsCol = colCols.includes('models') ? 'models'
      : colCols.includes('decks') ? 'decks'  // fallback
      : null

    if (modelsCol) {
      const modelsResult = db.exec(`SELECT ${modelsCol} FROM col LIMIT 1`)
      if (modelsResult.length && modelsResult[0].values[0]) {
        const models = JSON.parse(modelsResult[0].values[0][0])
        for (const [mid, model] of Object.entries(models)) {
          if (model.flds) {
            modelFieldNames[mid] = model.flds.map(f => f.name)
          }
        }
      }
    }
  } catch (e) {
    // If we can't read models, we'll use position-based field assignment
  }

  // Also try notetypes table (newer Anki versions)
  try {
    const ntInfo = db.exec("PRAGMA table_info(notetypes)")
    if (ntInfo.length) {
      const ntResult = db.exec('SELECT id, flds FROM notetypes')
      if (ntResult.length) {
        for (const row of ntResult[0].values) {
          try {
            const fields = JSON.parse(row[1])
            modelFieldNames[row[0]] = fields.map(f => f.name)
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  // Query notes with their mid (model id) for field name lookup
  const noteMap = {}  // nid → { fields, mid }
  let noteResult
  if (hasMid) {
    noteResult = db.exec(`SELECT id, mid, ${fldsCol} FROM notes`)
    if (noteResult.length) {
      for (const row of noteResult[0].values) {
        noteMap[row[0]] = { fields: row[2], mid: String(row[1]) }
      }
    }
  } else {
    noteResult = db.exec(`SELECT id, ${fldsCol} FROM notes`)
    if (noteResult.length) {
      for (const row of noteResult[0].values) {
        noteMap[row[0]] = { fields: row[1], mid: null }
      }
    }
  }

  // Query cards (link notes to decks)
  const cardRows = []
  const cardResult = db.exec(
    `SELECT id, nid, did FROM cards`
  )
  if (cardResult.length) {
    for (const row of cardResult[0].values) {
      const note = noteMap[row[1]]
      if (note) {
        cardRows.push({ id: row[0], nid: row[1], did: row[2], fields: note.fields, mid: note.mid })
      }
    }
  }

  db.close()

  // Parse cards into front/back + image
  onProgress?.(`Found ${cardRows.length} cards`)
  const result = []

  for (const card of cardRows) {
    const fieldParts = card.fields.split('\x1f')  // Anki uses \x1f as field separator
    if (fieldParts.length < 2) continue

    // Determine front and back based on field names from the model
    let frontIdx = 0
    let backIdx = 1

    if (card.mid && modelFieldNames[card.mid]) {
      const names = modelFieldNames[card.mid]
      const lowerNames = names.map(n => n.toLowerCase().trim())
      // Look for common front field names
      const frontHint = lowerNames.findIndex(n =>
        n === 'front' || n === 'question' || n === 'q' || n === 'term' || n === 'word' || n === 'prompt'
      )
      // Look for common back field names
      const backHint = lowerNames.findIndex(n =>
        n === 'back' || n === 'answer' || n === 'a' || n === 'definition' || n === 'meaning' || n === 'response'
      )
      if (frontHint >= 0) frontIdx = frontHint
      if (backHint >= 0) backIdx = backHint
      // If only front found, back = everything else
      if (frontHint >= 0 && backHint < 0) backIdx = -1
    }

    const frontHtml = fieldParts[frontIdx] || fieldParts[0]
    // Back is either the detected back field, or everything except front joined
    const backHtml = backIdx >= 0
      ? (fieldParts[backIdx] || fieldParts.slice(1).join('<br>'))
      : fieldParts.filter((_, i) => i !== frontIdx).join('<br>')

    // Check for images in front or back
    let imageUrl = null
    const frontImgName = extractImgSrc(frontHtml)
    const backImgName = extractImgSrc(backHtml)
    const imgName = frontImgName || backImgName

    if (imgName && mediaUrls[imgName]) {
      imageUrl = mediaUrls[imgName]
    }

    // Also check for images stored with full media path
    if (!imageUrl) {
      for (const [name, url] of Object.entries(mediaUrls)) {
        if (frontHtml.includes(name) || backHtml.includes(name)) {
          imageUrl = url
          break
        }
      }
    }

    result.push({
      front: stripHtml(frontHtml),
      back: stripHtml(backHtml),
      image_url: imageUrl
    })
  }

  return result
}

/* ── text-based parsers ─────────────────────────────────── */

function parseCsv(text, delimiter = ',') {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const cards = []

  for (const line of lines) {
    let parts
    if (delimiter === '\t') {
      parts = line.split('\t')
    } else {
      parts = []
      let current = ''
      let inQuotes = false
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue }
        if (ch === delimiter && !inQuotes) { parts.push(current); current = ''; continue }
        current += ch
      }
      parts.push(current)
    }

    if (parts.length >= 2) {
      cards.push({
        front: parts[0].trim(),
        back: parts.slice(1).join(' / ').trim(),
        image_url: null
      })
    }
  }
  return cards
}

function parseTxt(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []

  const firstLine = lines[0]
  if (firstLine.includes('\t')) return parseCsv(text, '\t')
  if (firstLine.includes(';')) return parseCsv(text, ';')
  return parseCsv(text, ',')
}

/* ── main export ────────────────────────────────────────── */

/**
 * Parse a file into an array of flashcard objects.
 * @param {File} file - The file to parse
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Array<{front: string, back: string, image_url: string|null}>>}
 */
export async function parseFile(file, onProgress) {
  const name = file.name.toLowerCase()

  if (name.endsWith('.apkg') || name.endsWith('.colpkg')) {
    return parseApkg(file, onProgress)
  }

  if (name.endsWith('.csv')) {
    const text = await file.text()
    return parseCsv(text, ',')
  }

  if (name.endsWith('.tsv')) {
    const text = await file.text()
    return parseCsv(text, '\t')
  }

  if (name.endsWith('.txt')) {
    const text = await file.text()
    return parseTxt(text)
  }

  throw new Error('Unsupported file type. Use .apkg, .colpkg, .csv, .tsv, or .txt')
}

/**
 * lib/fileParser.js
 * Parses .apkg, .colpkg, .csv, .tsv, .txt files into flashcard arrays.
 * .apkg files extract images from media and return base64 data URLs.
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

  // Query notes to get field data
  const noteResult = db.exec(`SELECT id, ${fldsCol} FROM notes`)
  const noteMap = {}  // nid → field string
  if (noteResult.length) {
    for (const row of noteResult[0].values) {
      noteMap[row[0]] = row[1]
    }
  }

  // Query cards (link notes to decks)
  const cardResult = db.exec(`SELECT id, nid, did FROM cards`)
  const result = []

  if (cardResult.length) {
    for (const row of cardResult[0].values) {
      const nid = row[1]
      const fields = noteMap[nid]
      if (!fields) continue

      // Split fields by Anki's field separator \x1f
      const fieldParts = String(fields).split('\x1f')
      if (fieldParts.length < 2) continue

      // SIMPLE RULE: In Anki, the FIRST field is always the front,
      // the SECOND field is always the back.
      // This is how Anki templates work — {{Front}} = field 0, {{Back}} = field 1
      // Any extra fields (Extra, Notes, etc.) are joined to the back
      const frontHtml = fieldParts[0]
      const backHtml = fieldParts.length === 2
        ? fieldParts[1]
        : fieldParts.slice(1).join('<br>')

      // Check for images in front or back HTML
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
  }

  db.close()
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

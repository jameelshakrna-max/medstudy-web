/**
 * lib/fileParser.js
 * Parses .apkg, .csv, .tsv, .txt files into flashcard arrays.
 * .apkg files extract images from media and return base64 data URLs.
 */

import JSZip from 'jszip'

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
        // SVG: convert to data URL directly
        const svgText = await zippedFile.async('text')
        mediaUrls[filename] = 'data:image/svg+xml;base64,' + base64
      }
    } catch (e) {
      // Skip files that fail to process
      console.warn('Skipping media file:', filename, e.message)
    }

    processed++
    if (processed % 10 === 0) {
      onProgress?.(`Processing images... ${processed}/${mediaEntries.length}`)
    }
  }

  // Read the SQLite database
  onProgress?.('Reading cards...')
  const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21')
  if (!dbFile) {
    throw new Error('Invalid .apkg file: no database found')
  }

  const dbBuffer = await dbFile.async('arraybuffer')

  // Use sql.js to read the SQLite database (load WASM from CDN to avoid Vite bundling issues)
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({
    locateFile: file => `/${file}`
  })
  const db = new SQL.Database(new Uint8Array(dbBuffer))

  // Query notes (front/back content)
  const notes = {}
  const noteResult = db.exec('SELECT id, fields FROM notes')
  if (noteResult.length) {
    for (const row of noteResult[0].values) {
      notes[row[0]] = row[1]
    }
  }

  // Query cards (link notes to decks)
  const cards = []
  const cardResult = db.exec(
    'SELECT c.id, c.nid, c.did, n.fields FROM cards c JOIN notes n ON c.nid = n.id'
  )
  if (cardResult.length) {
    for (const row of cardResult[0].values) {
      cards.push({ id: row[0], nid: row[1], did: row[2], fields: row[3] })
    }
  }

  db.close()

  // Parse cards into front/back + image
  onProgress?.(`Found ${cards.length} cards`)
  const result = []

  for (const card of cards) {
    const fieldParts = card.fields.split('\x1f')  // Anki uses \x1f as field separator
    if (fieldParts.length < 2) continue

    const frontHtml = fieldParts[0]
    const backHtml = fieldParts.slice(1).join('<br>')

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
    // Simple split (doesn't handle quoted fields with delimiters inside)
    // For production, use a proper CSV parser, but this works for most flashcard exports
    let parts
    if (delimiter === '\t') {
      parts = line.split('\t')
    } else {
      // Handle basic quoting
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
  // Try tab-separated first, then comma, then semicolon
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

  if (name.endsWith('.apkg')) {
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

  throw new Error('Unsupported file type. Use .apkg, .csv, .tsv, or .txt')
}

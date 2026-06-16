/**
 * lib/fileParser.js
 * Parses .apkg, .colpkg, .csv, .tsv, .txt files into flashcard arrays.
 * .apkg files extract images from media and return base64 data URLs.
 */

import JSZip from 'jszip'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

/* ── helpers ────────────────────────────────────────────── */

/**
 * Process cloze deletions for a card.
 * Cloze syntax: {{c1::hidden text}} or {{c1::hidden text::hint}}
 * For the card with ord=N (0-based), c(N+1) cloze is the answer.
 * Front: replace {{cN::text}} with [...] and keep other clozes visible
 * Back: reveal the {{cN::text}} cloze, keep others as [...]
 */
function processCloze(text, ord) {
  if (!text) return { front: '', back: '' }
  const clozeNum = ord + 1  // ord 0 = c1, ord 1 = c2, etc.

  // First strip HTML
  let clean = stripHtml(text)

  // Check if this text actually has cloze deletions
  if (!clean.match(/\{\{c\d+::/)) {
    return { front: clean, back: clean }
  }

  // Build front: replace THIS card's cloze with [...], reveal other clozes
  let front = clean.replace(
    /\{\{c(\d+)::([^:}]+?)(?:::([^}]+))?\}\}/g,
    (match, num, hidden, hint) => {
      if (parseInt(num) === clozeNum) {
        return hint ? ' [' + hint + '] ' : ' [...] '
      } else {
        return ' ' + hidden + ' '  // reveal other clozes with spacing
      }
    }
  )

  // Build back: reveal THIS card's cloze, replace others with [...]
  let back = clean.replace(
    /\{\{c(\d+)::([^:}]+?)(?:::([^}]+))?\}\}/g,
    (match, num, hidden, hint) => {
      if (parseInt(num) === clozeNum) {
        return ' ' + hidden + ' '  // reveal the answer with spacing
      } else {
        return hint ? ' [' + hint + '] ' : ' [...] '
      }
    }
  )

  // Clean up spacing
  const cleanSpacing = s => s
    .replace(/\s+/g, ' ')           // collapse multiple spaces
    .replace(/\s,\s/g, ', ')        // fix comma spacing
    .replace(/\s\.\s/g, '. ')       // fix period spacing
    .replace(/\.\s{2,}/g, '. ')     // fix double spaces after periods
    .replace(/\s+$/g, '')           // trim trailing spaces
    .replace(/^\s+/g, '')           // trim leading spaces

  return { front: cleanSpacing(front), back: cleanSpacing(back) }
}

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

  // Query notes to get field data and model id
  const hasMid = colNames.includes('mid')
  let noteResult
  const noteMap = {}  // nid → { fields, mid }
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

  // Read model (template) info to handle reversed cards
  // The models tell us which card templates exist and which field each template shows on front
  const modelTemplates = {}  // mid → [{ front: fieldIdx, back: fieldIdx }, ...]
  try {
    const colTableInfo = db.exec("PRAGMA table_info(col)")
    const colCols = colTableInfo.length ? colTableInfo[0].values.map(r => r[1]) : []
    const modelsCol = colCols.includes('models') ? 'models' : null

    if (modelsCol) {
      const modelsResult = db.exec(`SELECT ${modelsCol} FROM col LIMIT 1`)
      if (modelsResult.length && modelsResult[0].values[0]) {
        const models = JSON.parse(modelsResult[0].values[0][0])
        for (const [mid, model] of Object.entries(models)) {
          if (model.tmpls && model.flds) {
            // Get field names to find their indices
            const fieldNames = model.flds.map(f => f.name.toLowerCase())
            modelTemplates[mid] = model.tmpls.map(tmpl => {
              // Parse the template's front and back to find which fields are used
              const frontTmpl = tmpl.qfmt || ''
              const backTmpl = tmpl.afmt || ''
              return {
                frontTemplate: frontTmpl,
                backTemplate: backTmpl,
                fieldNames: fieldNames
              }
            })
          }
        }
      }
    }
  } catch (e) {
    // If we can't read models, we'll use default field order
  }

  // Also try notetypes table (newer Anki versions)
  try {
    const ntInfo = db.exec("PRAGMA table_info(notetypes)")
    if (ntInfo.length) {
      const ntCols = ntInfo.length ? ntInfo[0].values.map(r => r[1]) : []
      const hasNtFlds = ntCols.includes('flds')
      const hasNtTmpls = ntCols.includes('tmpls')
      if (hasNtFlds && hasNtTmpls) {
        const ntResult = db.exec('SELECT id, flds, tmpls FROM notetypes')
        if (ntResult.length) {
          for (const row of ntResult[0].values) {
            try {
              const fields = JSON.parse(row[1])
              const tmpls = JSON.parse(row[2])
              const fieldNames = fields.map(f => f.name.toLowerCase())
              modelTemplates[String(row[0])] = tmpls.map(tmpl => ({
                frontTemplate: tmpl.qfmt || '',
                backTemplate: tmpl.afmt || '',
                fieldNames: fieldNames
              }))
            } catch (e) {}
          }
        }
      }
    }
  } catch (e) {}

  // Query cards with ord (template ordinal — 0=forward, 1=reversed, etc.)
  const cardResult = db.exec(`SELECT id, nid, did, ord FROM cards`)
  const result = []

  if (cardResult.length) {
    for (const row of cardResult[0].values) {
      const nid = row[1]
      const ord = row[3] || 0  // card ordinal (0=first template, 1=second, etc.)
      const note = noteMap[nid]
      if (!note) continue

      const fields = note.fields
      if (!fields) continue

      // Split fields by Anki's field separator \x1f
      const fieldParts = String(fields).split('\x1f')
      if (fieldParts.length < 1) continue

      // Check if this is a cloze note (contains {{c1:: etc.)
      const mainField = fieldParts[0]
      const isCloze = mainField.match(/\{\{c\d+::/)

      let frontText = ''
      let backText = ''
      let imageUrl = null

      if (isCloze) {
        // CLOZE CARD: process {{c1::text}} syntax
        const clozeResult = processCloze(mainField, ord)
        frontText = clozeResult.front
        // Back = full revealed text + any extra fields
        backText = clozeResult.back
        if (fieldParts.length > 1) {
          // Extra fields (like "Extra" or "Notes") go in the back
          const extra = fieldParts.slice(1)
            .map(f => stripHtml(f))
            .filter(f => {
              if (!f || f.length === 0) return false
              // Skip UUIDs
              if (f.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) return false
              // Skip video link metadata
              if (f.match(/^Watch associated/i)) return false
              return true
            })
            .join('\n')
          if (extra) backText += '\n' + extra
        }

        // Check for images in any field
        for (const fp of fieldParts) {
          const imgName = extractImgSrc(fp)
          if (imgName && mediaUrls[imgName]) {
            imageUrl = mediaUrls[imgName]
            break
          }
        }
      } else {
        // BASIC CARD: field[0] = front, field[1] = back
        if (fieldParts.length < 2) continue

        let frontHtml = fieldParts[0]
        let backHtml = fieldParts.length === 2
          ? fieldParts[1]
          : fieldParts.slice(1).join('<br>')

        // If we have template info, check if this is a reversed card
        const mid = note.mid
        if (mid && modelTemplates[mid] && modelTemplates[mid][ord]) {
          const tmpl = modelTemplates[mid][ord]
          const frontTmpl = tmpl.frontTemplate
          const fieldNames = tmpl.fieldNames

          if (fieldNames.length >= 2) {
            const frontUsesFirst = frontTmpl.includes('{{' + fieldNames[0]) || frontTmpl.includes('{{Front')
            const frontUsesSecond = frontTmpl.includes('{{' + fieldNames[1]) || frontTmpl.includes('{{Back')

            if (frontUsesSecond && !frontUsesFirst) {
              // Reversed card — swap front and back
              frontHtml = fieldParts[1] || fieldParts[0]
              backHtml = fieldParts[0] || fieldParts[1]
              if (fieldParts.length > 2) {
                backHtml = fieldParts[0] + '<br>' + fieldParts.slice(2).join('<br>')
              }
            }
          }
        }

        frontText = stripHtml(frontHtml)
        // Filter out UUIDs and video link metadata from back
        backText = stripHtml(backHtml)
          .split(/\n|<br>/)
          .map(line => line.trim())
          .filter(line => {
            // Skip UUIDs
            if (line.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) return false
            return true
          })
          .join('\n')

        // Extract images ONLY from <img> src attributes (strict matching)
        const frontImgName = extractImgSrc(frontHtml)
        const backImgName = extractImgSrc(backHtml)

        if (frontImgName && mediaUrls[frontImgName]) {
          imageUrl = mediaUrls[frontImgName]
        } else if (backImgName && mediaUrls[backImgName]) {
          imageUrl = mediaUrls[backImgName]
        }
      }

      result.push({
        front: frontText,
        back: backText,
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

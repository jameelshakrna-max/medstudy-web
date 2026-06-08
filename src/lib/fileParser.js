import Papa from "papaparse"

function looksLikeHeader(row) {
  var lower = row.map(function(r) { return String(r).toLowerCase() }).join(" ")
  return lower.includes("question") || lower.includes("answer") || lower.includes("front") || lower.includes("back") || lower.includes("term") || lower.includes("definition")
}

export async function parseFile(file, onProgress) {
  var name = file.name.toLowerCase()
  var ext = name.split(".").pop()

  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    if (onProgress) onProgress("Parsing text file...")
    return parseTextFile(file)
  }
  if (ext === "apkg") {
    if (onProgress) onProgress("Extracting Anki package...")
    return parseApkg(file, onProgress)
  }
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "bmp" || ext === "webp") {
    if (onProgress) onProgress("Preparing OCR...")
    return parseImage(file, onProgress)
  }
  throw new Error("Unsupported file type: ." + ext)
}

function parseTextFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader()
    reader.onload = function(e) {
      var text = e.target.result
      var content = text
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

      var firstLine = content.split("\n")[0] || ""
      var tabCount = (firstLine.match(/\t/g) || []).length
      var commaCount = (firstLine.match(/,/g) || []).length
      var semiCount = (firstLine.match(/;/g) || []).length
      var pipeCount = (firstLine.match(/\|/g) || []).length
      var maxCount = Math.max(tabCount, commaCount, semiCount, pipeCount)
      var delimiter = ","

      var cards = []

      if (maxCount > 0) {
        if (tabCount === maxCount) delimiter = "\t"
        else if (semiCount === maxCount) delimiter = ";"
        else if (pipeCount === maxCount) delimiter = "|"
        var result = Papa.parse(content, { delimiter: delimiter, header: false, skipEmptyLines: true, quotes: true })
        var rows = result.data
        var startIdx = 0
        if (rows.length > 1 && looksLikeHeader(rows[0])) startIdx = 1
        for (var i = startIdx; i < rows.length; i++) {
          var row = rows[i]
          if (row.length >= 2 && String(row[0]).trim() && String(row[1]).trim()) {
            cards.push({ front: String(row[0]).trim(), back: String(row[1]).trim() })
          }
        }
      } else {
        var lines = content.split("\n").map(function(l) { return l.trim() }).filter(function(l) { return l.length > 0 })
        for (var j = 0; j < lines.length - 1; j += 2) {
          cards.push({ front: lines[j], back: lines[j + 1] })
        }
      }

      if (cards.length === 0) {
        reject(new Error("No card pairs found. Use format: question, answer per line"))
      } else {
        resolve(cards)
      }
    }
    reader.onerror = function() { reject(new Error("Failed to read file")) }
    reader.readAsText(file, "UTF-8")
  })
}

async function parseApkg(file, onProgress) {
  var fflate = await import("fflate")
  var initSqlJs = (await import("sql.js")).default

  if (onProgress) onProgress("Reading file...")
  var buffer = await file.arrayBuffer()
  var uint8 = new Uint8Array(buffer)

  if (onProgress) onProgress("Extracting ZIP archive...")
  var zip
  try {
    zip = fflate.unzipSync(uint8)
  } catch (e) {
    throw new Error("Invalid APKG file: cannot extract ZIP")
  }

  var dbKeys = ["collection.anki21", "collection.anki21b", "collection.anki20", "collection.anki2"]
  var dbBuffer = null
  for (var k = 0; k < dbKeys.length; k++) {
    if (zip[dbKeys[k]]) { dbBuffer = zip[dbKeys[k]]; break }
  }
  if (!dbBuffer) {
    var zipKeys = Object.keys(zip)
    for (var z = 0; z < zipKeys.length; z++) {
      if (zipKeys[z].startsWith("collection")) { dbBuffer = zip[zipKeys[z]]; break }
    }
  }
  if (!dbBuffer) throw new Error("Invalid APKG: no database found inside")

  if (onProgress) onProgress("Loading database engine...")
  var SQL = await initSqlJs({ locateFile: function(f) { if (f.indexOf("sql-wasm") === 0) return "/sql-wasm.wasm"; return f } })

  if (onProgress) onProgress("Reading flashcards...")
  var db = new SQL.Database(dbBuffer)

  try {
    var noteResult
    try { noteResult = db.exec("SELECT flds FROM notes") }
    catch (e2) { throw new Error("Cannot read notes: " + e2.message) }

    if (!noteResult.length) throw new Error("APKG has no notes")

    var rows = noteResult[0].values
    var notes = []
    for (var i = 0; i < rows.length; i++) {
      var fieldsStr = rows[i][0]
      if (!fieldsStr) continue
      var fields = String(fieldsStr).split("\x1f")
      if (fields.length >= 2) {
        var front = stripHtml(fields[0]).trim()
        var back = stripHtml(fields[1]).trim()
        if (front && back) notes.push({ front: front, back: back })
      }
    }

    if (notes.length === 0) throw new Error("APKG has notes but no valid pairs")
    if (onProgress) onProgress("Found " + notes.length + " cards")
    return notes
  } finally {
    db.close()
  }
}

async function parseImage(file, onProgress) {
  var Tesseract = await import("tesseract.js")

  if (onProgress) onProgress("Loading OCR engine (first time may take 30s)...")
  var worker = await Tesseract.createWorker(["eng", "ara"], 1, {
    logger: function(m) {
      if (onProgress && m.status) {
        var pct = m.progress ? Math.round(m.progress * 100) : 0
        onProgress("Recognizing text... " + pct + "%")
      }
    }
  })

  try {
    if (onProgress) onProgress("Scanning image...")
    var result = await worker.recognize(file)
    var text = result.data.text.trim()

    if (!text) throw new Error("No text detected in image. Try a clearer image with printed text.")

    var lines = text.split(/\n/).map(function(l) { return l.trim() }).filter(function(l) { return l.length > 0 })
    var cards = []

    for (var i = 0; i < lines.length - 1; i += 2) {
      cards.push({ front: lines[i], back: lines[i + 1] })
    }

    if (cards.length === 0) {
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j]
        var seps = ["\t", " - ", "; ", "| ", ": ", " = "]
        for (var si = 0; si < seps.length; si++) {
          if (line.includes(seps[si])) {
            var parts = line.split(seps[si])
            if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
              cards.push({ front: parts[0].trim(), back: parts.slice(1).join(seps[si]).trim() })
              break
            }
          }
        }
      }
    }

    if (cards.length === 0) {
      if (lines.length >= 2) {
        var half = Math.ceil(lines.length / 2)
        cards.push({ front: lines.slice(0, half).join(" "), back: lines.slice(half).join(" ") })
      }
    }

    if (cards.length === 0) throw new Error("Could not parse text into card pairs")
    if (onProgress) onProgress("Found " + cards.length + " cards")
    return cards
  } finally {
    await worker.terminate()
  }
}

function stripHtml(html) {
  if (!html) return ""
  var text = String(html)
  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(/<\/?(div|p|h[1-6]|li|tr|td|th)\b[^>]*>/gi, "\n")
  text = text.replace(/<[^>]*>/g, "")
  text = text.replace(/&amp;/g, "&")
  text = text.replace(/&lt;/g, "<")
  text = text.replace(/&gt;/g, ">")
  text = text.replace(/&quot;/g, "\"")
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, " ")
  text = text.replace(/&#(\d+);/g, function(m, code) { return String.fromCharCode(code) })
  text = text.replace(/\{\{c\d+::(.+?)(?:::(.+?))?\}\}/g, "$1")
  text = text.replace(/\n{3,}/g, "\n\n")
  text = text.replace(/ {2,}/g, " ")
  return text.trim()
}
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
    throw new Error("Invalid APKG file: cannot extract ZIP archive. Make sure the file is a valid .apkg file downloaded from Anki.")
  }

  if (onProgress) onProgress("Looking for database inside APKG...")
  var dbKeys = ["collection.anki21", "collection.anki21b", "collection.anki20", "collection.anki2", "collection.anki"]
  var dbBuffer = null
  var foundKey = null
  for (var k = 0; k < dbKeys.length; k++) {
    if (zip[dbKeys[k]]) { dbBuffer = zip[dbKeys[k]]; foundKey = dbKeys[k]; break }
  }
  if (!dbBuffer) {
    var zipKeys = Object.keys(zip)
    for (var z = 0; z < zipKeys.length; z++) {
      if (zipKeys[z].indexOf("collection") === 0) { dbBuffer = zip[zipKeys[z]]; foundKey = zipKeys[z]; break }
    }
  }
  if (!dbBuffer) {
    throw new Error("Invalid APKG: no database found inside. Found these files: " + Object.keys(zip).join(", "))
  }

  if (onProgress) onProgress("Loading database engine...")
  var SQL = await initSqlJs({ locateFile: function(f) { if (f.indexOf("sql-wasm") === 0) return "/sql-wasm.wasm"; return f } })

  if (onProgress) onProgress("Opening database: " + foundKey + " (" + Math.round(dbBuffer.length / 1024) + "KB)...")
  var db
  try {
    db = new SQL.Database(dbBuffer)
  } catch (openErr) {
    var allKeys = Object.keys(zip)
    for (var a = 0; a < allKeys.length; a++) {
      if (allKeys[a] !== foundKey && (allKeys[a].indexOf("collection") === 0 || allKeys[a].indexOf(".db") !== -1)) {
        try {
          db = new SQL.Database(zip[allKeys[a]])
          foundKey = allKeys[a]
          break
        } catch (tryErr) { continue }
      }
    }
    if (!db) throw new Error("Cannot open database. The APKG file may use a newer Anki format not yet supported. Try exporting your Anki deck as CSV/TXT instead: Anki > Click deck > Export > choose 'Notes in plain text' or 'Tab-separated values'.")
  }

  try {
    if (onProgress) onProgress("Reading notes...")
    var noteResult
    var tryQueries = [
      "SELECT flds FROM notes",
      "SELECT sfld, flds FROM cards LEFT JOIN notes ON cards.nid = notes.id",
      "SELECT * FROM notes"
    ]
    for (var qi = 0; qi < tryQueries.length; qi++) {
      try { noteResult = db.exec(tryQueries[qi]); if (noteResult.length) break } catch(qErr) { noteResult = null; continue }
    }
    if (!noteResult || !noteResult.length) throw new Error("APKG has no notes")

    var rows = noteResult[0].values
    var colNames = noteResult[0].columns
    var notes = []

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      var fieldsStr = null

      if (colNames.indexOf("sfld") >= 0 && colNames.indexOf("flds") >= 0) {
        fieldsStr = row[colNames.indexOf("flds")]
        var sfld = row[colNames.indexOf("sfld")]
        if (sfld && !fieldsStr) {
          var back = sfld
          notes.push({ front: stripHtml(String(sfld)).trim(), back: stripHtml(String(back)).trim() })
          continue
        }
      } else if (colNames.indexOf("flds") >= 0) {
        fieldsStr = row[colNames.indexOf("flds")]
      } else {
        for (var ci = 0; ci < row.length; ci++) {
          var val = String(row[ci])
          if (val.indexOf("\x1f") >= 0) { fieldsStr = val; break }
        }
      }

      if (!fieldsStr) continue
      var fields = String(fieldsStr).split("\x1f")
      if (fields.length >= 2) {
        var front = stripHtml(fields[0]).trim()
        var back = stripHtml(fields[1]).trim()
        if (front && back) notes.push({ front: front, back: back })
      }
    }

    if (notes.length === 0) throw new Error("APKG has notes but no valid question/answer pairs found")
    if (onProgress) onProgress("Found " + notes.length + " cards from " + foundKey)
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
import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Anki.module.css'

export default function Anki() {
  const { user } = useAuth()
  const [cards, setCards] = useState([])
  const [decks, setDecks] = useState([])
  const [view, setView] = useState('decks')     // decks | cards | add | upload
  const [selectedDeck, setSelectedDeck] = useState(null)
  const [form, setForm] = useState({ front: '', back: '', deck_id: '', high_yield: false })
  const [deckForm, setDeckForm] = useState('')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  // File upload state
  const [parsedCards, setParsedCards] = useState([])
  const [uploadDeckId, setUploadDeckId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [parsingFile, setParsingFile] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [c, d] = await Promise.all([
        supabase.from('anki_cards').select('*').order('next_review_date'),
        supabase.from('anki_decks').select('*').order('name'),
      ])
      if (c.error) console.error('Error loading cards:', c.error)
      if (d.error) console.error('Error loading decks:', d.error)
      setCards(c.data || [])
      setDecks(d.data || [])
    } catch (err) {
      console.error('loadData error:', err)
    }
    setLoading(false)
  }

  // ─── Deck Management ───

  async function addDeck() {
    if (!deckForm.trim()) return
    const { error } = await supabase.from('anki_decks').insert({
      user_id: user.id,
      name: deckForm.trim(),
      description: '',
    })
    if (error) { alert('Error: ' + error.message); return }
    setDeckForm('')
    loadData()
  }

  async function deleteDeck(id) {
    if (!confirm('Delete this deck and all its cards?')) return
    const { error: cardErr } = await supabase.from('anki_cards').delete().eq('deck_id', id)
    const { error } = await supabase.from('anki_decks').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    if (selectedDeck === id) { setSelectedDeck(null); setView('decks') }
    loadData()
  }

  // ─── Card Helpers ───

  function getDeckName(deckId) {
    const d = decks.find(d => d.id === deckId)
    return d ? d.name : 'No Deck'
  }

  function getDueStatus(card) {
    const today = new Date().toISOString().split('T')[0]
    if (!card.last_reviewed) return 'New'
    if (card.next_review_date <= today) return 'Due Now'
    return 'Later'
  }

  function getMaturity(card) {
    if (!card.last_reviewed) return 'New'
    if ((card.times_reviewed || 0) >= 5) return 'Mature'
    return 'Learning'
  }

  function getNextReviewInfo(card) {
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    if (!card.last_reviewed) return { label: 'Not scheduled', type: 'later' }

    const nextDate = new Date(card.next_review_date + 'T00:00:00')
    const diffMs = nextDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (card.next_review_date <= today) return { label: '⏰ Due now', type: 'due' }
    if (diffDays === 1) return { label: '📅 Tomorrow', type: 'soon' }
    if (diffDays <= 7) return { label: `📅 In ${diffDays} days`, type: 'soon' }
    if (diffDays <= 30) return { label: `📅 In ${Math.ceil(diffDays / 7)}w`, type: 'later' }
    return { label: `📅 In ${Math.ceil(diffDays / 30)}mo`, type: 'later' }
  }

  // ─── Card CRUD ───

  async function addCard() {
    if (!form.front || !form.back) return
    setAdding(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('anki_cards').insert({
        user_id: user.id,
        front: form.front,
        back: form.back,
        deck_id: toDeckId(form.deck_id),
        high_yield: form.high_yield,
        ease_factor: 2.5,
        interval_days: 0,
        times_reviewed: 0,
        last_reviewed: null,
        next_review_date: today,
      })
      if (error) { alert('Error: ' + error.message); setAdding(false); return }
      setForm({ front: '', back: '', deck_id: form.deck_id || '', high_yield: false })
      loadData()
    } catch (err) {
      console.error('addCard error:', err)
    }
    setAdding(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return
    await supabase.from('anki_cards').delete().eq('id', id)
    loadData()
  }

  async function review(id, outcome, card) {
    try {
      const ef = card.ease_factor || 2.5
      const intv = card.interval_days || 1
      const efMap = { Again: Math.max(1.3, ef - 0.2), Hard: Math.max(1.3, ef - 0.15), Good: ef, Easy: ef + 0.1 }
      const intMap = { Again: 1, Hard: Math.max(1, Math.floor(intv * 1.2)), Good: Math.max(1, Math.floor(intv * ef)), Easy: Math.max(1, Math.floor(intv * ef * 1.3)) }
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + intMap[outcome])
      const { error } = await supabase.from('anki_cards').update({
        ease_factor: efMap[outcome],
        interval_days: intMap[outcome],
        times_reviewed: (card.times_reviewed || 0) + 1,
        last_reviewed: new Date().toISOString().split('T')[0],
        next_review_date: nextDate.toISOString().split('T')[0],
      }).eq('id', id)
      if (error) { alert('Error: ' + error.message); return }
      loadData()
    } catch (err) {
      console.error('review error:', err)
    }
  }

  // ─── File Upload / Parse ───

  function toDeckId(val) {
    if (!val || val === 'none' || val === '') return null
    return val
  }

  async function parseApkgFile(file) {
    const JSZip = (await import('jszip')).default
    const initSqlJs = (await import('sql.js')).default

    const zip = await JSZip.loadAsync(file)

    let dbFile = null
    for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
      const f = zip.file(name)
      if (f) { dbFile = await f.async('uint8array'); break }
    }

    if (!dbFile) throw new Error('Could not find Anki database in the .apkg file')

    const SQL = await initSqlJs({
      locateFile: (file) => `/${file}`
    })

    const db = new SQL.Database(dbFile)
    try {
      const notesResult = db.exec('SELECT flds FROM notes')
      if (!notesResult.length || !notesResult[0].values.length) {
        throw new Error('No notes found in the .apkg file')
      }

      const parsed = []
      for (const row of notesResult[0].values) {
        const flds = row[0]
        const fields = flds.split('\x1f').map(f => f.trim())
        if (fields.length >= 2 && fields[0] && fields[1]) {
          parsed.push({ front: fields[0], back: fields[1] })
        }
      }
      return parsed
    } finally {
      db.close()
    }
  }

  async function parseFile(file) {
    // Handle .apkg files
    if (file.name.toLowerCase().endsWith('.apkg')) {
      setParsingFile(true)
      try {
        const parsed = await parseApkgFile(file)
        if (parsed.length === 0) {
          alert('No flashcards found in this .apkg file.')
          setParsingFile(false)
          return
        }
        setParsedCards(parsed)
        setUploadDeckId(selectedDeck || '')
        setView('upload')
      } catch (err) {
        console.error('APKG parse error:', err)
        alert('Failed to parse .apkg file: ' + (err.message || 'Unknown error'))
      }
      setParsingFile(false)
      return
    }

    // CSV / TSV / TXT parsing
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      const parsed = []

      if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
        // CSV: first line might be header, separator = comma or tab
        const sep = text.includes('\t') ? '\t' : ','
        lines.forEach((line, i) => {
          const parts = line.split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
          if (parts.length >= 2 && parts[0] && parts[1]) {
            // Skip header row if it looks like one
            if (i === 0 && (parts[0].toLowerCase() === 'front' || parts[0].toLowerCase() === 'question' || parts[0].toLowerCase() === 'term')) return
            parsed.push({ front: parts[0], back: parts[1] })
          }
        })
      } else {
        // TXT: format can be:
        // "Front\nBack" (blank line separated)
        // "Front\tBack" (tab separated)
        // "Front: Back" (colon separated)
        // "Front - Back" (dash separated)
        let currentFront = null
        let currentBack = null

        for (const line of lines) {
          // Try tab separator
          if (line.includes('\t')) {
            const [f, ...rest] = line.split('\t')
            if (f.trim() && rest.join('\t').trim()) {
              parsed.push({ front: f.trim(), back: rest.join('\t').trim() })
              currentFront = null; currentBack = null
              continue
            }
          }

          // Try " - " separator
          if (line.includes(' - ')) {
            const idx = line.indexOf(' - ')
            const f = line.substring(0, idx).trim()
            const b = line.substring(idx + 3).trim()
            if (f && b) {
              parsed.push({ front: f, back: b })
              currentFront = null; currentBack = null
              continue
            }
          }

          // Try ": " separator
          if (line.includes(': ')) {
            const idx = line.indexOf(': ')
            const f = line.substring(0, idx).trim()
            const b = line.substring(idx + 2).trim()
            if (f && b) {
              parsed.push({ front: f, back: b })
              currentFront = null; currentBack = null
              continue
            }
          }

          // Blank line separator (front then back)
          if (!line.trim()) {
            if (currentFront && currentBack) {
              parsed.push({ front: currentFront, back: currentBack })
              currentFront = null; currentBack = null
            }
            continue
          }

          if (!currentFront) {
            currentFront = line.trim()
          } else if (!currentBack) {
            currentBack = line.trim()
          }
        }
        // Don't forget the last pair
        if (currentFront && currentBack) {
          parsed.push({ front: currentFront, back: currentBack })
        }
      }

      if (parsed.length === 0) {
        alert('No flashcards found in this file. Make sure your file has pairs of questions and answers.')
        return
      }

      setParsedCards(parsed)
      setView('upload')
    }
    reader.readAsText(file)
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  function cancelUpload() {
    setParsedCards([])
    setUploadDeckId('')
    setView('add')
  }

  async function importCards() {
    if (parsedCards.length === 0) return
    setUploading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const rows = parsedCards.map(c => ({
        user_id: user.id,
        front: c.front,
        back: c.back,
        deck_id: toDeckId(uploadDeckId),
        high_yield: false,
        ease_factor: 2.5,
        interval_days: 0,
        times_reviewed: 0,
        last_reviewed: null,
        next_review_date: today,
      }))
      const { error } = await supabase.from('anki_cards').insert(rows)
      if (error) { alert('Error importing: ' + error.message); setUploading(false); return }
      setParsedCards([])
      setUploadDeckId('')
      loadData()
      setView('decks')
    } catch (err) {
      console.error('import error:', err)
    }
    setUploading(false)
  }

  // ─── Filtering ───

  const today = new Date().toISOString().split('T')[0]
  const deckCards = selectedDeck ? cards.filter(c => c.deck_id === selectedDeck) : cards
  const dueCards = deckCards.filter(c => (c.next_review_date || c.created_at?.split('T')[0]) <= today)
  const newCards = deckCards.filter(c => !c.last_reviewed)

  function getFilteredCards() {
    if (!selectedDeck) return []
    if (view === 'due') return dueCards
    if (view === 'new') return newCards
    return deckCards
  }

  const filtered = getFilteredCards()
  const dueCount = cards.filter(c => (c.next_review_date || c.created_at?.split('T')[0]) <= today).length
  const newCount = cards.filter(c => !c.last_reviewed).length

  if (loading) return <div className={styles.empty}>Loading Anki...</div>

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>🃏 Anki — SM-2 Tracker</h1>
          <p className={styles.sub}>Spaced repetition flashcards for medical study</p>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.statPill}><span className={styles.statPillNum}>{decks.length}</span> decks</div>
          <div className={styles.statPill}><span className={styles.statPillNum}>{cards.length}</span> cards</div>
          <div className={styles.statPill}><span className={styles.statPillNum}>{dueCount}</span> due</div>
          <div className={styles.statPill}><span className={styles.statPillNum}>{newCount}</span> new</div>
        </div>
      </div>

      {/* ─── DECKS VIEW ─── */}
      {view === 'decks' && (
        <>
          {/* Add deck inline */}
          <div className={styles.addDeckRow}>
            <input
              className={styles.addDeckInput}
              value={deckForm}
              onChange={e => setDeckForm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDeck()}
              placeholder="New deck name..."
            />
            <button className={styles.addDeckBtn} onClick={addDeck}>+ Add Deck</button>
          </div>

          <div className={styles.deckGrid}>
            {/* All Cards deck */}
            <div className={styles.deckCard} onClick={() => { setSelectedDeck(null); setView('cards') }}>
              <div className={styles.deckTop}>
                <span className={styles.deckName}>📚 All Cards</span>
              </div>
              <div className={styles.deckMeta}>
                <span className={styles.deckStat}><span className={styles.deckStatNum}>{cards.length}</span> total</span>
                <span className={styles.deckStat}><span className={styles.deckStatNum}>{dueCount}</span> due</span>
                <span className={styles.deckStat}><span className={styles.deckStatNum}>{newCount}</span> new</span>
              </div>
              {cards.length > 0 && (
                <div className={styles.progBar}>
                  <div className={styles.progFill} style={{ width: `${cards.length > 0 ? Math.round(dueCount / cards.length * 100) : 0}%` }} />
                </div>
              )}
            </div>

            {/* Due Today deck */}
            {dueCount > 0 && (
              <div className={styles.deckCard} onClick={() => { setSelectedDeck(null); setView('due') }}>
                <div className={styles.deckTop}>
                  <span className={styles.deckName}>⏰ Due Today</span>
                </div>
                <div className={styles.deckMeta}>
                  <span className={styles.deckStat}><span className={styles.deckStatNum}>{dueCount}</span> cards</span>
                </div>
              </div>
            )}

            {/* User decks */}
            {decks.length === 0 && (
              <div className={styles.empty}>No decks yet. Create your first deck above!</div>
            )}
            {decks.map(d => {
              const deckDue = cards.filter(c => c.deck_id === d.id && (c.next_review_date || c.created_at?.split('T')[0]) <= today).length
              const deckTotal = cards.filter(c => c.deck_id === d.id).length
              const deckNew = cards.filter(c => c.deck_id === d.id && !c.last_reviewed).length
              return (
                <div key={d.id} className={styles.deckCard} onClick={() => { setSelectedDeck(d.id); setView('cards') }}>
                  <div className={styles.deckTop}>
                    <span className={styles.deckName}>🗂 {d.name}</span>
                    <button className={styles.deckDel} onClick={e => { e.stopPropagation(); deleteDeck(d.id) }} title="Delete deck">🗑</button>
                  </div>
                  <div className={styles.deckMeta}>
                    <span className={styles.deckStat}><span className={styles.deckStatNum}>{deckTotal}</span> total</span>
                    <span className={styles.deckStat}><span className={styles.deckStatNum}>{deckDue}</span> due</span>
                    <span className={styles.deckStat}><span className={styles.deckStatNum}>{deckNew}</span> new</span>
                  </div>
                  {deckTotal > 0 && (
                    <div className={styles.progBar}>
                      <div className={styles.progFill} style={{ width: `${Math.round(deckDue / deckTotal * 100)}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ─── CARDS VIEW (selected deck) ─── */}
      {(view === 'cards' || view === 'due' || view === 'new') && (
        <>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${view === 'cards' ? styles.tabActive : ''}`} onClick={() => setView('cards')}>
              All ({deckCards.length})
            </button>
            <button className={`${styles.tab} ${view === 'due' ? styles.tabActive : ''}`} onClick={() => setView('due')}>
              ⏰ Due ({dueCards.length})
            </button>
            <button className={`${styles.tab} ${view === 'new' ? styles.tabActive : ''}`} onClick={() => setView('new')}>
              🆕 New ({newCards.length})
            </button>
            <button className={`${styles.tab} ${styles.tabAdd}`} onClick={() => { setView('add'); setForm({ ...form, deck_id: selectedDeck || '' }) }}>
              + Add Card
            </button>
            <button className={styles.tab} onClick={() => { setView('decks'); setSelectedDeck(null) }}>
              ← Back
            </button>
          </div>

          <div className={styles.cardList}>
            {filtered.length === 0 && (
              <div className={styles.empty}>
                {view === 'due' ? '🎉 No cards due right now!' : view === 'new' ? 'No new cards.' : 'No cards in this deck.'}
              </div>
            )}
            {filtered.map(c => {
              const dueStatus = getDueStatus(c)
              const maturity = getMaturity(c)
              const nextReview = getNextReviewInfo(c)
              return (
                <div key={c.id} className={styles.ankiCard}>
                  <button className={styles.cardDel} onClick={() => deleteCard(c.id)} title="Delete">🗑</button>
                  <div className={styles.ankiMeta}>
                    <span className={styles.dueStatus} style={{ color: dueStatus === 'Due Now' ? 'var(--coral)' : dueStatus === 'New' ? 'var(--teal)' : 'var(--sage)' }}>
                      {dueStatus === 'Due Now' ? '⏰ Due Now' : dueStatus === 'New' ? '🆕 New' : '✅ Later'}
                    </span>
                    <span className={styles.maturity}>{maturity}</span>
                    {c.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                    {c.deck_id && <span className={styles.deckBadge}>{getDeckName(c.deck_id)}</span>}
                    <span className={`${styles.nextReview} ${styles[nextReview.type]}`}>{nextReview.label}</span>
                  </div>
                  <div className={styles.ankiFront}>{c.front}</div>
                  <div className={styles.ankiBack}>{c.back}</div>
                  <div className={styles.ankiStats}>
                    <span className={styles.ankiStat}>EF: {Number(c.ease_factor || 2.5).toFixed(2)}</span>
                    <span className={styles.ankiStat}>Interval: {c.interval_days || 0}d</span>
                    <span className={styles.ankiStat}>Reviews: {c.times_reviewed || 0}</span>
                    <span className={styles.ankiStat}>Next: {c.next_review_date || '—'}</span>
                  </div>
                  <div className={styles.reviewBtns}>
                    {['Again', 'Hard', 'Good', 'Easy'].map(o => (
                      <button key={o} className={`${styles.reviewBtn} ${styles['r' + o]}`} onClick={() => review(c.id, o, c)}>{o}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ─── ADD CARD VIEW ─── */}
      {view === 'add' && (
        <>
          <div className={styles.tabs}>
            <button className={styles.tab} onClick={() => setView(selectedDeck ? 'cards' : 'decks')}>← Back</button>
          </div>

          <div className={styles.formCard}>
            <h3 className={styles.formTitle}>➕ Add New Flashcard</h3>
            <div className={styles.field}>
              <label>Front (Question)</label>
              <textarea rows={3} value={form.front} onChange={e => setForm({ ...form, front: e.target.value })} placeholder="e.g. What is the mechanism of action of aspirin?" />
            </div>
            <div className={styles.field}>
              <label>Back (Answer)</label>
              <textarea rows={3} value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} placeholder="e.g. Irreversibly inhibits COX-1 and COX-2, reducing prostaglandin synthesis..." />
            </div>
            <div className={styles.field}>
              <label>Deck</label>
              <select value={form.deck_id} onChange={e => setForm({ ...form, deck_id: e.target.value })}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={form.high_yield} onChange={e => setForm({ ...form, high_yield: e.target.checked })} /> ⭐ High Yield
            </label>
            <button className={styles.primaryBtn} onClick={addCard} disabled={adding}>
              {adding ? 'Adding...' : 'Add Card'}
            </button>

            {/* File Upload Section */}
            <div className={styles.uploadSection}>
              <div className={styles.uploadTitle}>📂 Or Import from File</div>
              <div className={styles.uploadSub}>
                Upload a file to bulk-import flashcards. Supported formats:<br />
                <strong>.apkg</strong> — Anki deck package (auto-parses cards)<br />
                <strong>CSV/TSV:</strong> front,back &nbsp;·&nbsp; <strong>TXT:</strong> tab, dash, colon, or blank-line separated
              </div>
              <div
                className={`${styles.uploadDrop} ${dragging ? styles.dragging : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.text,.apkg" onChange={handleFileSelect} />
                <div className={styles.uploadIcon}>📁</div>
                <div className={styles.uploadText}>{parsingFile ? 'Parsing file...' : (dragging ? 'Drop your file here!' : 'Click to browse or drag & drop')}</div>
                <div className={styles.uploadFormats}>.apkg, .csv, .tsv, .txt</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── UPLOAD PREVIEW VIEW ─── */}
      {view === 'upload' && parsedCards.length > 0 && (
        <>
          <div className={styles.tabs}>
            <button className={styles.tab} onClick={() => setView('add')}>← Back</button>
          </div>

          <div className={styles.formCard}>
            <h3 className={styles.formTitle}>📂 Import {parsedCards.length} Flashcards</h3>

            <div className={styles.field}>
              <label>Add to Deck (optional)</label>
              <select value={uploadDeckId} onChange={e => setUploadDeckId(e.target.value)}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className={styles.uploadPreview}>
              <div className={styles.uploadPreviewTitle}>PREVIEW ({parsedCards.length} cards)</div>
              {parsedCards.slice(0, 50).map((c, i) => (
                <div key={i} className={styles.uploadRow}>
                  <span className={styles.uploadFront}>{c.front}</span>
                  <span className={styles.uploadBack}>{c.back}</span>
                </div>
              ))}
              {parsedCards.length > 50 && (
                <div style={{ fontSize: 12, color: 'var(--mist)', padding: '8px 0' }}>
                  ...and {parsedCards.length - 50} more
                </div>
              )}
            </div>

            <div className={styles.uploadActions}>
              <button className={styles.uploadCancel} onClick={cancelUpload}>Cancel</button>
              <button className={styles.primaryBtn} onClick={importCards} disabled={uploading} style={{ marginTop: 0 }}>
                {uploading ? 'Importing...' : `🚀 Import ${parsedCards.length} Cards`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Anki.module.css'

/* ─────────────────────────────────────────────
   Anki — SM-2 Spaced Repetition Flashcards
   Rebuilt from scratch. No shared CSS modules.
   ───────────────────────────────────────────── */

export default function Anki() {
  const { user } = useAuth()

  // ── Data ──
  const [cards, setCards] = useState([])
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── View: decks | browse | add | upload | review ──
  const [view, setView] = useState('decks')
  const [activeDeckId, setActiveDeckId] = useState(null)   // null = all cards
  const [filter, setFilter] = useState('all')              // all | due | new

  // ── Add-card form ──
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [formDeckId, setFormDeckId] = useState('')
  const [highYield, setHighYield] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Deck form ──
  const [newDeckName, setNewDeckName] = useState('')
  const [savingDeck, setSavingDeck] = useState(false)

  // ── File upload ──
  const [parsedCards, setParsedCards] = useState([])
  const [uploadDeckId, setUploadDeckId] = useState('')
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef(null)

  // ── Review mode ──
  const [reviewQueue, setReviewQueue] = useState([])
  const [reviewIdx, setReviewIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  // ══════════════════════════════════════
  //  LOAD DATA
  // ══════════════════════════════════════

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [cardsRes, decksRes] = await Promise.all([
        supabase.from('anki_cards').select('*').order('created_at', { ascending: false }),
        supabase.from('anki_decks').select('*').order('name'),
      ])

      if (cardsRes.error) throw new Error(cardsRes.error.message)
      if (decksRes.error) throw new Error(decksRes.error.message)

      setCards(cardsRes.data || [])
      setDecks(decksRes.data || [])
    } catch (err) {
      console.error('Anki loadData error:', err)
      setError(err.message || 'Failed to load Anki data')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ══════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════

  function cleanDeckId(val) {
    // Convert empty string / "none" / undefined → null for Supabase
    if (!val || val === 'none' || val === '') return null
    return val
  }

  function deckName(deckId) {
    if (!deckId) return 'Unassigned'
    const d = decks.find(x => x.id === deckId)
    return d ? d.name : 'Unknown'
  }

  function todayStr() {
    return new Date().toISOString().split('T')[0]
  }

  function dueStatus(card) {
    const today = todayStr()
    if (!card.last_reviewed) return { label: 'New', color: 'var(--teal)' }
    if (!card.next_review_date || card.next_review_date <= today) return { label: 'Due', color: 'var(--coral)' }
    return { label: 'Later', color: 'var(--sage)' }
  }

  function nextReviewLabel(card) {
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

  function maturityLabel(card) {
    if (!card.last_reviewed) return 'New'
    if ((card.times_reviewed || 0) >= 5) return 'Mature'
    return 'Learning'
  }

  // ── Filtering ──

  const today = todayStr()
  const allCards = activeDeckId ? cards.filter(c => c.deck_id === activeDeckId) : cards
  const dueCards = allCards.filter(c => !c.last_reviewed || !c.next_review_date || c.next_review_date <= today)
  const newCards = allCards.filter(c => !c.last_reviewed)

  function visibleCards() {
    if (filter === 'due') return dueCards
    if (filter === 'new') return newCards
    return allCards
  }

  // ══════════════════════════════════════
  //  DECK CRUD
  // ══════════════════════════════════════

  async function createDeck() {
    const name = newDeckName.trim()
    if (!name) return
    setSavingDeck(true)
    try {
      const { error } = await supabase.from('anki_decks').insert({
        user_id: user.id,
        name,
        description: '',
      })
      if (error) throw error
      setNewDeckName('')
      loadData()
    } catch (err) {
      alert('Failed to create deck: ' + err.message)
    }
    setSavingDeck(false)
  }

  async function deleteDeck(id) {
    if (!confirm('Delete this deck AND all its cards? This cannot be undone.')) return
    try {
      // Delete cards in this deck first
      await supabase.from('anki_cards').delete().eq('deck_id', id)
      const { error } = await supabase.from('anki_decks').delete().eq('id', id)
      if (error) throw error
      if (activeDeckId === id) { setActiveDeckId(null); setView('decks') }
      loadData()
    } catch (err) {
      alert('Failed to delete deck: ' + err.message)
    }
  }

  // ══════════════════════════════════════
  //  CARD CRUD
  // ══════════════════════════════════════

  async function addCard() {
    if (!front.trim() || !back.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('anki_cards').insert({
        user_id: user.id,
        front: front.trim(),
        back: back.trim(),
        deck_id: cleanDeckId(formDeckId),
        high_yield: highYield,
        ease_factor: 2.5,
        interval_days: 0,
        times_reviewed: 0,
        last_reviewed: null,
        next_review_date: todayStr(),
      })
      if (error) throw error
      setFront('')
      setBack('')
      setHighYield(false)
      loadData()
    } catch (err) {
      alert('Failed to add card: ' + err.message)
    }
    setSaving(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this flashcard?')) return
    try {
      const { error } = await supabase.from('anki_cards').delete().eq('id', id)
      if (error) throw error
      loadData()
    } catch (err) {
      alert('Failed to delete card: ' + err.message)
    }
  }

  // ══════════════════════════════════════
  //  SM-2 REVIEW
  // ══════════════════════════════════════

  function startReview() {
    if (dueCards.length === 0) return
    setReviewQueue(dueCards)
    setReviewIdx(0)
    setShowAnswer(false)
    setView('review')
  }

  async function submitReview(outcome) {
    const card = reviewQueue[reviewIdx]
    if (!card) return

    const ef = Number(card.ease_factor || 2.5)
    const intv = Number(card.interval_days || 0)

    // SM-2 algorithm
    let newEf, newIntv
    switch (outcome) {
      case 'again':
        newEf = Math.max(1.3, ef - 0.2)
        newIntv = 1
        break
      case 'hard':
        newEf = Math.max(1.3, ef - 0.15)
        newIntv = Math.max(1, Math.ceil(intv * 1.2))
        break
      case 'good':
        newEf = ef
        newIntv = Math.max(1, Math.ceil(intv * ef))
        break
      case 'easy':
        newEf = ef + 0.15
        newIntv = Math.max(1, Math.ceil(intv * ef * 1.3))
        break
      default:
        newEf = ef; newIntv = intv
    }

    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + newIntv)

    try {
      const { error } = await supabase.from('anki_cards').update({
        ease_factor: newEf,
        interval_days: newIntv,
        times_reviewed: (card.times_reviewed || 0) + 1,
        last_reviewed: todayStr(),
        next_review_date: nextDate.toISOString().split('T')[0],
      }).eq('id', card.id)
      if (error) throw error

      // Move to next card or finish
      if (reviewIdx + 1 < reviewQueue.length) {
        setReviewIdx(reviewIdx + 1)
        setShowAnswer(false)
      } else {
        // Review complete
        setView(activeDeckId ? 'browse' : 'decks')
        loadData()
      }
    } catch (err) {
      alert('Review error: ' + err.message)
    }
  }

  function exitReview() {
    setReviewQueue([])
    setReviewIdx(0)
    setShowAnswer(false)
    setView(activeDeckId ? 'browse' : 'decks')
    loadData()
  }

  // ══════════════════════════════════════
  //  FILE UPLOAD & PARSING
  // ══════════════════════════════════════

  async function parseApkg(file) {
    const JSZip = (await import('jszip')).default
    const initSqlJs = (await import('sql.js')).default

    const zip = await JSZip.loadAsync(file)

    // Find the SQLite database (different Anki versions use different names)
    let dbBuf = null
    for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
      const f = zip.file(name)
      if (f) { dbBuf = await f.async('uint8array'); break }
    }
    if (!dbBuf) throw new Error('No Anki database found in .apkg file')

    // Load WASM from CDN — avoids Vercel SPA rewrite issues entirely
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

  function parseCsvTsv(text, filename) {
    const sep = filename.endsWith('.tsv') ? '\t' : ','
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const out = []
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
      if (parts.length >= 2 && parts[0] && parts[1]) {
        // Skip header
        const first = parts[0].toLowerCase()
        if (i === 0 && (first === 'front' || first === 'question' || first === 'term' || first === 'card')) continue
        out.push({ front: parts[0], back: parts[1] })
      }
    }
    return out
  }

  function parseTxt(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const out = []
    let curFront = null
    let curBack = null

    for (const line of lines) {
      // Tab separated
      if (line.includes('\t')) {
        const [f, ...rest] = line.split('\t')
        if (f.trim() && rest.join('\t').trim()) {
          out.push({ front: f.trim(), back: rest.join('\t').trim() })
          curFront = curBack = null
          continue
        }
      }
      // Dash separated
      const dashIdx = line.indexOf(' - ')
      if (dashIdx > 0) {
        const f = line.substring(0, dashIdx).trim()
        const b = line.substring(dashIdx + 3).trim()
        if (f && b) { out.push({ front: f, back: b }); curFront = curBack = null; continue }
      }
      // Colon separated
      const colonIdx = line.indexOf(': ')
      if (colonIdx > 0) {
        const f = line.substring(0, colonIdx).trim()
        const b = line.substring(colonIdx + 2).trim()
        if (f && b) { out.push({ front: f, back: b }); curFront = curBack = null; continue }
      }
      // Blank line = separator
      if (!line.trim()) {
        if (curFront && curBack) { out.push({ front: curFront, back: curBack }) }
        curFront = curBack = null
        continue
      }
      // Accumulate front/back
      if (!curFront) curFront = line.trim()
      else if (!curBack) curBack = line.trim()
    }
    if (curFront && curBack) out.push({ front: curFront, back: curBack })
    return out
  }

  async function handleFile(file) {
    if (!file) return
    setParsing(true)
    setParseError('')

    try {
      let result = []

      if (file.name.toLowerCase().endsWith('.apkg')) {
        result = await parseApkg(file)
      } else {
        // Read as text for csv/tsv/txt
        const text = await file.text()
        if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
          result = parseCsvTsv(text, file.name)
        } else {
          result = parseTxt(text)
        }
      }

      if (result.length === 0) {
        setParseError('No flashcards found in this file.')
        setParsing(false)
        return
      }

      setParsedCards(result)
      setUploadDeckId(activeDeckId || '')
      setView('upload')
    } catch (err) {
      console.error('File parse error:', err)
      setParseError('Failed to parse file: ' + (err.message || 'Unknown error'))
    }
    setParsing(false)
  }

  function onFileInputChange(e) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function importParsedCards() {
    if (parsedCards.length === 0) return
    setImporting(true)
    try {
      const rows = parsedCards.map(c => ({
        user_id: user.id,
        front: c.front,
        back: c.back,
        deck_id: cleanDeckId(uploadDeckId),
        high_yield: false,
        ease_factor: 2.5,
        interval_days: 0,
        times_reviewed: 0,
        last_reviewed: null,
        next_review_date: todayStr(),
      }))

      // Insert in batches of 100 to avoid payload limits
      const batchSize = 100
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { error } = await supabase.from('anki_cards').insert(batch)
        if (error) throw error
      }

      setParsedCards([])
      setUploadDeckId('')
      loadData()
      setView(activeDeckId ? 'browse' : 'decks')
    } catch (err) {
      alert('Import failed: ' + err.message)
    }
    setImporting(false)
  }

  // ══════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════

  if (loading) {
    return <div className={styles.loading}>Loading Anki...</div>
  }

  if (error && cards.length === 0 && decks.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3>Anki Setup Required</h3>
          <p>The Anki tables don't exist yet in your database. Run the migration SQL first:</p>
          <ol>
            <li>Go to your Supabase SQL Editor</li>
            <li>Run the <strong>anki-migration.sql</strong> file</li>
            <li>Refresh this page</li>
          </ol>
          <p className={styles.errorDetail}>Error: {error}</p>
        </div>
      </div>
    )
  }

  const currentCard = reviewQueue[reviewIdx] || null

  return (
    <div className={styles.page}>

      {/* ───── HEADER ───── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>🃏 Anki</h1>
          <p className={styles.sub}>Spaced repetition flashcards — SM-2 algorithm</p>
        </div>
        <div className={styles.pills}>
          <span className={styles.pill}>
            <strong>{decks.length}</strong> decks
          </span>
          <span className={styles.pill}>
            <strong>{cards.length}</strong> cards
          </span>
          <span className={styles.pill}>
            <strong>{dueCards.length}</strong> due
          </span>
          <span className={styles.pill}>
            <strong>{newCards.length}</strong> new
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          VIEW: DECKS
          ═══════════════════════════════════════════ */}
      {view === 'decks' && (
        <>
          {/* Create deck */}
          <div className={styles.createDeckRow}>
            <input
              className={styles.createDeckInput}
              value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createDeck()}
              placeholder="New deck name..."
              maxLength={80}
            />
            <button
              className={styles.createDeckBtn}
              onClick={createDeck}
              disabled={savingDeck || !newDeckName.trim()}
            >
              {savingDeck ? '...' : '+ Deck'}
            </button>
          </div>

          {/* Quick Review button */}
          {dueCards.length > 0 && (
            <button className={styles.reviewAllBtn} onClick={startReview}>
              ⏰ Review {dueCards.length} Due Card{dueCards.length > 1 ? 's' : ''}
            </button>
          )}

          <div className={styles.deckGrid}>
            {/* All Cards (special) */}
            <div className={styles.deckCard} onClick={() => { setActiveDeckId(null); setFilter('all'); setView('browse') }}>
              <div className={styles.deckTop}>
                <span className={styles.deckName}>📚 All Cards</span>
              </div>
              <div className={styles.deckMeta}>
                <span><strong>{cards.length}</strong> total</span>
                <span><strong>{dueCards.length}</strong> due</span>
                <span><strong>{newCards.length}</strong> new</span>
              </div>
              {cards.length > 0 && (
                <div className={styles.progBar}>
                  <div className={styles.progFill} style={{ width: `${Math.round((dueCards.length / cards.length) * 100)}%` }} />
                </div>
              )}
            </div>

            {/* User decks */}
            {decks.length === 0 && (
              <div className={styles.empty}>No decks yet. Create one above!</div>
            )}
            {decks.map(d => {
              const dCards = cards.filter(c => c.deck_id === d.id)
              const dDue = dCards.filter(c => !c.last_reviewed || !c.next_review_date || c.next_review_date <= today)
              const dNew = dCards.filter(c => !c.last_reviewed)
              return (
                <div key={d.id} className={styles.deckCard} onClick={() => { setActiveDeckId(d.id); setFilter('all'); setView('browse') }}>
                  <div className={styles.deckTop}>
                    <span className={styles.deckName}>🗂️ {d.name}</span>
                    <button
                      className={styles.deckDelBtn}
                      onClick={e => { e.stopPropagation(); deleteDeck(d.id) }}
                      title="Delete deck and all its cards"
                    >✕</button>
                  </div>
                  <div className={styles.deckMeta}>
                    <span><strong>{dCards.length}</strong> total</span>
                    <span><strong>{dDue.length}</strong> due</span>
                    <span><strong>{dNew.length}</strong> new</span>
                  </div>
                  {dCards.length > 0 && (
                    <div className={styles.progBar}>
                      <div className={styles.progFill} style={{ width: `${Math.round((dDue.length / dCards.length) * 100)}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          VIEW: BROWSE CARDS
          ═══════════════════════════════════════════ */}
      {view === 'browse' && (
        <>
          {/* Breadcrumb */}
          <div className={styles.breadcrumb}>
            <button className={styles.breadLink} onClick={() => { setActiveDeckId(null); setView('decks') }}>← Decks</button>
            {activeDeckId && <span className={styles.breadSep}>/</span>}
            {activeDeckId && <span className={styles.breadCurrent}>{deckName(activeDeckId)}</span>}
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${filter === 'all' ? styles.tabOn : ''}`} onClick={() => setFilter('all')}>
              All ({allCards.length})
            </button>
            <button className={`${styles.tab} ${filter === 'due' ? styles.tabOn : ''}`} onClick={() => setFilter('due')}>
              ⏰ Due ({dueCards.length})
            </button>
            <button className={`${styles.tab} ${filter === 'new' ? styles.tabOn : ''}`} onClick={() => setFilter('new')}>
              🆕 New ({newCards.length})
            </button>
            {dueCards.length > 0 && (
              <button className={styles.tabReview} onClick={startReview}>
                Start Review
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className={styles.tabAdd} onClick={() => setView('add')}>
              + Add Card
            </button>
          </div>

          {/* Card list */}
          <div className={styles.cardList}>
            {visibleCards().length === 0 && (
              <div className={styles.empty}>
                {filter === 'due' ? '🎉 No cards due right now!' : filter === 'new' ? 'No new cards in this deck.' : 'No cards yet. Add one!'}
              </div>
            )}
            {visibleCards().map(card => {
              const ds = dueStatus(card)
              const nr = nextReviewLabel(card)
              return (
                <div key={card.id} className={styles.ankiCard}>
                  {/* Top row: badges + delete */}
                  <div className={styles.ankiTopRow}>
                    <div className={styles.badges}>
                      <span className={styles.badge} style={{ color: ds.color }}>
                        {ds.label === 'Due' ? '⏰ Due' : ds.label === 'New' ? '🆕 New' : '✅ Later'}
                      </span>
                      <span className={styles.badgeMaturity}>{maturityLabel(card)}</span>
                      {card.high_yield && <span className={styles.badgeHY}>⭐ HY</span>}
                      {card.deck_id && <span className={styles.badgeDeck}>{deckName(card.deck_id)}</span>}
                      <span className={`${styles.badgeReview} ${styles['nr_' + nr.cls]}`}>{nr.text}</span>
                    </div>
                    <button className={styles.delBtn} onClick={() => deleteCard(card.id)} title="Delete card">
                      🗑️
                    </button>
                  </div>

                  {/* Content */}
                  <div className={styles.ankiFront}>{card.front}</div>
                  <div className={styles.ankiBack}>{card.back}</div>

                  {/* SM-2 stats */}
                  <div className={styles.ankiStats}>
                    <span>EF: {Number(card.ease_factor || 2.5).toFixed(2)}</span>
                    <span>Interval: {card.interval_days || 0}d</span>
                    <span>Reviews: {card.times_reviewed || 0}</span>
                    <span>Next: {card.next_review_date || '—'}</span>
                  </div>

                  {/* Quick review buttons */}
                  <div className={styles.reviewBtns}>
                    {['Again', 'Hard', 'Good', 'Easy'].map(o => (
                      <button key={o} className={`${styles.revBtn} ${styles['rev_' + o.toLowerCase()]}`} onClick={() => submitReview(o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          VIEW: ADD CARD
          ═══════════════════════════════════════════ */}
      {view === 'add' && (
        <>
          <div className={styles.breadcrumb}>
            <button className={styles.breadLink} onClick={() => setView(activeDeckId ? 'browse' : 'decks')}>
              ← Back
            </button>
          </div>

          <div className={styles.formCard}>
            <h3 className={styles.formTitle}>➕ Add Flashcard</h3>

            <div className={styles.field}>
              <label>Front (Question)</label>
              <textarea
                rows={3}
                value={front}
                onChange={e => setFront(e.target.value)}
                placeholder="e.g. What is the mechanism of action of aspirin?"
              />
            </div>

            <div className={styles.field}>
              <label>Back (Answer)</label>
              <textarea
                rows={3}
                value={back}
                onChange={e => setBack(e.target.value)}
                placeholder="e.g. Irreversibly inhibits COX-1 and COX-2, reducing prostaglandin synthesis..."
              />
            </div>

            <div className={styles.field}>
              <label>Deck</label>
              <select value={formDeckId} onChange={e => setFormDeckId(e.target.value)}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <label className={styles.checkRow}>
              <input type="checkbox" checked={highYield} onChange={e => setHighYield(e.target.checked)} />
              ⭐ High Yield
            </label>

            <button className={styles.primaryBtn} onClick={addCard} disabled={saving || !front.trim() || !back.trim()}>
              {saving ? 'Saving...' : 'Add Card'}
            </button>

            {/* File upload section */}
            <div className={styles.uploadSection}>
              <h4 className={styles.uploadTitle}>📂 Import from File</h4>
              <p className={styles.uploadDesc}>
                Supported: <strong>.apkg</strong> (Anki deck), <strong>.csv</strong>, <strong>.tsv</strong>, <strong>.txt</strong>
              </p>

              {parseError && <div className={styles.parseError}>{parseError}</div>}

              <div
                className={styles.dropZone}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add(styles.dragOver) }}
                onDragLeave={e => { e.currentTarget.classList.remove(styles.dragOver) }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.classList.remove(styles.dragOver)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFile(file)
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apkg,.csv,.tsv,.txt,.text"
                  onChange={onFileInputChange}
                  style={{ display: 'none' }}
                />
                <div className={styles.dropIcon}>{parsing ? '⏳' : '📁'}</div>
                <div className={styles.dropText}>
                  {parsing ? 'Parsing file...' : 'Click or drag & drop'}
                </div>
                <div className={styles.dropFormats}>.apkg  .csv  .tsv  .txt</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          VIEW: UPLOAD PREVIEW
          ═══════════════════════════════════════════ */}
      {view === 'upload' && parsedCards.length > 0 && (
        <>
          <div className={styles.breadcrumb}>
            <button className={styles.breadLink} onClick={() => { setParsedCards([]); setView('add') }}>
              ← Back
            </button>
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

            <div className={styles.previewList}>
              <div className={styles.previewHeader}>
                Showing {Math.min(parsedCards.length, 30)} of {parsedCards.length} cards
              </div>
              {parsedCards.slice(0, 30).map((c, i) => (
                <div key={i} className={styles.previewRow}>
                  <span className={styles.previewFront}>{c.front}</span>
                  <span className={styles.previewArrow}>→</span>
                  <span className={styles.previewBack}>{c.back}</span>
                </div>
              ))}
              {parsedCards.length > 30 && (
                <div className={styles.previewMore}>...and {parsedCards.length - 30} more</div>
              )}
            </div>

            <div className={styles.uploadActions}>
              <button className={styles.cancelBtn} onClick={() => { setParsedCards([]); setView('add') }}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={importParsedCards} disabled={importing} style={{ marginTop: 0 }}>
                {importing ? 'Importing...' : `🚀 Import ${parsedCards.length} Cards`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          VIEW: REVIEW MODE
          ═══════════════════════════════════════════ */}
      {view === 'review' && currentCard && (
        <>
          <div className={styles.reviewHeader}>
            <button className={styles.exitReviewBtn} onClick={exitReview}>✕ Exit</button>
            <span className={styles.reviewProgress}>
              Card {reviewIdx + 1} of {reviewQueue.length}
            </span>
            <div className={styles.reviewProgBar}>
              <div
                className={styles.reviewProgFill}
                style={{ width: `${((reviewIdx + 1) / reviewQueue.length) * 100}%` }}
              />
            </div>
          </div>

          <div className={styles.reviewCard}>
            <div className={styles.reviewDeckLabel}>{deckName(currentCard.deck_id)}</div>

            <div className={styles.reviewQuestion}>
              <div className={styles.reviewLabel}>Question</div>
              <div className={styles.reviewContent}>{currentCard.front}</div>
            </div>

            {!showAnswer ? (
              <button className={styles.showAnswerBtn} onClick={() => setShowAnswer(true)}>
                Show Answer
              </button>
            ) : (
              <>
                <div className={styles.reviewAnswer}>
                  <div className={styles.reviewLabel}>Answer</div>
                  <div className={styles.reviewContent}>{currentCard.back}</div>
                </div>

                <div className={styles.reviewMeta}>
                  <span>EF: {Number(currentCard.ease_factor || 2.5).toFixed(2)}</span>
                  <span>Interval: {currentCard.interval_days || 0}d</span>
                  <span>Reviews: {currentCard.times_reviewed || 0}</span>
                </div>

                <div className={styles.reviewBtns}>
                  <button className={`${styles.revBtn} ${styles.rev_again}`} onClick={() => submitReview('again')}>
                    😕 Again
                  </button>
                  <button className={`${styles.revBtn} ${styles.rev_hard}`} onClick={() => submitReview('hard')}>
                    🤔 Hard
                  </button>
                  <button className={`${styles.revBtn} ${styles.rev_good}`} onClick={() => submitReview('good')}>
                    😊 Good
                  </button>
                  <button className={`${styles.revBtn} ${styles.rev_easy}`} onClick={() => submitReview('easy')}>
                    🤩 Easy
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

    </div>
  )
}

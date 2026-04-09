import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Anki.module.css'
import { cleanDeckId, todayStr, deckName, dueStatus, nextReviewLabel, maturityLabel, computeReview, parseApkg, parseCsvTsv, parseTxt } from './AnkiLogic'

export default function Anki() {
  const { user } = useAuth()
  const [cards, setCards] = useState([])
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('decks')
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [formDeckId, setFormDeckId] = useState('')
  const [highYield, setHighYield] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newDeckName, setNewDeckName] = useState('')
  const [savingDeck, setSavingDeck] = useState(false)
  const [parsedCards, setParsedCards] = useState([])
  const [uploadDeckId, setUploadDeckId] = useState('')
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef(null)
  const [reviewQueue, setReviewQueue] = useState([])
  const [reviewIdx, setReviewIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [c, d] = await Promise.all([
        supabase.from('anki_cards').select('*').order('created_at', { ascending: false }),
        supabase.from('anki_decks').select('*').order('name'),
      ])
      if (c.error) throw new Error(c.error.message)
      if (d.error) throw new Error(d.error.message)
      setCards(c.data || []); setDecks(d.data || [])
    } catch (err) { console.error(err); setError(err.message || 'Failed to load') }
    setLoading(false)
  }, [])
  useEffect(() => { loadData() }, [loadData])

  const today = todayStr()
  const allCards = activeDeckId ? cards.filter(c => c.deck_id === activeDeckId) : cards
  const dueCards = allCards.filter(c => !c.last_reviewed || !c.next_review_date || c.next_review_date <= today)
  const newCards = allCards.filter(c => !c.last_reviewed)
  function visibleCards() {
    if (filter === 'due') return dueCards
    if (filter === 'new') return newCards
    return allCards
  }
  function dn(deckId) { return deckName(decks, deckId) }

  // DECK CRUD
  async function createDeck() {
    if (!newDeckName.trim()) return; setSavingDeck(true)
    try {
      const { error } = await supabase.from('anki_decks').insert({ user_id: user.id, name: newDeckName.trim(), description: '' })
      if (error) throw error; setNewDeckName(''); loadData()
    } catch (err) { alert('Failed: ' + err.message) }
    setSavingDeck(false)
  }
  async function deleteDeck(id) {
    if (!confirm('Delete this deck and all its cards?')) return
    try {
      await supabase.from('anki_cards').delete().eq('deck_id', id)
      const { error } = await supabase.from('anki_decks').delete().eq('id', id)
      if (error) throw error
      if (activeDeckId === id) { setActiveDeckId(null); setView('decks') }
      loadData()
    } catch (err) { alert('Failed: ' + err.message) }
  }

  // CARD CRUD
  async function addCard() {
    if (!front.trim() || !back.trim()) return; setSaving(true)
    try {
      const { error } = await supabase.from('anki_cards').insert({
        user_id: user.id, front: front.trim(), back: back.trim(), deck_id: cleanDeckId(formDeckId),
        high_yield: highYield, ease_factor: 2.5, interval_days: 0, times_reviewed: 0,
        last_reviewed: null, next_review_date: todayStr(),
      })
      if (error) throw error; setFront(''); setBack(''); setHighYield(false); loadData()
    } catch (err) { alert('Failed: ' + err.message) }
    setSaving(false)
  }
  async function deleteCard(id) {
    if (!confirm('Delete this flashcard?')) return
    try { const { error } = await supabase.from('anki_cards').delete().eq('id', id); if (error) throw error; loadData() }
    catch (err) { alert('Failed: ' + err.message) }
  }

  // SM-2 REVIEW
  function startReview() {
    if (dueCards.length === 0) return
    setReviewQueue(dueCards); setReviewIdx(0); setShowAnswer(false); setView('review')
  }
  async function submitReview(outcome) {
    const card = reviewQueue[reviewIdx]
    if (!card) return
    try {
      const updates = computeReview(outcome, card)
      const { error } = await supabase.from('anki_cards').update(updates).eq('id', card.id)
      if (error) throw error
      if (reviewIdx + 1 < reviewQueue.length) { setReviewIdx(reviewIdx + 1); setShowAnswer(false) }
      else { setView(activeDeckId ? 'browse' : 'decks'); loadData() }
    } catch (err) { alert('Review error: ' + err.message) }
  }
  function exitReview() {
    setReviewQueue([]); setReviewIdx(0); setShowAnswer(false)
    setView(activeDeckId ? 'browse' : 'decks'); loadData()
  }

  // FILE UPLOAD
  async function handleFile(file) {
    if (!file) return; setParsing(true); setParseError('')
    try {
      let result = []
      if (file.name.toLowerCase().endsWith('.apkg')) { result = await parseApkg(file) }
      else {
        const text = await file.text()
        result = file.name.endsWith('.csv') || file.name.endsWith('.tsv') ? parseCsvTsv(text, file.name) : parseTxt(text)
      }
      if (result.length === 0) { setParseError('No flashcards found.'); setParsing(false); return }
      setParsedCards(result); setUploadDeckId(activeDeckId || ''); setView('upload')
    } catch (err) { setParseError('Parse failed: ' + (err.message || 'Unknown error')) }
    setParsing(false)
  }
  async function importParsedCards() {
    if (!parsedCards.length) return; setImporting(true)
    try {
      const rows = parsedCards.map(c => ({
        user_id: user.id, front: c.front, back: c.back, deck_id: cleanDeckId(uploadDeckId),
        high_yield: false, ease_factor: 2.5, interval_days: 0, times_reviewed: 0,
        last_reviewed: null, next_review_date: todayStr(),
      }))
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from('anki_cards').insert(rows.slice(i, i + 100))
        if (error) throw error
      }
      setParsedCards([]); setUploadDeckId(''); loadData(); setView(activeDeckId ? 'browse' : 'decks')
    } catch (err) { alert('Import failed: ' + err.message) }
    setImporting(false)
  }

  if (loading) return <div className={styles.loading}>Loading Anki...</div>
  if (error && !cards.length && !decks.length) return (
    <div className={styles.page}><div className={styles.errorBox}>
      <div className={styles.errorIcon}>⚠️</div><h3>Anki Setup Required</h3>
      <p>Run the anki-migration.sql in your Supabase SQL Editor first.</p>
      <p className={styles.errorDetail}>{error}</p>
    </div></div>
  )

  const currentCard = reviewQueue[reviewIdx] || null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>🃏 Anki</h1>
          <p className={styles.sub}>Spaced repetition — SM-2 algorithm</p>
        </div>
        <div className={styles.pills}>
          <span className={styles.pill}><strong>{decks.length}</strong> decks</span>
          <span className={styles.pill}><strong>{cards.length}</strong> cards</span>
          <span className={styles.pill}><strong>{dueCards.length}</strong> due</span>
          <span className={styles.pill}><strong>{newCards.length}</strong> new</span>
        </div>
      </div>

      {/* DECKS VIEW */}
      {view === 'decks' && (<>
        <div className={styles.createDeckRow}>
          <input className={styles.createDeckInput} value={newDeckName} onChange={e => setNewDeckName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createDeck()} placeholder="New deck name..." maxLength={80} />
          <button className={styles.createDeckBtn} onClick={createDeck} disabled={savingDeck || !newDeckName.trim()}>{savingDeck ? '...' : '+ Deck'}</button>
        </div>
        {dueCards.length > 0 && (
          <button className={styles.reviewAllBtn} onClick={startReview}>⏰ Review {dueCards.length} Due Card{dueCards.length > 1 ? 's' : ''}</button>
        )}
        <div className={styles.deckGrid}>
          <div className={styles.deckCard} onClick={() => { setActiveDeckId(null); setFilter('all'); setView('browse') }}>
            <div className={styles.deckTop}><span className={styles.deckName}>📚 All Cards</span></div>
            <div className={styles.deckMeta}>
              <span><strong>{cards.length}</strong> total</span>
              <span><strong>{dueCards.length}</strong> due</span>
              <span><strong>{newCards.length}</strong> new</span>
            </div>
            {cards.length > 0 && <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${Math.round((dueCards.length / cards.length) * 100)}%` }} /></div>}
          </div>
          {decks.length === 0 && <div className={styles.empty}>No decks yet. Create one above!</div>}
          {decks.map(d => {
            const dc = cards.filter(c => c.deck_id === d.id), dd = dc.filter(c => !c.last_reviewed || !c.next_review_date || c.next_review_date <= today), dn2 = dc.filter(c => !c.last_reviewed)
            return (
              <div key={d.id} className={styles.deckCard} onClick={() => { setActiveDeckId(d.id); setFilter('all'); setView('browse') }}>
                <div className={styles.deckTop}>
                  <span className={styles.deckName}>🗂️ {d.name}</span>
                  <button className={styles.deckDelBtn} onClick={e => { e.stopPropagation(); deleteDeck(d.id) }} title="Delete">✕</button>
                </div>
                <div className={styles.deckMeta}>
                  <span><strong>{dc.length}</strong> total</span>
                  <span><strong>{dd.length}</strong> due</span>
                  <span><strong>{dn2.length}</strong> new</span>
                </div>
                {dc.length > 0 && <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${Math.round((dd.length / dc.length) * 100)}%` }} /></div>}
              </div>
            )
          })}
        </div>
      </>)}

      {/* BROWSE CARDS VIEW */}
      {view === 'browse' && (<>
        <div className={styles.breadcrumb}>
          <button className={styles.breadLink} onClick={() => { setActiveDeckId(null); setView('decks') }}>← Decks</button>
          {activeDeckId && <><span className={styles.breadSep}>/</span><span className={styles.breadCurrent}>{dn(activeDeckId)}</span></>}
        </div>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${filter === 'all' ? styles.tabOn : ''}`} onClick={() => setFilter('all')}>All ({allCards.length})</button>
          <button className={`${styles.tab} ${filter === 'due' ? styles.tabOn : ''}`} onClick={() => setFilter('due')}>⏰ Due ({dueCards.length})</button>
          <button className={`${styles.tab} ${filter === 'new' ? styles.tabOn : ''}`} onClick={() => setFilter('new')}>🆕 New ({newCards.length})</button>
          {dueCards.length > 0 && <button className={styles.tabReview} onClick={startReview}>Start Review</button>}
          <div style={{ flex: 1 }} />
          <button className={styles.tabAdd} onClick={() => setView('add')}>+ Add Card</button>
        </div>
        <div className={styles.cardList}>
          {visibleCards().length === 0 && <div className={styles.empty}>{filter === 'due' ? '🎉 No cards due!' : filter === 'new' ? 'No new cards.' : 'No cards yet.'}</div>}
          {visibleCards().map(card => {
            const ds = dueStatus(card), nr = nextReviewLabel(card)
            return (
              <div key={card.id} className={styles.ankiCard}>
                <div className={styles.ankiTopRow}>
                  <div className={styles.badges}>
                    <span className={styles.badge} style={{ color: ds.color }}>{ds.label === 'Due' ? '⏰ Due' : ds.label === 'New' ? '🆕 New' : '✅ Later'}</span>
                    <span className={styles.badgeMaturity}>{maturityLabel(card)}</span>
                    {card.high_yield && <span className={styles.badgeHY}>⭐ HY</span>}
                    {card.deck_id && <span className={styles.badgeDeck}>{dn(card.deck_id)}</span>}
                    <span className={`${styles.badgeReview} ${styles['nr_' + nr.cls]}`}>{nr.text}</span>
                  </div>
                  <button className={styles.delBtn} onClick={() => deleteCard(card.id)} title="Delete">🗑️</button>
                </div>
                <div className={styles.ankiFront}>{card.front}</div>
                <div className={styles.ankiBack}>{card.back}</div>
                <div className={styles.ankiStats}>
                  <span>EF: {Number(card.ease_factor || 2.5).toFixed(2)}</span>
                  <span>Interval: {card.interval_days || 0}d</span>
                  <span>Reviews: {card.times_reviewed || 0}</span>
                  <span>Next: {card.next_review_date || '—'}</span>
                </div>
                <div className={styles.reviewBtns}>
                  {['Again', 'Hard', 'Good', 'Easy'].map(o => (
                    <button key={o} className={`${styles.revBtn} ${styles['rev_' + o.toLowerCase()]}`} onClick={() => submitReview(o)}>{o}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </>)}

      {/* ADD CARD VIEW */}
      {view === 'add' && (<>
        <div className={styles.breadcrumb}>
          <button className={styles.breadLink} onClick={() => setView(activeDeckId ? 'browse' : 'decks')}>← Back</button>
        </div>
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>➕ Add Flashcard</h3>
          <div className={styles.field}><label>Front (Question)</label>
            <textarea rows={3} value={front} onChange={e => setFront(e.target.value)} placeholder="e.g. What is the mechanism of aspirin?" /></div>
          <div className={styles.field}><label>Back (Answer)</label>
            <textarea rows={3} value={back} onChange={e => setBack(e.target.value)} placeholder="e.g. Irreversibly inhibits COX-1 and COX-2..." /></div>
          <div className={styles.field}><label>Deck</label>
            <select value={formDeckId} onChange={e => setFormDeckId(e.target.value)}>
              <option value="">No deck</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <label className={styles.checkRow}><input type="checkbox" checked={highYield} onChange={e => setHighYield(e.target.checked)} /> ⭐ High Yield</label>
          <button className={styles.primaryBtn} onClick={addCard} disabled={saving || !front.trim() || !back.trim()}>{saving ? 'Saving...' : 'Add Card'}</button>
          <div className={styles.uploadSection}>
            <h4 className={styles.uploadTitle}>📂 Import from File</h4>
            <p className={styles.uploadDesc}>Supported: <strong>.apkg</strong> (Anki), <strong>.csv</strong>, <strong>.tsv</strong>, <strong>.txt</strong></p>
            {parseError && <div className={styles.parseError}>{parseError}</div>}
            <div className={styles.dropZone} onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add(styles.dragOver) }}
              onDragLeave={e => e.currentTarget.classList.remove(styles.dragOver)}
              onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove(styles.dragOver); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}>
              <input ref={fileInputRef} type="file" accept=".apkg,.csv,.tsv,.txt,.text" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} style={{ display: 'none' }} />
              <div className={styles.dropIcon}>{parsing ? '⏳' : '📁'}</div>
              <div className={styles.dropText}>{parsing ? 'Parsing...' : 'Click or drag & drop'}</div>
              <div className={styles.dropFormats}>.apkg .csv .tsv .txt</div>
            </div>
          </div>
        </div>
      </>)}

      {/* UPLOAD PREVIEW VIEW */}
      {view === 'upload' && parsedCards.length > 0 && (<>
        <div className={styles.breadcrumb}>
          <button className={styles.breadLink} onClick={() => { setParsedCards([]); setView('add') }}>← Back</button>
        </div>
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>📂 Import {parsedCards.length} Flashcards</h3>
          <div className={styles.field}><label>Add to Deck (optional)</label>
            <select value={uploadDeckId} onChange={e => setUploadDeckId(e.target.value)}>
              <option value="">No deck</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div className={styles.previewList}>
            <div className={styles.previewHeader}>Showing {Math.min(parsedCards.length, 30)} of {parsedCards.length}</div>
            {parsedCards.slice(0, 30).map((c, i) => (
              <div key={i} className={styles.previewRow}>
                <span className={styles.previewFront}>{c.front}</span>
                <span className={styles.previewArrow}>→</span>
                <span className={styles.previewBack}>{c.back}</span>
              </div>
            ))}
            {parsedCards.length > 30 && <div className={styles.previewMore}>...and {parsedCards.length - 30} more</div>}
          </div>
          <div className={styles.uploadActions}>
            <button className={styles.cancelBtn} onClick={() => { setParsedCards([]); setView('add') }}>Cancel</button>
            <button className={styles.primaryBtn} onClick={importParsedCards} disabled={importing} style={{ marginTop: 0 }}>{importing ? 'Importing...' : `🚀 Import ${parsedCards.length} Cards`}</button>
          </div>
        </div>
      </>)}

      {/* REVIEW MODE */}
      {view === 'review' && currentCard && (<>
        <div className={styles.reviewHeader}>
          <button className={styles.exitReviewBtn} onClick={exitReview}>✕ Exit</button>
          <span className={styles.reviewProgress}>Card {reviewIdx + 1} of {reviewQueue.length}</span>
          <div className={styles.reviewProgBar}><div className={styles.reviewProgFill} style={{ width: `${((reviewIdx + 1) / reviewQueue.length) * 100}%` }} /></div>
        </div>
        <div className={styles.reviewCard}>
          <div className={styles.reviewDeckLabel}>{dn(currentCard.deck_id)}</div>
          <div className={styles.reviewQuestion}>
            <div className={styles.reviewLabel}>Question</div>
            <div className={styles.reviewContent}>{currentCard.front}</div>
          </div>
          {!showAnswer ? (
            <button className={styles.showAnswerBtn} onClick={() => setShowAnswer(true)}>Show Answer</button>
          ) : (<>
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
              <button className={`${styles.revBtn} ${styles.rev_again}`} onClick={() => submitReview('again')}>😕 Again</button>
              <button className={`${styles.revBtn} ${styles.rev_hard}`} onClick={() => submitReview('hard')}>🤔 Hard</button>
              <button className={`${styles.revBtn} ${styles.rev_good}`} onClick={() => submitReview('good')}>😊 Good</button>
              <button className={`${styles.revBtn} ${styles.rev_easy}`} onClick={() => submitReview('easy')}>🤩 Easy</button>
            </div>
          </>)}
        </div>
      </>)}
    </div>
  )
}

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Anki.module.css'
import * as L from './AnkiLogic'

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
  const [deckName, setDeckName] = useState('')
  const [savingDeck, setSavingDeck] = useState(false)
  const [parsed, setParsed] = useState([])
  const [uploadDeck, setUploadDeck] = useState('')
  const [importing, setImporting] = useState(false)
  const [parseErr, setParseErr] = useState('')
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [showAns, setShowAns] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [c, d] = await Promise.all([
        supabase.from('anki_cards').select('*').order('created_at', { ascending: false }),
        supabase.from('anki_decks').select('*').order('name'),
      ])
      if (c.error) throw new Error(c.error.message)
      if (d.error) throw new Error(d.error.message)
      setCards(c.data || []); setDecks(d.data || [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const today = L.todayStr()
  const all = activeDeckId ? cards.filter(c => c.deck_id === activeDeckId) : cards
  const due = all.filter(c => !c.last_reviewed || !c.next_review_date || c.next_review_date <= today)
  const nw = all.filter(c => !c.last_reviewed)
  const vis = filter === 'due' ? due : filter === 'new' ? nw : all
  const dn = id => L.deckName(decks, id)

  async function createDeck() {
    if (!deckName.trim()) return; setSavingDeck(true)
    try {
      const { error } = await supabase.from('anki_decks').insert({ user_id: user.id, name: deckName.trim(), description: '' })
      if (error) throw error; setDeckName(''); load()
    } catch (e) { alert(e.message) }
    setSavingDeck(false)
  }

  async function deleteDeck(id) {
    if (!confirm('Delete this deck and all its cards?')) return
    try {
      await supabase.from('anki_cards').delete().eq('deck_id', id)
      const { error } = await supabase.from('anki_decks').delete().eq('id', id)
      if (error) throw error
      if (activeDeckId === id) { setActiveDeckId(null); setView('decks') }
      load()
    } catch (e) { alert(e.message) }
  }

  async function addCard() {
    if (!front.trim() || !back.trim()) return; setSaving(true)
    try {
      const { error } = await supabase.from('anki_cards').insert({
        user_id: user.id, front: front.trim(), back: back.trim(), deck_id: L.cleanDeckId(formDeckId),
        high_yield: highYield, ease_factor: 2.5, interval_days: 0, times_reviewed: 0,
        last_reviewed: null, next_review_date: today,
      })
      if (error) throw error; setFront(''); setBack(''); setHighYield(false); load()
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return
    try { const { error } = await supabase.from('anki_cards').delete().eq('id', id); if (error) throw error; load() }
    catch (e) { alert(e.message) }
  }

  function startReview() { if (due.length) { setQueue(due); setQIdx(0); setShowAns(false); setView('review') } }

  async function submitReview(outcome) {
    const card = queue[qIdx]; if (!card) return
    try {
      const { error } = await supabase.from('anki_cards').update(L.computeReview(outcome, card)).eq('id', card.id)
      if (error) throw error
      if (qIdx + 1 < queue.length) { setQIdx(qIdx + 1); setShowAns(false) }
      else { setView(activeDeckId ? 'browse' : 'decks'); load() }
    } catch (e) { alert(e.message) }
  }

  function exitReview() { setQueue([]); setQIdx(0); setShowAns(false); setView(activeDeckId ? 'browse' : 'decks'); load() }

  async function handleFile(file) {
    if (!file) return; setParsing(true); setParseErr('')
    try {
      let r = []
      if (file.name.toLowerCase().endsWith('.apkg')) r = await L.parseApkg(file)
      else { const t = await file.text(); r = file.name.endsWith('.csv') || file.name.endsWith('.tsv') ? L.parseCsvTsv(t, file.name) : L.parseTxt(t) }
      if (!r.length) { setParseErr('No cards found.'); setParsing(false); return }
      setParsed(r); setUploadDeck(activeDeckId || ''); setView('upload')
    } catch (e) { setParseErr(e.message) }
    setParsing(false)
  }

  async function importCards() {
    if (!parsed.length) return; setImporting(true)
    try {
      const rows = parsed.map(c => ({ user_id: user.id, front: c.front, back: c.back, deck_id: L.cleanDeckId(uploadDeck), high_yield: false, ease_factor: 2.5, interval_days: 0, times_reviewed: 0, last_reviewed: null, next_review_date: today }))
      for (let i = 0; i < rows.length; i += 100) { const { error } = await supabase.from('anki_cards').insert(rows.slice(i, i + 100)); if (error) throw error }
      setParsed([]); setUploadDeck(''); load(); setView(activeDeckId ? 'browse' : 'decks')
    } catch (e) { alert(e.message) }
    setImporting(false)
  }

  if (loading) return <div className={styles.loading}>Loading Anki...</div>
  if (error && !cards.length && !decks.length) return (
    <div className={styles.page}><div className={styles.errorBox}><div className={styles.errorIcon}>⚠️</div>
      <h3>Anki Setup Required</h3><p>Run anki-migration.sql in Supabase SQL Editor first.</p>
      <p className={styles.errorDetail}>{error}</p></div></div>
  )
  const cur = queue[qIdx]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}><h1 className={styles.title}>🃏 Anki</h1><p className={styles.sub}>Spaced repetition — SM-2</p></div>
        <div className={styles.pills}>
          <span className={styles.pill}><strong>{decks.length}</strong> decks</span>
          <span className={styles.pill}><strong>{cards.length}</strong> cards</span>
          <span className={styles.pill}><strong>{due.length}</strong> due</span>
          <span className={styles.pill}><strong>{nw.length}</strong> new</span>
        </div>
      </div>

      {view === 'decks' && (<>
        <div className={styles.createDeckRow}>
          <input className={styles.createDeckInput} value={deckName} onChange={e => setDeckName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createDeck()} placeholder="New deck name..." maxLength={80} />
          <button className={styles.createDeckBtn} onClick={createDeck} disabled={savingDeck || !deckName.trim()}>{savingDeck ? '...' : '+ Deck'}</button>
        </div>
        {due.length > 0 && <button className={styles.reviewAllBtn} onClick={startReview}>⏰ Review {due.length} Due Card{due.length > 1 ? 's' : ''}</button>}
        <div className={styles.deckGrid}>
          <div className={styles.deckCard} onClick={() => { setActiveDeckId(null); setFilter('all'); setView('browse') }}>
            <div className={styles.deckTop}><span className={styles.deckName}>📚 All Cards</span></div>
            <div className={styles.deckMeta}><span><strong>{cards.length}</strong> total</span><span><strong>{due.length}</strong> due</span><span><strong>{nw.length}</strong> new</span></div>
            {cards.length > 0 && <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${Math.round((due.length / cards.length) * 100)}%` }} /></div>}
          </div>
          {!decks.length && <div className={styles.empty}>No decks yet.</div>}
          {decks.map(d => {
            const dc = cards.filter(c => c.deck_id === d.id), dd = dc.filter(c => !c.last_reviewed || !c.next_review_date || c.next_review_date <= today)
            return (<div key={d.id} className={styles.deckCard} onClick={() => { setActiveDeckId(d.id); setFilter('all'); setView('browse') }}>
              <div className={styles.deckTop}><span className={styles.deckName}>🗂️ {d.name}</span><button className={styles.deckDelBtn} onClick={e => { e.stopPropagation(); deleteDeck(d.id) }}>✕</button></div>
              <div className={styles.deckMeta}><span><strong>{dc.length}</strong> total</span><span><strong>{dd.length}</strong> due</span></div>
              {dc.length > 0 && <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${Math.round((dd.length / dc.length) * 100)}%` }} /></div>}
            </div>)
          })}
        </div>
      </>)}

      {view === 'browse' && (<>
        <div className={styles.breadcrumb}><button className={styles.breadLink} onClick={() => { setActiveDeckId(null); setView('decks') }}>← Decks</button>{activeDeckId && <><span className={styles.breadSep}>/</span><span className={styles.breadCurrent}>{dn(activeDeckId)}</span></>}</div>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${filter === 'all' ? styles.tabOn : ''}`} onClick={() => setFilter('all')}>All ({all.length})</button>
          <button className={`${styles.tab} ${filter === 'due' ? styles.tabOn : ''}`} onClick={() => setFilter('due')}>⏰ Due ({due.length})</button>
          <button className={`${styles.tab} ${filter === 'new' ? styles.tabOn : ''}`} onClick={() => setFilter('new')}>🆕 New ({nw.length})</button>
          {due.length > 0 && <button className={styles.tabReview} onClick={startReview}>Review</button>}
          <div style={{ flex: 1 }} /><button className={styles.tabAdd} onClick={() => setView('add')}>+ Add</button>
        </div>
        <div className={styles.cardList}>
          {!vis.length && <div className={styles.empty}>{filter === 'due' ? '🎉 No cards due!' : 'No cards.'}</div>}
          {vis.map(card => {
            const ds = L.dueStatus(card), nr = L.nextReviewLabel(card)
            return (<div key={card.id} className={styles.ankiCard}>
              <div className={styles.ankiTopRow}>
                <div className={styles.badges}>
                  <span className={styles.badge} style={{ color: ds.color }}>{ds.label === 'Due' ? '⏰ Due' : ds.label === 'New' ? '🆕 New' : '✅ Later'}</span>
                  <span className={styles.badgeMaturity}>{L.maturityLabel(card)}</span>
                  {card.high_yield && <span className={styles.badgeHY}>⭐ HY</span>}
                  {card.deck_id && <span className={styles.badgeDeck}>{dn(card.deck_id)}</span>}
                  <span className={`${styles.badgeReview} ${styles['nr_' + nr.cls]}`}>{nr.text}</span>
                </div>
                <button className={styles.delBtn} onClick={() => deleteCard(card.id)}>🗑️</button>
              </div>
              <div className={styles.ankiFront}>{card.front}</div>
              <div className={styles.ankiBack}>{card.back}</div>
              <div className={styles.ankiStats}>
                <span>EF: {Number(card.ease_factor || 2.5).toFixed(2)}</span>
                <span>Interval: {card.interval_days || 0}d</span>
                <span>Reviews: {card.times_reviewed || 0}</span>
                <span>Next: {card.next_review_date || '—'}</span>
              </div>
              <div className={styles.reviewBtns}>{['Again', 'Hard', 'Good', 'Easy'].map(o => (<button key={o} className={`${styles.revBtn} ${styles['rev_' + o.toLowerCase()]}`} onClick={() => submitReview(o)}>{o}</button>))}</div>
            </div>)
          })}
        </div>
      </>)}

      {view === 'add' && (<>
        <div className={styles.breadcrumb}><button className={styles.breadLink} onClick={() => setView(activeDeckId ? 'browse' : 'decks')}>← Back</button></div>
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>➕ Add Flashcard</h3>
          <div className={styles.field}><label>Front</label><textarea rows={3} value={front} onChange={e => setFront(e.target.value)} placeholder="Question..." /></div>
          <div className={styles.field}><label>Back</label><textarea rows={3} value={back} onChange={e => setBack(e.target.value)} placeholder="Answer..." /></div>
          <div className={styles.field}><label>Deck</label><select value={formDeckId} onChange={e => setFormDeckId(e.target.value)}><option value="">No deck</option>{decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <label className={styles.checkRow}><input type="checkbox" checked={highYield} onChange={e => setHighYield(e.target.checked)} /> ⭐ High Yield</label>
          <button className={styles.primaryBtn} onClick={addCard} disabled={saving || !front.trim() || !back.trim()}>{saving ? 'Saving...' : 'Add Card'}</button>
          <div className={styles.uploadSection}>
            <h4 className={styles.uploadTitle}>📂 Import File</h4>
            <p className={styles.uploadDesc}>.apkg .csv .tsv .txt</p>
            {parseErr && <div className={styles.parseError}>{parseErr}</div>}
            <div className={styles.dropZone} onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault() }} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}>
              <input ref={fileRef} type="file" accept=".apkg,.csv,.tsv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} style={{ display: 'none' }} />
              <div className={styles.dropIcon}>{parsing ? '⏳' : '📁'}</div>
              <div className={styles.dropText}>{parsing ? 'Parsing...' : 'Click or drop'}</div>
            </div>
          </div>
        </div>
      </>)}

      {view === 'upload' && parsed.length > 0 && (<>
        <div className={styles.breadcrumb}><button className={styles.breadLink} onClick={() => { setParsed([]); setView('add') }}>← Back</button></div>
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>📂 Import {parsed.length} Cards</h3>
          <div className={styles.field}><label>Deck</label><select value={uploadDeck} onChange={e => setUploadDeck(e.target.value)}><option value="">No deck</option>{decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div className={styles.previewList}>
            <div className={styles.previewHeader}>{Math.min(parsed.length, 30)} of {parsed.length}</div>
            {parsed.slice(0, 30).map((c, i) => (<div key={i} className={styles.previewRow}><span className={styles.previewFront}>{c.front}</span><span className={styles.previewArrow}>→</span><span className={styles.previewBack}>{c.back}</span></div>))}
            {parsed.length > 30 && <div className={styles.previewMore}>+{parsed.length - 30} more</div>}
          </div>
          <div className={styles.uploadActions}>
            <button className={styles.cancelBtn} onClick={() => { setParsed([]); setView('add') }}>Cancel</button>
            <button className={styles.primaryBtn} onClick={importCards} disabled={importing} style={{ marginTop: 0 }}>{importing ? '...' : `🚀 Import ${parsed.length}`}</button>
          </div>
        </div>
      </>)}

      {view === 'review' && cur && (<>
        <div className={styles.reviewHeader}>
          <button className={styles.exitReviewBtn} onClick={exitReview}>✕</button>
          <span className={styles.reviewProgress}>{qIdx + 1}/{queue.length}</span>
          <div className={styles.reviewProgBar}><div className={styles.reviewProgFill} style={{ width: `${((qIdx + 1) / queue.length) * 100}%` }} /></div>
        </div>
        <div className={styles.reviewCard}>
          <div className={styles.reviewDeckLabel}>{dn(cur.deck_id)}</div>
          <div className={styles.reviewQuestion}><div className={styles.reviewLabel}>Question</div><div className={styles.reviewContent}>{cur.front}</div></div>
          {!showAns ? (<button className={styles.showAnswerBtn} onClick={() => setShowAns(true)}>Show Answer</button>) : (<>
            <div className={styles.reviewAnswer}><div className={styles.reviewLabel}>Answer</div><div className={styles.reviewContent}>{cur.back}</div></div>
            <div className={styles.reviewMeta}><span>EF: {Number(cur.ease_factor || 2.5).toFixed(2)}</span><span>Interval: {cur.interval_days || 0}d</span><span>Reviews: {cur.times_reviewed || 0}</span></div>
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

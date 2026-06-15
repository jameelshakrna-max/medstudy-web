import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile } from '../lib/fileParser'
import { FSRS, createEmptyCard, Rating, State } from 'fsrs.js'
import s from './Anki.module.css'

const API = '/api'
const f = new FSRS()

let _sessionCache = null
let _sessionTime = 0
async function getSession() {
  const now = Date.now()
  if (_sessionCache && now - _sessionTime < 50000) return _sessionCache
  const { data: { session } } = await supabase.auth.getSession()
  _sessionCache = session
  _sessionTime = now
  return session
}

async function api(method, path, body) {
  const session = await getSession()
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + session.access_token }
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(API + path, opts)
  return res.json()
}

const dm = (dks, id) => {
  if (!id) return 'Unassigned'
  const d = dks.find(x => x.id === id)
  return d ? d.name : 'Unknown'
}

// ── FSRS helpers ──
function isDue(c) {
  const state = Number(c.state) || 0
  if (state === State.New) return true
  if (!c.next_review) return true
  return new Date(c.next_review) <= new Date()
}

function isNew(c) {
  return (Number(c.state) || 0) === State.New
}

function statusInfo(c) {
  const state = Number(c.state) || 0
  if (state === State.New) return { l: 'New' }
  if (isDue(c)) return { l: 'Due' }
  return { l: 'Later' }
}

function nextReviewLabel(c) {
  const state = Number(c.state) || 0
  if (state === State.New) return { t: 'Not scheduled' }
  if (!c.next_review) return { t: 'Due now' }
  const now = new Date()
  const nr = new Date(c.next_review)
  const d = Math.ceil((nr - now) / 864e5)
  if (isNaN(d) || d <= 0) return { t: 'Due now' }
  if (d === 1) return { t: 'Tomorrow' }
  if (d <= 7) return { t: 'In ' + d + 'd' }
  if (d <= 30) return { t: 'In ' + Math.ceil(d / 7) + 'w' }
  return { t: 'In ' + Math.ceil(d / 30) + 'mo' }
}

function maturityLabel(c) {
  const state = Number(c.state) || 0
  if (state === State.New) return 'New'
  if (state === State.Learning) return 'Learning'
  if (state === State.Relearning) return 'Relearning'
  if (Number(c.scheduled_days) <= 21) return 'Young'
  return 'Mature'
}

// Convert DB card to FSRS card format
function toFSRSCard(card) {
  const state = Number(card.state) || 0
  if (state === State.New && !card.last_review) {
    return createEmptyCard()
  }
  return {
    due: card.next_review ? new Date(card.next_review) : new Date(),
    stability: Number(card.stability) || 0.1,
    difficulty: Number(card.difficulty) || 0,
    elapsed_days: Number(card.elapsed_days) || 0,
    scheduled_days: Number(card.scheduled_days) || 0,
    reps: Number(card.reps) || 0,
    lapses: Number(card.lapses) || 0,
    state: state,
    last_review: card.last_review ? new Date(card.last_review) : null,
  }
}

// Format scheduled days for button labels
function formatScheduledDays(days) {
  if (days < 1) {
    const mins = Math.round(days * 1440)
    if (mins < 1) return '<1m'
    if (mins < 60) return mins + 'm'
    return Math.round(mins / 60) + 'h'
  }
  if (days < 30) return Math.round(days) + 'd'
  const months = Math.round(days / 30)
  return months + 'mo'
}

// Rating map
const ratingMap = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy }

// FSRS review — replaces sm2()
function fsrsReview(option, card) {
  const fsrsCard = toFSRSCard(card)
  const now = new Date()
  const scheduling = f.repeat(fsrsCard, now)
  const rating = ratingMap[option] || Rating.Good
  const next = scheduling[rating].card

  return {
    difficulty: next.difficulty,
    stability: next.stability,
    state: next.state,
    reps: next.reps,
    lapses: next.lapses,
    elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days,
    next_review: next.due.toISOString(),
    last_review: now.toISOString(),
    // Keep legacy fields in sync
    ease_factor: card.ease_factor || 2.5,
    interval: next.scheduled_days,
    repetitions: next.reps,
  }
}

// Get FSRS scheduling preview for all ratings
function getSchedulingPreview(card) {
  const fsrsCard = toFSRSCard(card)
  const now = new Date()
  return f.repeat(fsrsCard, now)
}

export default function Anki() {
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
  const [uploadProgress, setUploadProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [showAns, setShowAns] = useState(false)
  const [reviewingCardId, setReviewingCardId] = useState(null)
  const [scheduling, setScheduling] = useState(null)

  // shared decks
  const [sharedDecks, setSharedDecks] = useState([])
  const [sharedCards, setSharedCards] = useState([])
  const [sharedSearch, setSharedSearch] = useState('')
  const [sharedLoading, setSharedLoading] = useState(false)
  const [copying, setCopying] = useState('')
  const [sharedViewDeck, setSharedViewDeck] = useState(null)
  const [copyCardId, setCopyCardId] = useState(null)
  const [copyCardDeckId, setCopyCardDeckId] = useState('')
  const [copyingCard, setCopyingCard] = useState(false)

  const [sharedViewCards, setSharedViewCards] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('GET', '/anki-data')
      if (data.error) throw new Error(data.error)
      setDecks(Array.isArray(data.decks) ? data.decks : [])
      setCards(Array.isArray(data.cards) ? data.cards : [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const all = activeDeckId ? cards.filter(c => c.deck_id === activeDeckId) : cards
  const due = all.filter(c => isDue(c))
  const nw = all.filter(c => isNew(c))
  const vis = filter === 'due' ? due : filter === 'new' ? nw : all
  const dn = id => dm(decks, id)

  async function createDeck() {
    if (!deckName.trim()) return
    setSavingDeck(true)
    try {
      const r = await api('POST', '/decks', { name: deckName.trim() })
      if (r.error) throw new Error(r.error)
      setDecks(prev => [...prev, r])
      setDeckName('')
    } catch (e) { alert(e.message) }
    setSavingDeck(false)
  }

  async function deleteDeck(id) {
    if (!confirm('Delete deck and all its cards?')) return
    try {
      const r = await api('DELETE', '/decks/' + id)
      if (r.error) throw new Error(r.error)
      setDecks(prev => prev.filter(d => d.id !== id))
      setCards(prev => prev.filter(c => c.deck_id !== id))
      if (activeDeckId === id) { setActiveDeckId(null); setView('decks') }
    } catch (e) { alert(e.message) }
  }

  async function toggleShare(deckId, currentState) {
    try {
      const r = await api('PUT', '/decks/' + deckId, { toggle_share: true })
      if (r.error) throw new Error(r.error)
      setDecks(prev => prev.map(d => d.id === deckId ? { ...d, is_shared: r.is_shared, share_code: r.share_code } : d))
    } catch (e) { alert(e.message) }
  }

  async function loadShared(searchTerm) {
    setSharedLoading(true)
    try {
      const q = searchTerm ? '?q=' + encodeURIComponent(searchTerm) : ''
      const data = await api('GET', '/shared' + q)
      if (data.error) throw new Error(data.error)
      setSharedDecks(data.decks || [])
      setSharedCards(data.cards || [])
    } catch (e) { alert(e.message) }
    setSharedLoading(false)
  }

  async function copyDeck(shareCode) {
    setCopying(shareCode)
    try {
      const r = await api('POST', '/shared', { share_code: shareCode })
      if (r.error) throw new Error(r.error)
      if (r.deck) {
        setDecks(prev => [...prev, r.deck])
        if (r.cards) setCards(prev => [...prev, ...r.cards])
        alert('Deck copied to your collection!')
      }
    } catch (e) { alert(e.message) }
    setCopying('')
  }

  async function loadSharedCards(deck) {
    try {
      const data = await api('GET', '/shared?deck_id=' + deck.id)
      if (data.error) throw new Error(data.error)
      setSharedViewDeck(deck)
      setSharedViewCards(data.cards || [])
      setView('shared-view')
    } catch (e) { alert(e.message) }
  }

  async function copySingleCard(card) {
    if (!copyCardDeckId) return alert('Please select a deck first.')
    setCopyingCard(true)
    try {
      const r = await api('POST', '/flashcards', {
        deck_id: copyCardDeckId,
        front: card.front,
        back: card.back,
        high_yield: card.high_yield
      })
      if (r.error) throw new Error(r.error)
      setCards(prev => [...prev, r])
      setCopyCardId(null)
      setCopyCardDeckId('')
      alert('Card copied to your deck!')
    } catch (e) { alert(e.message) }
    setCopyingCard(false)
  }

  async function addCard() {
    if (!front.trim() || !back.trim()) return
    if (!formDeckId) return alert('Please select or create a deck first.')
    setSaving(true)
    try {
      const r = await api('POST', '/flashcards', {
        deck_id: formDeckId, front: front.trim(), back: back.trim(), high_yield: highYield
      })
      if (r.error) throw new Error(r.error)
      setCards(prev => [...prev, r])
      setFront(''); setBack(''); setHighYield(false)
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return
    try {
      const r = await api('DELETE', '/flashcards/' + id)
      if (r.error) throw new Error(r.error)
      setCards(prev => prev.filter(c => c.id !== id))
    } catch (e) { alert(e.message) }
  }

  function startReview() {
    if (due.length) { setQueue(due); setQIdx(0); setShowAns(false); setScheduling(null); setView('review') }
  }

  async function submitReview(option) {
    const c = queue[qIdx]
    if (!c) return
    const u = fsrsReview(option, c)
    try {
      const r = await api('PUT', '/flashcards/' + c.id, u)
      if (r.error) throw new Error(r.error)
      setCards(prev => prev.map(card => card.id === c.id ? { ...card, ...r } : card))
      if (qIdx + 1 < queue.length) { setQIdx(qIdx + 1); setShowAns(false); setScheduling(null) }
      else { setView(activeDeckId ? 'browse' : 'decks') }
    } catch (e) { alert(e.message) }
  }

  function exitReview() {
    setQueue([]); setQIdx(0); setShowAns(false); setScheduling(null)
    setView(activeDeckId ? 'browse' : 'decks')
  }

  async function submitInlineReview(option, card) {
    const u = fsrsReview(option, card)
    try {
      const r = await api('PUT', '/flashcards/' + card.id, u)
      if (r.error) throw new Error(r.error)
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...r } : c))
      setReviewingCardId(null)
    } catch (e) { alert(e.message) }
  }

  function handleShowAnswer() {
    setShowAns(true)
    if (cur) {
      setScheduling(getSchedulingPreview(cur))
    }
  }

  async function handleFile(file) {
    if (!file) return
    setParsing(true); setParseErr(''); setUploadProgress('Parsing file...')
    try {
      const r = await parseFile(file, m => setUploadProgress(m))
      if (!r.length) { setParseErr('No cards found.'); setParsing(false); return }
      setParsed(r); setUploadDeck(activeDeckId || ''); setView('upload')
    } catch (e) { setParseErr(e.message) }
    setParsing(false)
  }

  async function importCards() {
    if (!parsed.length) return
    if (!uploadDeck) return alert('Please select a deck.')
    setImporting(true)
    try {
      const withDeck = parsed.map(c => ({ front: c.front, back: c.back, deck_id: uploadDeck }))
      const r = await api('POST', '/flashcards', { cards: withDeck })
      if (r.error) throw new Error(r.error)
      const newCards = Array.isArray(r) ? r : [r]
      setCards(prev => [...prev, ...newCards])
      setParsed([]); setUploadDeck('')
      setView(activeDeckId ? 'browse' : 'decks')
    } catch (e) { alert(e.message) }
    setImporting(false)
  }

  if (loading) return <div className={s.loading}>Loading Anki...</div>

  if (error && !cards.length && !decks.length) return (
    <div className={s.page}>
      <div className={s.errorBox}>
        <h3>Setup Required</h3>
        <p>Make sure your Turso database has anki_decks and anki_cards tables.</p>
        <p className={s.errorDetail}>{error}</p>
      </div>
    </div>
  )

  const cur = queue[qIdx]
  const getNrClass = c => {
    const st = statusInfo(c)
    return st.l === 'Due' ? s.nr_due : st.l === 'New' ? s.nr_soon : s.nr_later
  }

  // Get button label with interval preview
  const revLabel = (option) => {
    if (!scheduling) return option.charAt(0).toUpperCase() + option.slice(1)
    const rating = ratingMap[option]
    const days = scheduling[rating]?.card?.scheduled_days ?? 0
    const interval = formatScheduledDays(days)
    return `${option.charAt(0).toUpperCase() + option.slice(1)} (${interval})`
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Anki</h1>
          <p className={s.sub}>Spaced repetition — FSRS</p>
        </div>
        <div className={s.pills}>
          {[
            { n: decks.length, l: 'decks' },
            { n: cards.length, l: 'cards' },
            { n: due.length, l: 'due' },
            { n: nw.length, l: 'new' }
          ].map(t => (
            <span key={t.l} className={s.pill}><strong>{t.n}</strong> {t.l}</span>
          ))}
        </div>
      </div>

      {/* Main navigation tabs */}
      <div className={s.mainTabs}>
        <button className={`${s.mainTab} ${view === 'decks' || view === 'browse' || view === 'add' || view === 'upload' || view === 'review' ? s.mainTabOn : ''}`} onClick={() => { setView('decks'); setActiveDeckId(null) }}>My Decks</button>
        <button className={`${s.mainTab} ${view === 'shared' || view === 'shared-view' ? s.mainTabOn : ''}`} onClick={() => { setView('shared'); loadShared('') }}>Community</button>
      </div>

      {/* ── decks view ── */}
      {view === 'decks' && (
        <>
          <div className={s.createDeckRow}>
            <input className={s.createDeckInput} value={deckName} onChange={e => setDeckName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createDeck()} placeholder="New deck name..." maxLength={80} />
            <button className={s.createDeckBtn} onClick={createDeck} disabled={savingDeck || !deckName.trim()}>{savingDeck ? '...' : '+ Deck'}</button>
          </div>
          {due.length > 0 && (
            <button className={s.reviewAllBtn} onClick={startReview}>Review {due.length} Due Card{due.length > 1 ? 's' : ''}</button>
          )}
          <div className={s.deckGrid}>
            <div className={s.deckCard} onClick={() => { setActiveDeckId(null); setFilter('all'); setView('browse') }}>
              <div className={s.deckTop}><span className={s.deckName}>All Cards</span></div>
              <div className={s.deckMeta}>
                <span><strong>{cards.length}</strong> total</span>
                <span><strong>{due.length}</strong> due</span>
                <span><strong>{nw.length}</strong> new</span>
              </div>
              {cards.length > 0 && (<div className={s.progBar}><div className={s.progFill} style={{ width: Math.round(due.length / cards.length * 100) + '%', background: 'var(--teal)' }} /></div>)}
            </div>
            {!decks.length && (<div className={s.empty}>No decks yet. Create your first deck to get started!</div>)}
            {decks.map(d => {
              const dc = cards.filter(c => c.deck_id === d.id)
              const dd = dc.filter(c => isDue(c))
              return (
                <div key={d.id} className={s.deckCard} onClick={() => { setActiveDeckId(d.id); setFilter('all'); setView('browse') }}>
                  <button className={s.deckDelBtn} onClick={e => { e.stopPropagation(); deleteDeck(d.id) }} title="Delete">x</button>
                  <div className={s.deckTop}>
                    <span className={s.deckName}>{d.name}</span>
                    {d.is_shared && <span className={s.sharedBadge}>Shared</span>}
                  </div>
                  <div className={s.deckMeta}>
                    <span><strong>{dc.length}</strong> total</span>
                    <span><strong>{dd.length}</strong> due</span>
                  </div>
                  {dc.length > 0 && (<div className={s.progBar}><div className={s.progFill} style={{ width: Math.round(dd.length / dc.length * 100) + '%', background: 'var(--violet)' }} /></div>)}
                  <button
                    className={`${s.shareBtn} ${d.is_shared ? s.shareBtnOn : ''}`}
                    onClick={e => { e.stopPropagation(); toggleShare(d.id, d.is_shared) }}
                    title={d.is_shared ? 'Unshare deck' : 'Share deck'}
                  >
                    {d.is_shared ? 'Unshare' : 'Share'}
                  </button>
                  {d.is_shared && d.share_code && (
                    <div className={s.shareLink} onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(window.location.origin + '/anki?share=' + d.share_code); alert('Link copied!') }}>
                      Copy Link
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── browse view ── */}
      {view === 'browse' && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setActiveDeckId(null); setView('decks') }}>Decks</button>
            {activeDeckId && <span className={s.breadSep}>/</span>}
            {activeDeckId && <span className={s.breadCurrent}>{dn(activeDeckId)}</span>}
          </div>
          <div className={s.tabs}>
            <button className={`${s.tab} ${filter === 'all' ? s.tabOn : ''}`} onClick={() => setFilter('all')}>All ({all.length})</button>
            <button className={`${s.tab} ${filter === 'due' ? s.tabOn : ''}`} onClick={() => setFilter('due')}>Due ({due.length})</button>
            <button className={`${s.tab} ${filter === 'new' ? s.tabOn : ''}`} onClick={() => setFilter('new')}>New ({nw.length})</button>
            {due.length > 0 && (<button className={s.tabReview} onClick={startReview}>Review</button>)}
            <div style={{ flex: 1 }} />
            <button className={s.tabAdd} onClick={() => setView('add')}>+ Add</button>
          </div>
          <div className={s.cardList}>
            {!vis.length && (<div className={s.empty}>{filter === 'due' ? 'No cards due!' : filter === 'new' ? 'No new cards.' : 'No cards.'}</div>)}
            {vis.map(card => {
              const st = statusInfo(card)
              const r = nextReviewLabel(card)
              const isReviewing = reviewingCardId === card.id
              return (
                <div key={card.id} className={s.ankiCard}>
                  <div className={s.ankiTopRow}>
                    <div className={s.badges}>
                      <span className={`${s.badge} ${st.l === 'Due' ? s.nr_due : st.l === 'New' ? s.nr_soon : s.nr_later}`}>{st.l}</span>
                      <span className={s.badgeMaturity}>{maturityLabel(card)}</span>
                      {card.high_yield && <span className={s.badgeHY}>HY</span>}
                      {card.deck_id && <span className={s.badgeDeck}>{dn(card.deck_id)}</span>}
                      <span className={`${s.badge} ${s.badgeReview} ${getNrClass(card)}`}>{r.t}</span>
                    </div>
                    <button className={s.delBtn} onClick={() => deleteCard(card.id)}>x</button>
                  </div>
                  <div className={s.ankiFront}>{card.front}</div>
                  {isReviewing && (<div className={s.ankiBack}>{card.back}</div>)}
                  <div className={s.ankiStats}>
                    <span>D: {Number(card.difficulty || 0).toFixed(1)}</span>
                    <span>S: {Number(card.stability || 0).toFixed(1)}d</span>
                    <span>Reviews: {Number(card.reps || 0)}</span>
                    <span>Lapses: {Number(card.lapses || 0)}</span>
                  </div>
                  {isReviewing ? (
                    <div className={s.reviewBtns}>
                      {['again', 'hard', 'good', 'easy'].map(o => (
                        <button key={o} className={`${s.revBtn} ${o === 'again' ? s.rev_again : o === 'hard' ? s.rev_hard : o === 'good' ? s.rev_good : s.rev_easy}`} onClick={() => submitInlineReview(o, card)}>{o.charAt(0).toUpperCase() + o.slice(1)}</button>
                      ))}
                    </div>
                  ) : (
                    <button className={s.showAnswerBtn} onClick={() => setReviewingCardId(card.id)} style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}>Review</button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── shared/community view ── */}
      {view === 'shared' && (
        <>
          <div className={s.sharedSearchRow}>
            <input
              className={s.sharedSearchInput}
              placeholder="Search decks and cards..."
              value={sharedSearch}
              onChange={e => setSharedSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadShared(sharedSearch)}
            />
            <button className={s.sharedSearchBtn} onClick={() => loadShared(sharedSearch)}>Search</button>
          </div>

          {sharedLoading && <div className={s.loading}>Loading...</div>}

          {!sharedLoading && sharedDecks.length === 0 && sharedCards.length === 0 && (
            <div className={s.empty}>No shared decks yet. Be the first to share one!</div>
          )}

          {sharedDecks.length > 0 && (
            <div className={s.sharedSection}>
              <h3 className={s.sharedSectionTitle}>Shared Decks</h3>
              <div className={s.deckGrid}>
                {sharedDecks.map(d => (
                  <div key={d.id} className={s.deckCard} onClick={() => { setSharedViewDeck(d); loadSharedCards(d) }}>
                    <div className={s.deckTop}>
                      <span className={s.deckName}>{d.name}</span>
                    </div>
                    <div className={s.deckMeta}>
                      <span><strong>{d.card_count}</strong> cards</span>
                      {d.description && <span>{d.description.substring(0, 50)}</span>}
                    </div>
                    {!d.is_own ? (
                      <button
                        className={s.copyBtn}
                        disabled={copying === d.share_code}
                        onClick={e => { e.stopPropagation(); copyDeck(d.share_code) }}
                      >
                        {copying === d.share_code ? 'Copying...' : 'Copy to My Decks'}
                      </button>
                    ) : (
                      <div className={s.ownLabel}>Your deck</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {sharedCards.length > 0 && (
            <div className={s.sharedSection}>
              <h3 className={s.sharedSectionTitle}>Matching Cards</h3>
              <div className={s.cardList}>
                {sharedCards.map(c => (
                  <div key={c.id} className={s.ankiCard}>
                    <div className={s.ankiTopRow}>
                      <div className={s.badges}>
                        {c.high_yield && <span className={s.badgeHY}>HY</span>}
                        <span className={s.badgeDeck}>{c.deck_name}</span>
                      </div>
                    </div>
                    <div className={s.ankiFront}>{c.front}</div>
                    <div className={s.ankiBack}>{c.back}</div>
                    {!c.is_own && (
                      <button
                        className={s.copyBtn}
                        disabled={copying === c.share_code}
                        onClick={() => copyDeck(c.share_code)}
                      >
                        {copying === c.share_code ? 'Copying...' : 'Copy Deck'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* -- shared deck detail view -- */}
      {view === 'shared-view' && sharedViewDeck && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setSharedViewDeck(null); setView('shared') }}>Community</button>
            <span className={s.breadSep}>/</span>
            <span className={s.breadCurrent}>{sharedViewDeck.name}</span>
          </div>
          <div className={s.cardList}>
            {!sharedViewCards.length && <div className={s.empty}>No cards in this deck.</div>}
            {sharedViewCards.map(c => (
              <div key={c.id} className={s.ankiCard}>
                <div className={s.ankiTopRow}>
                  <div className={s.badges}>
                    {c.high_yield && <span className={s.badgeHY}>HY</span>}
                  </div>
                </div>
                <div className={s.ankiFront}>{c.front}</div>
                <div className={s.ankiBack}>{c.back}</div>
                {copyCardId === c.id ? (
                  <div className={s.copyCardRow}>
                    <select className={s.copyCardSelect} value={copyCardDeckId} onChange={e => setCopyCardDeckId(e.target.value)}>
                      <option value="">Select deck...</option>
                      {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <button className={s.copyCardBtn} disabled={copyingCard || !copyCardDeckId} onClick={() => copySingleCard(c)}>
                      {copyingCard ? '...' : 'Copy'}
                    </button>
                    <button className={s.copyCardBtn} style={{ borderColor: '#94a3b8', color: '#94a3b8' }} onClick={() => { setCopyCardId(null); setCopyCardDeckId('') }}>Cancel</button>
                  </div>
                ) : (
                  <button className={s.copyCardBtn} style={{ marginTop: '0.5rem' }} onClick={() => { setCopyCardId(c.id); setCopyCardDeckId('') }}>
                    Copy to My Deck
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      
      {view === 'add' && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => setView(activeDeckId ? 'browse' : 'decks')}>Back</button>
          </div>
          <div className={s.formCard}>
            <h3 className={s.formTitle}>Add Flashcard</h3>
            <div className={s.field}><label>Front</label><textarea rows={3} value={front} onChange={e => setFront(e.target.value)} placeholder="Question..." /></div>
            <div className={s.field}><label>Back</label><textarea rows={3} value={back} onChange={e => setBack(e.target.value)} placeholder="Answer..." /></div>
            <div className={s.field}><label>Deck</label><select value={formDeckId} onChange={e => setFormDeckId(e.target.value)}><option value="">No deck</option>{decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <label className={s.checkRow}><input type="checkbox" checked={highYield} onChange={e => setHighYield(e.target.checked)} /> High Yield</label>
            <button className={s.primaryBtn} onClick={addCard} disabled={saving || !front.trim() || !back.trim()}>{saving ? 'Saving...' : 'Add Card'}</button>
            <div className={s.uploadSection}>
              <div className={s.uploadTitle}>Import File</div>
              <div className={s.uploadDesc}>Upload .apkg, .csv, .tsv, .txt, or image files to bulk import flashcards.</div>
              {parseErr && <div className={s.parseError}>{parseErr}</div>}
              <div className={dragOver ? s.dropZone + ' ' + s.dragOver : s.dropZone} onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}>
                <input ref={fileRef} type="file" accept=".apkg,.csv,.tsv,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} style={{ display: 'none' }} />
                <div className={s.dropIcon}>{parsing ? '...' : '+'}</div>
                <div className={s.dropText}>{parsing ? uploadProgress : 'Click or drop file'}</div>
                <div className={s.dropFormats}>.apkg .csv .tsv .txt .jpg .png</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── upload preview view ── */}
      {view === 'upload' && parsed.length > 0 && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setParsed([]); setView('add') }}>Back</button>
          </div>
          <div className={s.formCard}>
            <h3 className={s.formTitle}>Import {parsed.length} Cards</h3>
            <div className={s.field}><label>Deck</label><select value={uploadDeck} onChange={e => setUploadDeck(e.target.value)}><option value="">No deck</option>{decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className={s.previewList}>
              <div className={s.previewHeader}>Showing {Math.min(parsed.length, 30)} of {parsed.length}</div>
              {parsed.slice(0, 30).map((c, i) => (
                <div key={i} className={s.previewRow}><span className={s.previewFront}>{c.front}</span><span className={s.previewArrow}>{'\u2192'}</span><span className={s.previewBack}>{c.back}</span></div>
              ))}
              {parsed.length > 30 && (<div className={s.previewMore}>+{parsed.length - 30} more</div>)}
            </div>
            <div className={s.uploadActions}>
              <button className={s.cancelBtn} onClick={() => { setParsed([]); setView('add') }}>Cancel</button>
              <button className={s.primaryBtn} onClick={importCards} disabled={importing} style={{ marginTop: 0 }}>{importing ? '...' : 'Import ' + parsed.length + ' Cards'}</button>
            </div>
          </div>
        </>
      )}

      {/* ── review session view ── */}
      {view === 'review' && cur && (
        <>
          <div className={s.reviewHeader}>
            <button className={s.exitReviewBtn} onClick={exitReview}>x</button>
            <span className={s.reviewProgress}>{qIdx + 1} / {queue.length}</span>
            <div className={s.reviewProgBar}><div className={s.reviewProgFill} style={{ width: ((qIdx + 1) / queue.length * 100) + '%' }} /></div>
          </div>
          <div className={s.reviewCard}>
            <span className={s.reviewDeckLabel}>{dn(cur.deck_id)}</span>
            <div className={s.reviewLabel}>Question</div>
            <div className={s.reviewContent}>{cur.front}</div>
            {!showAns ? (
              <button className={s.showAnswerBtn} onClick={handleShowAnswer}>Show Answer</button>
            ) : (
              <>
                <div className={s.reviewAnswer}><div className={s.reviewLabel}>Answer</div><div className={s.reviewContent}>{cur.back}</div></div>
                <div className={s.reviewMeta}>
                  <span>D: {Number(cur.difficulty || 0).toFixed(1)}</span>
                  <span>S: {Number(cur.stability || 0).toFixed(1)}d</span>
                  <span>Reviews: {Number(cur.reps || 0)}</span>
                  <span>Lapses: {Number(cur.lapses || 0)}</span>
                </div>
                <div className={s.reviewBtns}>
                  <button className={`${s.revBtn} ${s.rev_again}`} onClick={() => submitReview('again')}>{revLabel('again')}</button>
                  <button className={`${s.revBtn} ${s.rev_hard}`} onClick={() => submitReview('hard')}>{revLabel('hard')}</button>
                  <button className={`${s.revBtn} ${s.rev_good}`} onClick={() => submitReview('good')}>{revLabel('good')}</button>
                  <button className={`${s.revBtn} ${s.rev_easy}`} onClick={() => submitReview('easy')}>{revLabel('easy')}</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
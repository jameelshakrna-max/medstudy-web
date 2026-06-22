import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile } from '../lib/fileParser'
import { resizeImage } from '../lib/imageUtils'
import s from './Anki.module.css'

const API = '/api'

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return res.json()
}

async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiPut(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiDel(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return res.json()
}

/* ── helpers ────────────────────────────────────────────── */

const dm = (dks, id) => {
  if (!id) return 'Unassigned'
  const d = dks.find(x => x.id === id)
  return d ? d.name : 'Unknown'
}

function isDue(c) {
  if (!c.last_review) return true
  if (!c.next_review) return true
  return new Date(c.next_review) <= new Date()
}

function isNew(c) {
  return !c.last_review
}

function statusInfo(c) {
  const state = Number(c.state) || 0
  // FSRS states: 0=New, 1=Learning, 2=Review, 3=Relearning
  if (state === 0 || !c.last_review) return { l: 'New' }
  if (state === 1) return { l: 'Learning' }
  if (state === 3) return { l: 'Relearning' }
  if (isDue(c)) return { l: 'Due' }
  return { l: 'Later' }
}

function nextReviewLabel(c) {
  if (!c.last_review) return { t: 'Not scheduled' }
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
  const stability = Number(c.stability) || 0
  if (state === 0 || !c.last_review) return 'New'
  if (state === 1) return 'Learning'
  if (state === 3) return 'Relearning'
  if (stability <= 21) return 'Young'
  return 'Mature'
}

/* ── FSRS-5 algorithm ──────────────────────────────────── */
// Free Spaced Repetition Scheduler (FSRS-5)
// Based on the open-source FSRS algorithm by open-spaced-repetition
// https://github.com/open-spaced-repetition/fsrs4anki

// FSRS default parameters (tuned for general use)
const FSRS_DEFAULT = {
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
  requestRetention: 0.9,  // target 90% retention
  maximumInterval: 36500,  // max 100 years
  easyBonus: 1.3,
  hardInterval: 1.2,
}

// Rating enum (matches Anki FSRS)
const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 }

// FSRS states
const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 }

/**
 * Calculate retrievability (probability of recall) from stability and elapsed days
 * R = (1 + elapsed / (9 * S))^(-1)
 */
function retrievability(stability, elapsedDays) {
  if (stability <= 0) return 0
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}

/**
 * Initial difficulty for a new card based on first rating
 * D0(G) = w4 - e^(w5 * (G - 1)) + 1
 * Clamped to [1, 10]
 */
function initDifficulty(rating, w) {
  return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (rating - 1)) + 1))
}

/**
 * Initial stability for a new card based on first rating
 * S0(G) = w[G-1]  (w[0] for Again, w[1] for Hard, w[2] for Good, w[3] for Easy)
 */
function initStability(rating, w) {
  return Math.max(0.1, w[rating - 1])
}

/**
 * Next difficulty after review
 * D' = w7 * D0 + (1 - w7) * (D - 0.3 * (G - 3))
 * Clamped to [1, 10]
 */
function nextDifficulty(d, rating, w) {
  const d0 = initDifficulty(rating, w)
  const delta = 0.3 * (rating - 3)
  return Math.min(10, Math.max(1, w[7] * d0 + (1 - w[7]) * (d - delta)))
}

/**
 * Next stability after successful recall (rating >= Hard)
 * S' = S * (e^(w8) * (11 - D) * S^(-w9) * (e^(w10 * R) - 1) * hardPenalty * easyBonus + 1)
 */
function nextStabilitySuccess(d, s, r, rating, w) {
  const hardPenalty = rating === Rating.Hard ? w[15] : 1
  const easyBonus = rating === Rating.Easy ? w[16] : 1
  return s * (
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * r) - 1) *
    hardPenalty *
    easyBonus +
    1
  )
}

/**
 * Next stability after forgetting (rating = Again)
 * S' = w11 * D^(-w12) * ((S + 1)^(w13) - 1) * e^(w14 * R)
 */
function nextStabilityFail(d, s, r, w) {
  return w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * r)
}

/**
 * FSRS scheduling: compute the next review state after a rating
 * Returns { difficulty, stability, state, interval, next_review, last_review, retrievability }
 */
function fsrs(option, card) {
  const w = FSRS_DEFAULT.w
  const rating = Rating[option.charAt(0).toUpperCase() + option.slice(1)] || Rating.Good

  let d = Number(card.difficulty) || 0
  let s = Number(card.stability) || 0
  let state = Number(card.state) || State.New
  let elapsed = 0

  // Calculate elapsed days since last review
  if (card.last_review) {
    const lastDate = new Date(card.last_review)
    const now = new Date()
    elapsed = Math.max(0, (now - lastDate) / 864e5)
  }

  // Current retrievability
  const r = state === State.Review ? retrievability(s, elapsed) : 0

  if (state === State.New) {
    // First review of a new card
    d = initDifficulty(rating, w)
    s = initStability(rating, w)

    if (rating === Rating.Again) {
      state = State.Learning
    } else if (rating === Rating.Hard) {
      state = State.Learning
    } else {
      state = State.Review
    }
  } else if (state === State.Learning || state === State.Relearning) {
    // Card is in learning/relearning (short intervals)
    d = nextDifficulty(d, rating, w)

    if (rating === Rating.Again) {
      s = initStability(Rating.Again, w)
      state = State.Learning
    } else if (rating === Rating.Hard) {
      s = Math.max(initStability(Rating.Hard, w), s)
      state = State.Learning
    } else if (rating === Rating.Good) {
      s = Math.max(initStability(Rating.Good, w), s)
      state = State.Review
    } else {
      // Easy
      s = Math.max(initStability(Rating.Easy, w), s)
      state = State.Review
    }
  } else if (state === State.Review) {
    // Card is in review (long-term memory)
    d = nextDifficulty(d, rating, w)

    if (rating === Rating.Again) {
      // Failed recall → relearning
      const newS = nextStabilityFail(d, s, r, w)
      s = Math.max(0.1, Math.min(newS, s))
      state = State.Relearning
    } else {
      // Successful recall
      const newS = nextStabilitySuccess(d, s, r, rating, w)
      s = Math.max(newS, s * 1.01) // ensure stability increases
      state = State.Review
    }
  }

  // Calculate interval from stability and target retention
  let interval
  if (state === State.Learning || state === State.Relearning) {
    // Short intervals for learning: 1min → 10min (we use minutes but store as fractional days)
    if (rating === Rating.Again) interval = 1 / 1440  // ~1 minute
    else if (rating === Rating.Hard) interval = 5 / 1440  // ~5 minutes
    else if (rating === Rating.Good) interval = 10 / 1440  // ~10 minutes
    else interval = 1  // Easy → graduate to 1 day
  } else {
    // Review: interval from retrievability formula
    // I = S * 9 * (R^(-1/decay) - 1) where decay = w[10]
    // Simplified: I = S / retention_factor
    interval = Math.max(1, Math.round(
      s * 9 * (Math.pow(FSRS_DEFAULT.requestRetention, -1 / w[10]) - 1)
    ))
    interval = Math.min(interval, FSRS_DEFAULT.maximumInterval)
  }

  const nr = new Date()
  nr.setTime(nr.getTime() + interval * 864e5)

  return {
    difficulty: Math.round(d * 100) / 100,
    stability: Math.round(s * 100) / 100,
    state,
    interval: Math.round(interval * 100) / 100,
    next_review: nr.toISOString(),
    last_review: new Date().toISOString(),
    retrievability: state === State.Review
      ? Math.round(retrievability(s, 0) * 100) / 100
      : 0
  }
}

/**
 * Format an interval (in days) as a human-readable label
 * e.g. 0.0007 → "1m", 0.5 → "12h", 1 → "1d", 14 → "14d", 60 → "2mo"
 */
function formatInterval(intervalDays) {
  if (intervalDays < 1) {
    const mins = Math.round(intervalDays * 1440)
    if (mins < 60) return mins + 'm'
    const hrs = Math.round(intervalDays * 24)
    return hrs + 'h'
  }
  if (intervalDays < 30) return Math.round(intervalDays) + 'd'
  return Math.round(intervalDays / 30) + 'mo'
}

/**
 * Preview FSRS intervals for all 4 rating options
 * Returns { again: '1m', hard: '10m', good: '4d', easy: '7d' }
 */
function previewIntervals(card) {
  const labels = {}
  for (const option of ['Again', 'Hard', 'Good', 'Easy']) {
    const result = fsrs(option, card)
    labels[option.toLowerCase()] = formatInterval(result.interval)
  }
  return labels
}

/* ── component ──────────────────────────────────────────── */

export default function Anki() {
  const [cards, setCards] = useState([])
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('decks')
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [filter, setFilter] = useState('all')

  // add-card form
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [formDeckId, setFormDeckId] = useState('')
  const [highYield, setHighYield] = useState(false)
  const [saving, setSaving] = useState(false)

  // image for new card
  const [cardImage, setCardImage] = useState(null) // base64 data URL (resized)
  const imageInputRef = useRef(null)

  // create-deck form
  const [deckName, setDeckName] = useState('')
  const [savingDeck, setSavingDeck] = useState(false)

  // file upload / import
  const [parsed, setParsed] = useState([])
  const [uploadDeck, setUploadDeck] = useState('')
  const [importing, setImporting] = useState(false)
  const [parseErr, setParseErr] = useState('')
  const [parsing, setParsing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [apkgFile, setApkgFile] = useState(null)
  const fileRef = useRef(null)

  // review session
  const [queue, setQueue] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [showAns, setShowAns] = useState(false)

  // single-card inline review (browse view)
  const [reviewingCardId, setReviewingCardId] = useState(null)

  // optimistic UI: track pending review saves
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null) // { msg, type } | null

  /* ── data loading ────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [deckData, cardData] = await Promise.all([
        apiGet('/decks'),
        apiGet('/flashcards')
      ])
      if (deckData.error) throw new Error(deckData.error)
      if (cardData.error) throw new Error(cardData.error)
      setDecks(Array.isArray(deckData) ? deckData : [])
      setCards(Array.isArray(cardData) ? cardData : [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* ── derived data ────────────────────────────────────── */

  const all = useMemo(() => activeDeckId ? cards.filter(c => c.deck_id === activeDeckId) : cards, [cards, activeDeckId])
  const due = useMemo(() => all.filter(c => isDue(c)), [all])
  const nw = useMemo(() => all.filter(c => isNew(c)), [all])
  const vis = useMemo(() => filter === 'due' ? due : filter === 'new' ? nw : all, [filter, due, nw, all])
  const dn = useCallback(id => dm(decks, id), [decks])

  /* ── deck actions ────────────────────────────────────── */

  async function createDeck() {
    if (!deckName.trim()) return
    setSavingDeck(true)
    try {
      const r = await apiPost('/decks', { name: deckName.trim() })
      if (r.error) throw new Error(r.error)
      setDeckName('')
      load()
    } catch (e) { alert(e.message) }
    setSavingDeck(false)
  }

  async function deleteDeck(id) {
    if (!confirm('Delete deck and all its cards?')) return
    try {
      const r = await apiDel('/decks/' + id)
      if (r.error) throw new Error(r.error)
      if (activeDeckId === id) {
        setActiveDeckId(null)
        setView('decks')
      }
      load()
    } catch (e) { alert(e.message) }
  }

  /* ── card actions ────────────────────────────────────── */

  async function addCard() {
    if (!front.trim() || !back.trim()) return
    if (!formDeckId) return alert('Please select or create a deck first.')
    setSaving(true)
    try {
      const r = await apiPost('/flashcards', {
        deck_id: formDeckId,
        front: front.trim(),
        back: back.trim(),
        high_yield: highYield,
        image_url: cardImage || null  // base64 data URL goes straight to Turso
      })
      if (r.error) throw new Error(r.error)
      setFront('')
      setBack('')
      setHighYield(false)
      setCardImage(null)
      load()
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return
    try {
      const r = await apiDel('/flashcards/' + id)
      if (r.error) throw new Error(r.error)
      load()
    } catch (e) { alert(e.message) }
  }

  /* ── review (queued session) ─────────────────────────── */

  function startReview() {
    if (due.length) {
      setQueue(due)
      setQIdx(0)
      setShowAns(false)
      setView('review')
    }
  }

  async function submitReview(option) {
    const c = queue[qIdx]
    if (!c) return
    const u = fsrs(option, c)

    // ── OPTIMISTIC: advance UI immediately ──
    const nextIdx = qIdx + 1
    const isLast = nextIdx >= queue.length

    if (isLast) {
      setView(activeDeckId ? 'browse' : 'decks')
    } else {
      setQIdx(nextIdx)
      setShowAns(false)
    }
    setSubmitting(true)

    // ── BACKGROUND: save to server ──
    try {
      const r = await apiPut('/flashcards/' + c.id, {
        difficulty: u.difficulty,
        stability: u.stability,
        state: u.state,
        interval: u.interval,
        next_review: u.next_review,
        last_review: u.last_review
      })
      if (r.error) throw new Error(r.error)
      // success — reload data silently to sync DB state
      if (isLast) load()
    } catch (e) {
      // failed — show toast, don't block the user
      setToast({ msg: 'Save failed: ' + e.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    }
    setSubmitting(false)
  }

  function exitReview() {
    setQueue([])
    setQIdx(0)
    setShowAns(false)
    setView(activeDeckId ? 'browse' : 'decks')
    load()
  }

  /* ── inline review (single card in browse view) ──────── */

  async function submitInlineReview(option, card) {
    const u = fsrs(option, card)

    // ── OPTIMISTIC: close the review UI immediately ──
    setReviewingCardId(null)
    setSubmitting(true)

    // ── BACKGROUND: save to server ──
    try {
      const r = await apiPut('/flashcards/' + card.id, {
        difficulty: u.difficulty,
        stability: u.stability,
        state: u.state,
        interval: u.interval,
        next_review: u.next_review,
        last_review: u.last_review
      })
      if (r.error) throw new Error(r.error)
      // success — reload silently
      load()
    } catch (e) {
      // failed — show toast
      setToast({ msg: 'Save failed: ' + e.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
      // restore the review state so user can retry
      setReviewingCardId(card.id)
    }
    setSubmitting(false)
  }

  /* ── file upload / import ────────────────────────────── */

  async function uploadApkg() {
    if (!apkgFile || !uploadDeck) return alert('Please select a deck.')
    setParsing(true)
    setParseErr('')
    setUploadProgress('Uploading to server...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body = new FormData()
      body.append('file', apkgFile)
      body.append('deck_id', uploadDeck)
      const res = await fetch('/api/import/apkg', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
        body,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Upload failed')
      setApkgFile(null)
      setParsed([])
      setUploadDeck('')
      load()
      setView(activeDeckId ? 'browse' : 'decks')
    } catch (e) { setParseErr(e.message) }
    setParsing(false)
  }

  async function handleFile(file) {
    if (!file) return

    if (file.name.toLowerCase().endsWith('.apkg') || file.name.toLowerCase().endsWith('.colpkg')) {
      setApkgFile(file)
      setUploadDeck(activeDeckId || '')
      setParseErr('')
      setView('upload')
      return
    }

    if (file.type.startsWith('image/')) {
      try {
        const dataUrl = await resizeImage(file)
        setCardImage(dataUrl)
        setView('add')
      } catch { alert('Failed to process image') }
      return
    }

    setParsing(true)
    setParseErr('')
    setUploadProgress('Parsing file...')
    try {
      const r = await parseFile(file)
      if (!r.length) {
        setParseErr('No cards found.')
        setParsing(false)
        return
      }
      setParsed(r)
      setUploadDeck(activeDeckId || '')
      setView('upload')
    } catch (e) { setParseErr(e.message) }
    setParsing(false)
  }

  async function importCards() {
    if (!parsed.length) return
    if (!uploadDeck) return alert('Please select a deck.')
    setImporting(true)
    try {
      const withDeck = parsed.map(c => ({
        front: c.front,
        back: c.back,
        deck_id: uploadDeck,
        image_url: c.image_url || null
      }))
      const r = await apiPost('/flashcards', { cards: withDeck })
      if (r.error) throw new Error(r.error)
      setParsed([])
      setUploadDeck('')
      load()
      setView(activeDeckId ? 'browse' : 'decks')
    } catch (e) { alert(e.message) }
    setImporting(false)
  }

  /* ── early returns ───────────────────────────────────── */

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

  /* ── render helpers ──────────────────────────────────── */

  const cur = queue[qIdx]
  const getNrClass = c => {
    const st = statusInfo(c)
    return st.l === 'Due' || st.l === 'Learning' || st.l === 'Relearning'
      ? s.nr_due
      : st.l === 'New'
        ? s.nr_soon
        : s.nr_later
  }

  /**
   * Format interval for display
   */
  function intervalLabel(c) {
    const iv = Number(c.interval) || 0
    if (iv < 1) return Math.round(iv * 1440) + 'm'  // minutes
    if (iv < 30) return Math.round(iv) + 'd'
    return Math.round(iv / 30) + 'mo'
  }

  /* ── render ──────────────────────────────────────────── */

  return (
    <div className={s.page}>
      {/* header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Anki</h1>
          <p className={s.sub}>Spaced repetition — FSRS{submitting && <span className={s.savingDot} />}</p>
        </div>
        <div className={s.pills}>
          {[
            { n: decks.length, l: 'decks' },
            { n: cards.length, l: 'cards' },
            { n: due.length, l: 'due' },
            { n: nw.length, l: 'new' }
          ].map(t => (
            <span key={t.l} className={s.pill}>
              <strong>{t.n}</strong> {t.l}
            </span>
          ))}
        </div>
      </div>

      {/* ── decks view ──────────────────────────────────── */}
      {view === 'decks' && (
        <>
          <div className={s.createDeckRow}>
            <input
              className={s.createDeckInput}
              value={deckName}
              onChange={e => setDeckName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createDeck()}
              placeholder="New deck name..."
              maxLength={80}
            />
            <button
              className={s.createDeckBtn}
              onClick={createDeck}
              disabled={savingDeck || !deckName.trim()}
            >
              {savingDeck ? '...' : '+ Deck'}
            </button>
          </div>

          {due.length > 0 && (
            <button className={s.reviewAllBtn} onClick={startReview}>
              Review {due.length} Due Card{due.length > 1 ? 's' : ''}
            </button>
          )}

          <div className={s.deckGrid}>
            {/* all-cards card */}
            <div
              className={s.deckCard}
              onClick={() => { setActiveDeckId(null); setFilter('all'); setView('browse') }}
            >
              <div className={s.deckTop}>
                <span className={s.deckName}>All Cards</span>
              </div>
              <div className={s.deckMeta}>
                <span><strong>{cards.length}</strong> total</span>
                <span><strong>{due.length}</strong> due</span>
                <span><strong>{nw.length}</strong> new</span>
              </div>
              {cards.length > 0 && (
                <div className={s.progBar}>
                  <div
                    className={s.progFill}
                    style={{
                      width: Math.round(due.length / cards.length * 100) + '%',
                      background: 'var(--blue)'
                    }}
                  />
                </div>
              )}
            </div>

            {!decks.length && (
              <div className={s.empty}>
                No decks yet. Create your first deck to get started!
              </div>
            )}

            {decks.map(d => {
              const dc = cards.filter(c => c.deck_id === d.id)
              const dd = dc.filter(c => isDue(c))
              return (
                <div
                  key={d.id}
                  className={s.deckCard}
                  onClick={() => { setActiveDeckId(d.id); setFilter('all'); setView('browse') }}
                >
                  <button
                    className={s.deckDelBtn}
                    onClick={e => { e.stopPropagation(); deleteDeck(d.id) }}
                    title="Delete"
                  >
                    x
                  </button>
                  <div className={s.deckTop}>
                    <span className={s.deckName}>{d.name}</span>
                  </div>
                  <div className={s.deckMeta}>
                    <span><strong>{dc.length}</strong> total</span>
                    <span><strong>{dd.length}</strong> due</span>
                  </div>
                  {dc.length > 0 && (
                    <div className={s.progBar}>
                      <div
                        className={s.progFill}
                        style={{
                          width: Math.round(dd.length / dc.length * 100) + '%',
                          background: 'var(--indigo)'
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── browse view ─────────────────────────────────── */}
      {view === 'browse' && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setActiveDeckId(null); setView('decks') }}>
              Decks
            </button>
            {activeDeckId && <span className={s.breadSep}>/</span>}
            {activeDeckId && <span className={s.breadCurrent}>{dn(activeDeckId)}</span>}
          </div>

          <div className={s.tabs}>
            <button className={`${s.tab} ${filter === 'all' ? s.tabOn : ''}`} onClick={() => setFilter('all')}>
              All ({all.length})
            </button>
            <button className={`${s.tab} ${filter === 'due' ? s.tabOn : ''}`} onClick={() => setFilter('due')}>
              Due ({due.length})
            </button>
            <button className={`${s.tab} ${filter === 'new' ? s.tabOn : ''}`} onClick={() => setFilter('new')}>
              New ({nw.length})
            </button>
            {due.length > 0 && (
              <button className={s.tabReview} onClick={startReview}>Review</button>
            )}
            <div style={{ flex: 1 }} />
            <button className={s.tabAdd} onClick={() => setView('add')}>+ Add</button>
          </div>

          <div className={s.cardList}>
            {!vis.length && (
              <div className={s.empty}>
                {filter === 'due' ? 'No cards due!' : filter === 'new' ? 'No new cards.' : 'No cards.'}
              </div>
            )}

            {vis.map(card => {
              const st = statusInfo(card)
              const r = nextReviewLabel(card)
              const isReviewing = reviewingCardId === card.id

              return (
                <div key={card.id} className={s.ankiCard}>
                  <div className={s.ankiTopRow}>
                    <div className={s.badges}>
                      <span className={`${s.badge} ${st.l === 'Due' || st.l === 'Learning' || st.l === 'Relearning' ? s.nr_due : st.l === 'New' ? s.nr_soon : s.nr_later}`}>
                        {st.l}
                      </span>
                      <span className={s.badgeMaturity}>{maturityLabel(card)}</span>
                      {card.high_yield && <span className={s.badgeHY}>HY</span>}
                      {card.deck_id && <span className={s.badgeDeck}>{dn(card.deck_id)}</span>}
                      <span className={`${s.badge} ${s.badgeReview} ${getNrClass(card)}`}>
                        {r.t}
                      </span>
                    </div>
                    <button className={s.delBtn} onClick={() => deleteCard(card.id)}>x</button>
                  </div>

                  <div className={s.ankiFront}>{card.front}</div>

                  {isReviewing && (
                    <div className={s.ankiBack}>
                      {card.back}
                      {card.image_url && (
                        <div className={s.cardImage}>
                          <img src={card.image_url} alt="card" loading="lazy" />
                        </div>
                      )}
                    </div>
                  )}

                  <div className={s.ankiStats}>
                    <span>D: {Number(card.difficulty || 0).toFixed(1)}</span>
                    <span>S: {Number(card.stability || 0).toFixed(1)}d</span>
                    <span>State: {['New', 'Learn', 'Review', 'Relearn'][Number(card.state) || 0]}</span>
                    <span>Next: {card.next_review ? nextReviewLabel(card).t : '--'}</span>
                  </div>

                  {isReviewing ? (
                    <div className={s.reviewBtns}>
                      <button className={`${s.revBtn} ${s.rev_again}`} onClick={() => submitInlineReview('again', card)}>
                        Again<span className={s.revInterval}>{previewIntervals(card).again}</span>
                      </button>
                      <button className={`${s.revBtn} ${s.rev_hard}`} onClick={() => submitInlineReview('hard', card)}>
                        Hard<span className={s.revInterval}>{previewIntervals(card).hard}</span>
                      </button>
                      <button className={`${s.revBtn} ${s.rev_good}`} onClick={() => submitInlineReview('good', card)}>
                        Good<span className={s.revInterval}>{previewIntervals(card).good}</span>
                      </button>
                      <button className={`${s.revBtn} ${s.rev_easy}`} onClick={() => submitInlineReview('easy', card)}>
                        Easy<span className={s.revInterval}>{previewIntervals(card).easy}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      className={s.showAnswerBtn}
                      onClick={() => setReviewingCardId(card.id)}
                      style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
                    >
                      Review
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── add card view ───────────────────────────────── */}
      {view === 'add' && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => setView(activeDeckId ? 'browse' : 'decks')}>
              Back
            </button>
          </div>

          <div className={s.formCard}>
            <h3 className={s.formTitle}>Add Flashcard</h3>

            <div className={s.field}>
              <label>Front</label>
              <textarea
                rows={3}
                value={front}
                onChange={e => setFront(e.target.value)}
                placeholder="Question..."
              />
            </div>

            <div className={s.field}>
              <label>Back</label>
              <textarea
                rows={3}
                value={back}
                onChange={e => setBack(e.target.value)}
                placeholder="Answer..."
              />
            </div>

            <div className={s.field}>
              <label>Deck</label>
              <select value={formDeckId} onChange={e => setFormDeckId(e.target.value)}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <label className={s.checkRow}>
              <input type="checkbox" checked={highYield} onChange={e => setHighYield(e.target.checked)} />
              High Yield
            </label>

            <div className={s.field}>
              <label>Image (optional)</label>
              <div className={s.imageUploadRow}>
                <button
                  type="button"
                  className={s.secondaryBtn}
                  onClick={() => imageInputRef.current?.click()}
                  disabled={saving}
                >
                  {cardImage ? 'Change Image' : 'Add Image'}
                </button>
                {cardImage && (
                  <button
                    type="button"
                    className={s.removeImageBtn}
                    onClick={() => setCardImage(null)}
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      if (f.size > 10 * 1024 * 1024) {
                        alert('Image too large. Max 10MB.')
                        return
                      }
                      try {
                        const dataUrl = await resizeImage(f)
                        setCardImage(dataUrl)
                      } catch (err) {
                        alert('Failed to process image')
                      }
                    }
                    e.target.value = ''
                  }}
                />
              </div>
              {cardImage && (
                <div className={s.imagePreview}>
                  <img src={cardImage} alt="preview" />
                </div>
              )}
            </div>

            <button
              className={s.primaryBtn}
              onClick={addCard}
              disabled={saving || !front.trim() || !back.trim()}
            >
              {saving ? 'Saving...' : 'Add Card'}
            </button>

            <div className={s.uploadSection}>
              <div className={s.uploadTitle}>Import File</div>
              <div className={s.uploadDesc}>
                Upload .apkg, .csv, .tsv, .txt, or image files to bulk import
                flashcards. Supports OCR for English + Arabic.
              </div>

              {parseErr && <div className={s.parseError}>{parseErr}</div>}

              <div
                className={dragOver ? s.dropZone + ' ' + s.dragOver : s.dropZone}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".apkg,.csv,.tsv,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
                <div className={s.dropIcon}>{parsing ? '...' : '+'}</div>
                <div className={s.dropText}>{parsing ? uploadProgress : 'Click or drop file'}</div>
                <div className={s.dropFormats}>.apkg .csv .tsv .txt .jpg .png</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── upload preview view ─────────────────────────── */}
      {view === 'upload' && (parsed.length > 0 || apkgFile) && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setApkgFile(null); setParsed([]); setView('add') }}>
              Back
            </button>
          </div>

          <div className={s.formCard}>
            <h3 className={s.formTitle}>
              {apkgFile ? 'Import .apkg File' : 'Import ' + parsed.length + ' Cards'}
            </h3>

            <div className={s.field}>
              <label>Deck</label>
              <select value={uploadDeck} onChange={e => setUploadDeck(e.target.value)}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {apkgFile && !parsing && (
              <div className={s.uploadActions}>
                <button className={s.primaryBtn} onClick={uploadApkg} style={{ marginTop: 0 }}>
                  Upload to Server
                </button>
              </div>
            )}

            {parsing && <div className={s.parseError}>{uploadProgress}</div>}

            {parseErr && <div className={s.parseError}>{parseErr}</div>}

            {!apkgFile && parsed.length > 0 && (
              <>
                <div className={s.previewList}>
                  <div className={s.previewHeader}>
                    Showing {Math.min(parsed.length, 30)} of {parsed.length}
                  </div>
                  {parsed.slice(0, 30).map((c, i) => (
                    <div key={i} className={s.previewRow}>
                      <span className={s.previewFront}>
                        {c.front}
                        {c.image_url && <img src={c.image_url} alt="" style={{ maxWidth: 40, maxHeight: 30, borderRadius: 4, marginLeft: 6, verticalAlign: 'middle' }} />}
                      </span>
                      <span className={s.previewArrow}>{'\u2192'}</span>
                      <span className={s.previewBack}>{c.back}</span>
                    </div>
                  ))}
                  {parsed.length > 30 && (
                    <div className={s.previewMore}>+{parsed.length - 30} more</div>
                  )}
                </div>

                <div className={s.uploadActions}>
                  <button className={s.primaryBtn} onClick={importCards} disabled={importing} style={{ marginTop: 0 }}>
                    {importing ? '...' : 'Import ' + parsed.length + ' Cards'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── review session view ─────────────────────────── */}
      {view === 'review' && cur && (
        <>
          <div className={s.reviewHeader}>
            <button className={s.exitReviewBtn} onClick={exitReview}>x</button>
            <span className={s.reviewProgress}>{qIdx + 1} / {queue.length}</span>
            <div className={s.reviewProgBar}>
              <div
                className={s.reviewProgFill}
                style={{ width: ((qIdx + 1) / queue.length * 100) + '%' }}
              />
            </div>
          </div>

          <div className={s.reviewCard}>
            <span className={s.reviewDeckLabel}>{dn(cur.deck_id)}</span>

            <div className={s.reviewLabel}>Question</div>
            <div className={s.reviewContent}>{cur.front}</div>

            {!showAns ? (
              <button className={s.showAnswerBtn} onClick={() => setShowAns(true)}>
                Show Answer
              </button>
            ) : (
              <>
                <div className={s.reviewAnswer}>
                  <div className={s.reviewLabel}>Answer</div>
                  <div className={s.reviewContent}>{cur.back}</div>
                  {cur.image_url && (
                    <div className={s.cardImage}>
                      <img src={cur.image_url} alt="card" loading="lazy" />
                    </div>
                  )}
                </div>

                <div className={s.reviewMeta}>
                  <span>D: {Number(cur.difficulty || 0).toFixed(1)}</span>
                  <span>S: {Number(cur.stability || 0).toFixed(1)}d</span>
                  <span>State: {['New', 'Learn', 'Review', 'Relearn'][Number(cur.state) || 0]}</span>
                </div>

                <div className={s.reviewBtns}>
                  <button className={`${s.revBtn} ${s.rev_again}`} onClick={() => submitReview('again')}>
                    Again<span className={s.revInterval}>{previewIntervals(cur).again}</span>
                  </button>
                  <button className={`${s.revBtn} ${s.rev_hard}`} onClick={() => submitReview('hard')}>
                    Hard<span className={s.revInterval}>{previewIntervals(cur).hard}</span>
                  </button>
                  <button className={`${s.revBtn} ${s.rev_good}`} onClick={() => submitReview('good')}>
                    Good<span className={s.revInterval}>{previewIntervals(cur).good}</span>
                  </button>
                  <button className={`${s.revBtn} ${s.rev_easy}`} onClick={() => submitReview('easy')}>
                    Easy<span className={s.revInterval}>{previewIntervals(cur).easy}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── toast notification ── */}
      {toast && (
        <div className={`${s.toast} ${toast.type === 'error' ? s.toastError : ''}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

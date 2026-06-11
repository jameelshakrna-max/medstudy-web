import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile } from '../lib/fileParser'
import s from './Anki.module.css'

const API = '/api'

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

async function apiGet(path) {
  const session = await getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return res.json()
}

async function apiPost(path, body) {
  const session = await getSession()
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
  const session = await getSession()
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
  const session = await getSession()
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
  if (!c.last_review) return { l: 'New' }
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
  const r = Number(c.repetitions) || 0
  const iv = Number(c.interval) || 0
  if (r === 0) return 'New'
  if (r === 1) return 'Learning'
  if (iv <= 21) return 'Young'
  return 'Mature'
}

/* ── SM-2 algorithm ─────────────────────────────────────── */

function sm2(option, card) {
  const qMap = { again: 1, hard: 3, good: 4, easy: 5 }
  const quality = qMap[option] || 3

  let ease_factor = Number(card.ease_factor) || 2.5
  let interval = Number(card.interval) || 0
  let repetitions = Number(card.repetitions) || 0

  if (quality >= 3) {
    if (quality === 5 && repetitions === 0) {
      interval = 6
      repetitions = 2
    } else if (repetitions === 0) {
      interval = 1
      repetitions = 1
    } else if (repetitions === 1) {
      interval = 6
      repetitions = 2
    } else {
      interval = Math.round(interval * ease_factor)
      repetitions += 1
    }
  } else {
    repetitions = 0
    interval = 1
  }

  ease_factor = Math.max(
    1.3,
    ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  )

  const nr = new Date()
  nr.setDate(nr.getDate() + interval)

  return {
    ease_factor,
    interval,
    repetitions,
    next_review: nr.toISOString(),
    last_review: new Date().toISOString()
  }
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

  const all = activeDeckId ? cards.filter(c => c.deck_id === activeDeckId) : cards
  const due = all.filter(c => isDue(c))
  const nw = all.filter(c => isNew(c))
  const vis = filter === 'due' ? due : filter === 'new' ? nw : all
  const dn = id => dm(decks, id)

  /* ── deck actions ────────────────────────────────────── */

  async function createDeck() {
    if (!deckName.trim()) return
    setSavingDeck(true)
    try {
      const r = await apiPost('/decks', { name: deckName.trim() })
      if (r.error) throw new Error(r.error)
      setDecks(prev => [...prev, r])
      setDeckName('')
    } catch (e) { alert(e.message) }
    setSavingDeck(false)
  }

  async function deleteDeck(id) {
    if (!confirm('Delete deck and all its cards?')) return
    try {
      const r = await apiDel('/decks/' + id)
      if (r.error) throw new Error(r.error)
      setDecks(prev => prev.filter(d => d.id !== id))
      setCards(prev => prev.filter(c => c.deck_id !== id))
      if (activeDeckId === id) {
        setActiveDeckId(null)
        setView('decks')
      }
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
        high_yield: highYield
      })
      if (r.error) throw new Error(r.error)
      setCards(prev => [...prev, r])
      setFront('')
      setBack('')
      setHighYield(false)
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return
    try {
      const r = await apiDel('/flashcards/' + id)
      if (r.error) throw new Error(r.error)
      setCards(prev => prev.filter(c => c.id !== id))
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
    const u = sm2(option, c)
    const updated = { ...c, ...u }
    try {
      const r = await apiPut('/flashcards/' + c.id, u)
      if (r.error) throw new Error(r.error)
      setCards(prev => prev.map(card => card.id === c.id ? { ...card, ...r } : card))
      if (qIdx + 1 < queue.length) {
        setQIdx(qIdx + 1)
        setShowAns(false)
      } else {
        setView(activeDeckId ? 'browse' : 'decks')
      }
    } catch (e) { alert(e.message) }
  }

  function exitReview() {
    setQueue([])
    setQIdx(0)
    setShowAns(false)
    setView(activeDeckId ? 'browse' : 'decks')
  }

  /* ── inline review (single card in browse view) ──────── */

  async function submitInlineReview(option, card) {
    const u = sm2(option, card)
    try {
      const r = await apiPut('/flashcards/' + card.id, u)
      if (r.error) throw new Error(r.error)
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...r } : c))
      setReviewingCardId(null)
    } catch (e) { alert(e.message) }
  }

  /* ── file upload / import ────────────────────────────── */

  async function handleFile(file) {
    if (!file) return
    setParsing(true)
    setParseErr('')
    setUploadProgress('Parsing file...')
    try {
      const r = await parseFile(file, m => setUploadProgress(m))
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
        deck_id: uploadDeck
      }))
      const r = await apiPost('/flashcards', { cards: withDeck })
      if (r.error) throw new Error(r.error)
      const newCards = Array.isArray(r) ? r : [r]
      setCards(prev => [...prev, ...newCards])
      setParsed([])
      setUploadDeck('')
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
    return st.l === 'Due' ? s.nr_due : st.l === 'New' ? s.nr_soon : s.nr_later
  }

  /* ── render ──────────────────────────────────────────── */

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Anki</h1>
          <p className={s.sub}>Spaced repetition — SM-2</p>
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
                      background: 'var(--teal)'
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
                          background: 'var(--violet)'
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
                      <span className={`${s.badge} ${st.l === 'Due' ? s.nr_due : st.l === 'New' ? s.nr_soon : s.nr_later}`}>
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
                    <div className={s.ankiBack}>{card.back}</div>
                  )}

                  <div className={s.ankiStats}>
                    <span>EF: {Number(card.ease_factor || 2.5).toFixed(2)}</span>
                    <span>Interval: {Number(card.interval) || 0}d</span>
                    <span>Reviews: {Number(card.repetitions) || 0}</span>
                    <span>Next: {card.next_review ? nextReviewLabel(card).t : '--'}</span>
                  </div>

                  {isReviewing ? (
                    <div className={s.reviewBtns}>
                      {['again', 'hard', 'good', 'easy'].map(o => (
                        <button
                          key={o}
                          className={`${s.revBtn} ${o === 'again' ? s.rev_again : o === 'hard' ? s.rev_hard : o === 'good' ? s.rev_good : s.rev_easy}`}
                          onClick={() => submitInlineReview(o, card)}
                        >
                          {o.charAt(0).toUpperCase() + o.slice(1)}
                        </button>
                      ))}
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

      {view === 'upload' && parsed.length > 0 && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setParsed([]); setView('add') }}>
              Back
            </button>
          </div>

          <div className={s.formCard}>
            <h3 className={s.formTitle}>Import {parsed.length} Cards</h3>

            <div className={s.field}>
              <label>Deck</label>
              <select value={uploadDeck} onChange={e => setUploadDeck(e.target.value)}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className={s.previewList}>
              <div className={s.previewHeader}>
                Showing {Math.min(parsed.length, 30)} of {parsed.length}
              </div>
              {parsed.slice(0, 30).map((c, i) => (
                <div key={i} className={s.previewRow}>
                  <span className={s.previewFront}>{c.front}</span>
                  <span className={s.previewArrow}>{'\u2192'}</span>
                  <span className={s.previewBack}>{c.back}</span>
                </div>
              ))}
              {parsed.length > 30 && (
                <div className={s.previewMore}>+{parsed.length - 30} more</div>
              )}
            </div>

            <div className={s.uploadActions}>
              <button className={s.cancelBtn} onClick={() => { setParsed([]); setView('add') }}>
                Cancel
              </button>
              <button
                className={s.primaryBtn}
                onClick={importCards}
                disabled={importing}
                style={{ marginTop: 0 }}
              >
                {importing ? '...' : 'Import ' + parsed.length + ' Cards'}
              </button>
            </div>
          </div>
        </>
      )}

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
                </div>

                <div className={s.reviewMeta}>
                  <span>EF: {Number(cur.ease_factor || 2.5).toFixed(2)}</span>
                  <span>Interval: {Number(cur.interval) || 0}d</span>
                  <span>Reviews: {Number(cur.repetitions) || 0}</span>
                </div>

                <div className={s.reviewBtns}>
                  <button className={`${s.revBtn} ${s.rev_again}`} onClick={() => submitReview('again')}>Again</button>
                  <button className={`${s.revBtn} ${s.rev_hard}`} onClick={() => submitReview('hard')}>Hard</button>
                  <button className={`${s.revBtn} ${s.rev_good}`} onClick={() => submitReview('good')}>Good</button>
                  <button className={`${s.revBtn} ${s.rev_easy}`} onClick={() => submitReview('easy')}>Easy</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
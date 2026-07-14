import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { FSRS, Card as FSRSCard, State as FSRSState, Rating as FSRSRating } from 'fsrs.js'
import { Maximize2, Minimize2 } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import s from './Anki.module.css'

const fsrsInstance = new FSRS()

function fsrs(option, card) {
  const now = new Date()
  const c = new FSRSCard()
  c.stability = Number(card.stability) || 0
  c.difficulty = Number(card.difficulty) || 0
  c.state = Number(card.state) || FSRSState.New
  c.last_review = card.last_review ? new Date(card.last_review) : now
  c.due = card.next_review ? new Date(card.next_review) : now

  // Normalize inconsistent data: Review/Learning/Relearning state requires positive stability
  if (c.state !== FSRSState.New && c.stability <= 0) {
    c.state = FSRSState.New
  }

  const ratingMap = { again: FSRSRating.Again, hard: FSRSRating.Hard, good: FSRSRating.Good, easy: FSRSRating.Easy }
  const rating = ratingMap[option]
  if (rating === undefined) throw new Error('Invalid rating: ' + option)

  const result = fsrsInstance.repeat(c, now)
  const info = result[rating]
  const interval = (info.card.due.getTime() - now.getTime()) / 864e5

  return {
    difficulty: Math.round(info.card.difficulty * 100) / 100,
    stability: Math.round(info.card.stability * 100) / 100,
    state: info.card.state,
    interval: Math.round(interval * 100) / 100,
    next_review: info.card.due.toISOString(),
    last_review: now.toISOString(),
    retrievability: 1
  }
}

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

function previewIntervals(card) {
  const labels = {}
  for (const option of ['again', 'hard', 'good', 'easy']) {
    const result = fsrs(option, card)
    labels[option] = formatInterval(result.interval)
  }
  return labels
}

const API = import.meta.env.VITE_API_URL || '/api'

async function apiJson(res) {
  if (!res.ok) {
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text).error || text } catch { msg = text.slice(0, 300) }
    throw new Error(msg || `Request failed (${res.status})`)
  }
  const text = await res.text()
  try { return JSON.parse(text) } catch {
    console.error('API response not JSON:', res.status, res.headers.get('content-type'), text.slice(0, 500))
    throw new Error(text.slice(0, 300))
  }
}

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

async function apiPost(path, body, signal) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token
    },
    body: JSON.stringify(body),
    signal,
  })
  return apiJson(res)
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
  return apiJson(res)
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

const nowRef = { current: new Date() }

const dm = (dks, id) => {
  if (!id) return 'Unassigned'
  const d = dks.find(x => x.id === id)
  return d ? d.name : 'Unknown'
}

function isDue(c) {
  if (!c.last_review) return true
  if (!c.next_review) return true
  return c.next_review <= nowRef.current.toISOString()
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

/* ── component ──────────────────────────────────────────── */

export default function Anki() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

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
  const abortRef = useRef(null)
  const [compact, setCompact] = useState(true)
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

  /* ── queries ────────────────────────────────────────── */

  const { data: decks = [], isLoading: decksLoading, isError: decksError, error: decksErrorObj } = useQuery({
    queryKey: queryKeys.flashcards.decks(),
    queryFn: () => apiGet('/decks'),
    enabled: !!user,
    staleTime: 60_000,
  })

  const { data: cards = [], isLoading: cardsLoading, isError: cardsError, error: cardsErrorObj } = useQuery({
    queryKey: queryKeys.flashcards.list(),
    queryFn: () => apiGet('/flashcards'),
    enabled: !!user,
    staleTime: 30_000,
  })

  const loading = decksLoading || cardsLoading

  /* ── mutations ──────────────────────────────────────── */

  const createDeckMutation = useMutation({
    mutationFn: async (name) => {
      const r = await apiPost('/decks', { name })
      if (r.error) throw new Error(r.error)
      return r
    },
    onSuccess: () => queryClient.invalidateQueries(queryKeys.flashcards.decks()),
  })

  const deleteDeckMutation = useMutation({
    mutationFn: async (id) => {
      const r = await apiDel('/decks/' + id)
      if (r.error) throw new Error(r.error)
      return r
    },
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.flashcards.decks())
      queryClient.invalidateQueries(queryKeys.flashcards.list())
    },
  })

  const addCardMutation = useMutation({
    mutationFn: async (body) => {
      const r = await apiPost('/flashcards', body)
      if (r.error) throw new Error(r.error)
      return r
    },
    onSuccess: () => queryClient.invalidateQueries(queryKeys.flashcards.list()),
  })

  const deleteCardMutation = useMutation({
    mutationFn: async (id) => {
      const r = await apiDel('/flashcards/' + id)
      if (r.error) throw new Error(r.error)
      return r
    },
    onSuccess: () => queryClient.invalidateQueries(queryKeys.flashcards.list()),
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const r = await apiPut('/flashcards/' + id, updates)
      if (r.error) throw new Error(r.error)
      return r
    },
    onSuccess: () => queryClient.invalidateQueries(queryKeys.flashcards.list()),
  })

  // keep nowRef current for isDue checks
  useEffect(() => {
    const t = setInterval(() => { nowRef.current = new Date() }, 60000)
    return () => clearInterval(t)
  }, [])

  /* ── derived data ────────────────────────────────────── */

  const deckCardsMap = useMemo(() => {
    const map = new Map()
    for (const card of cards) {
      const list = map.get(card.deck_id)
      if (list) list.push(card)
      else map.set(card.deck_id, [card])
    }
    return map
  }, [cards])

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
      await createDeckMutation.mutateAsync(deckName.trim())
      setDeckName('')
    } catch (e) { alert(e.message) }
    setSavingDeck(false)
  }

  async function deleteDeck(id) {
    if (!confirm('Delete deck and all its cards?')) return
    try {
      await deleteDeckMutation.mutateAsync(id)
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
      await addCardMutation.mutateAsync({
        deck_id: formDeckId,
        front: front.trim(),
        back: back.trim(),
        high_yield: highYield,
        image_url: cardImage || null
      })
      setFront('')
      setBack('')
      setHighYield(false)
      setCardImage(null)
      setView('add')
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return
    try {
      await deleteCardMutation.mutateAsync(id)
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

    const nextIdx = qIdx + 1
    const isLast = nextIdx >= queue.length

    if (isLast) {
      setView(activeDeckId ? 'browse' : 'decks')
    } else {
      setQIdx(nextIdx)
      setShowAns(false)
    }
    setSubmitting(true)

    try {
      await reviewMutation.mutateAsync({
        id: c.id,
        difficulty: u.difficulty,
        stability: u.stability,
        state: u.state,
        interval: u.interval,
        next_review: u.next_review,
        last_review: u.last_review
      })
    } catch (e) {
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
    queryClient.invalidateQueries(queryKeys.flashcards.decks())
    queryClient.invalidateQueries(queryKeys.flashcards.list())
  }

  /* ── inline review (single card in browse view) ──────── */

  async function submitInlineReview(option, card) {
    const u = fsrs(option, card)

    setReviewingCardId(null)
    setSubmitting(true)

    try {
      await reviewMutation.mutateAsync({
        id: card.id,
        difficulty: u.difficulty,
        stability: u.stability,
        state: u.state,
        interval: u.interval,
        next_review: u.next_review,
        last_review: u.last_review
      })
    } catch (e) {
      setToast({ msg: 'Save failed: ' + e.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
      setReviewingCardId(card.id)
    }
    setSubmitting(false)
  }

  /* ── file upload / import ────────────────────────────── */

  function extractDataUrls(cards) {
    const set = new Set()
    for (const c of cards) {
      if (c.image_url && c.image_url.startsWith('data:')) set.add(c.image_url)
      const find = s => { if (s) { let i = -1; while ((i = s.indexOf('data:', i + 1)) !== -1) { let j = i + 5; while (j < s.length && s[j] !== '"' && s[j] !== "'" && s[j] !== ' ') j++; set.add(s.slice(i, j)) } } }
      find(c.front); find(c.back)
    }
    return [...set]
  }

  async function uploadImages(cards, signal) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not logged in')
    const uniqueUrls = extractDataUrls(cards)
    if (!uniqueUrls.length) return
    const mapping = {}
    const CONCURRENT = 5
    for (let i = 0; i < uniqueUrls.length; i += CONCURRENT) {
      const batch = uniqueUrls.slice(i, i + CONCURRENT)
      setUploadProgress('Uploading images ' + Math.min(i + CONCURRENT, uniqueUrls.length) + ' / ' + uniqueUrls.length + '...')
      await Promise.all(batch.map(async (dataUrl) => {
        if (signal?.aborted) return
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        if (blob.size > 3.5 * 1024 * 1024) {
          mapping[dataUrl] = null
          return
        }
        const ext = blob.type.split('/')[1] || 'png'
        const file = new File([blob], 'image.' + ext, { type: blob.type })
        const form = new FormData()
        form.append('image', file)
        const r = await fetch(API + '/upload-image', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + session.access_token },
          body: form,
          signal,
        })
        if (!r.ok) throw new Error('Image upload failed: ' + (await r.text()).slice(0, 100))
        const result = await r.json()
        if (result.error) throw new Error(result.error)
        mapping[dataUrl] = result.url
      }))
    }
    for (const c of cards) {
      if (c.image_url && mapping[c.image_url]) c.image_url = mapping[c.image_url]
      if (c.image_url && mapping[c.image_url] === null) c.image_url = null
    }
    for (const c of cards) {
      for (const [dataUrl, storageUrl] of Object.entries(mapping)) {
        const replace = storageUrl || ''
        if (c.front) c.front = c.front.replaceAll(dataUrl, replace)
        if (c.back) c.back = c.back.replaceAll(dataUrl, replace)
      }
    }
  }

  async function uploadApkg() {
    if (!apkgFile || !uploadDeck) return alert('Please select a deck.')
    setParsing(true)
    setParseErr('')
    setUploadProgress('Parsing .apkg file...')
    try {
      const { parseApkgFile } = await import('../lib/apkgParser')
      const cards = await parseApkgFile(apkgFile)
      if (!cards.length) { setParseErr('No cards found.'); setParsing(false); return }

      await uploadImages(cards)

      setParsed(cards)
      setApkgFile(null)
      setParsing(false)
      importCards(cards)
    } catch (e) { setParseErr(e.message); setParsing(false) }
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
        const { resizeImage } = await import('../lib/imageUtils')
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
      const { parseFile } = await import('../lib/fileParser')
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

  async function importCards(data) {
    const cards = data || parsed
    if (!cards.length) return
    if (!uploadDeck) return alert('Please select a deck.')
    const controller = new AbortController()
    abortRef.current = controller
    setImporting(true)
    const total = cards.length
    setUploadProgress('Importing ' + total + ' cards...')
    try {
      const CHUNK = 500
      for (let i = 0; i < total; i += CHUNK) {
        const chunk = cards.slice(i, i + CHUNK)
        setUploadProgress('Importing ' + Math.min(i + CHUNK, total) + ' / ' + total + ' cards...')
        const r = await apiPost('/flashcards', {
          cards: chunk.map(c => ({
            front: c.front, back: c.back,
            deck_id: uploadDeck, image_url: c.image_url || null
          }))
        }, controller.signal)
        if (r.error) throw new Error(r.error)
      }

      queryClient.invalidateQueries(queryKeys.flashcards.list())

      setParsed([])
      setUploadDeck('')
      const deck = uploadDeck
      setUploadProgress('Import complete.')
      setActiveDeckId(deck)
      setFilter('all')
      setView('browse')
    } catch (e) {
      if (e.name === 'AbortError') {
        setUploadProgress('Import cancelled.')
      } else {
        alert(e.message)
      }
    }
    setImporting(false)
    abortRef.current = null
  }

  function cancelImport() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }

  /* ── render helpers ──────────────────────────────────── */

  const cur = queue[qIdx]
  const curPreviews = useMemo(() => cur ? previewIntervals(cur) : {}, [cur])

  /* ── early returns ───────────────────────────────────── */

  if (loading) return <LoadingScreen fullPage={false} message="Loading Anki..." />

  if ((decksError || cardsError) && !cards.length && !decks.length) return (
    <div className={s.page}>
      <div className={s.errorBox}>
        <h3>Connection Error</h3>
        <p>Could not load data from server.</p>
        <p className={s.errorDetail}>{decksErrorObj?.message || cardsErrorObj?.message || 'Unknown error'}</p>
      </div>
    </div>
  )
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
    <div className={`${s.page}${compact ? '' : ' ' + s.expanded}`}>
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
          <button className={s.viewToggle} onClick={() => setCompact(v => !v)} title={compact ? 'Expand view' : 'Compact view'}>
            {compact ? <Maximize2 size={16} strokeWidth={1.5} /> : <Minimize2 size={16} strokeWidth={1.5} />}
          </button>
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
              const dc = deckCardsMap.get(d.id) || []
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

                  <div className={s.ankiFront} dangerouslySetInnerHTML={{ __html: card.front }} />

                  {isReviewing && (
                    <div className={s.ankiBack} dangerouslySetInnerHTML={{ __html: card.back }} />
                  )}
                  {isReviewing && card.image_url && (
                    <div className={s.cardImage}>
                      <img src={card.image_url} alt="card" loading="lazy" />
                    </div>
                  )}

                  <div className={s.ankiStats}>
                    <span>D: {Number(card.difficulty || 0).toFixed(1)}</span>
                    <span>S: {Number(card.stability || 0).toFixed(1)}d</span>
                    <span>State: {['New', 'Learn', 'Review', 'Relearn'][Number(card.state) || 0]}</span>
                    <span>Next: {card.next_review ? r.t : '--'}</span>
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

          <div className={`${s.formCard}${compact ? '' : ' ' + s.cardExpanded}`}>
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
                      if (f.size > 50 * 1024 * 1024) {
                        alert('Image too large. Max 50MB.')
                        return
                      }
                      try {
                        const { resizeImage } = await import('../lib/imageUtils')
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
      {view === 'upload' && (
        <>
          <div className={s.breadcrumb}>
            <button className={s.breadLink} onClick={() => { setApkgFile(null); setParsed([]); setView('add') }}>
              Back
            </button>
          </div>

          <div className={`${s.formCard}${compact ? '' : ' ' + s.cardExpanded}`}>
            {parsed.length > 0 || apkgFile ? (
              <>
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

            {apkgFile && !parsing && !importing && parsed.length === 0 && (
              <div className={s.uploadActions}>
                <button className={s.primaryBtn} onClick={uploadApkg} style={{ marginTop: 0 }}>
                  Upload to Server
                </button>
              </div>
            )}

            {parsing && (
              <div className={s.uploadProgressBlock}>
                <div className={s.progressBar}>
                  <div className={s.progressFill} style={{ width: '30%' }}>
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                      animation: 'shimmer 1.5s ease-in-out infinite',
                    }} />
                  </div>
                </div>
                <div className={s.progressText}>{uploadProgress}</div>
              </div>
            )}
            {importing && (() => {
              const m = uploadProgress.match(/Importing\s+(\d+)\s*\/\s*(\d+)/)
              const pct = m ? Math.round(Number(m[1]) / Number(m[2]) * 100) : 0
              return (
                <div className={s.uploadProgressBlock}>
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: pct + '%' }} />
                  </div>
                  <div className={s.progressText}>{uploadProgress}</div>
                  <button className={s.cancelImportBtn} onClick={cancelImport}>Cancel</button>
                </div>
              )
            })()}

            {parseErr && <div className={s.parseError}>{parseErr}</div>}

            {!apkgFile && parsed.length > 0 && (
              <>
                <div className={s.previewList}>
                  <div className={s.previewHeader}>
                    Showing {Math.min(parsed.length, 30)} of {parsed.length}
                  </div>
                  {parsed.slice(0, 30).map((c, i) => (
                    <div key={i} className={s.previewRow}>
                      <span className={s.previewFront}>{c.front.replace(/<[^>]+>/g, '').trim()}</span>
                      <span className={s.previewArrow}>{'\u2192'}</span>
                      <span className={s.previewBack}>{c.back.replace(/<[^>]+>/g, '').trim()}</span>
                    </div>
                  ))}
                  {parsed.length > 30 && (
                    <div className={s.previewMore}>+{parsed.length - 30} more</div>
                  )}
                </div>

                <div className={s.uploadActions}>
                  <button className={s.primaryBtn} onClick={() => importCards(parsed)} disabled={importing} style={{ marginTop: 0 }}>
                    {importing ? '...' : 'Import ' + parsed.length + ' Cards'}
                  </button>
                </div>
              </>
            )}
            </>
            ) : (
              <div className={s.uploadReady}>
                <p style={{ margin: 0, opacity: 0.7 }}>{uploadProgress || 'Drop a .apkg, .csv, .tsv, or .txt file to import.'}</p>
              </div>
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

          <div className={`${s.reviewCard}${compact ? '' : ' ' + s.cardExpanded}`}>
            <span className={s.reviewDeckLabel}>{dn(cur.deck_id)}</span>

            <div className={s.reviewLabel}>Question</div>
            <div className={s.reviewContent} dangerouslySetInnerHTML={{ __html: cur.front }} />

            {!showAns ? (
              <button className={s.showAnswerBtn} onClick={() => setShowAns(true)}>
                Show Answer
              </button>
            ) : (
              <>
                <div className={s.reviewAnswer}>
                  <div className={s.reviewLabel}>Answer</div>
                  <div className={s.reviewContent} dangerouslySetInnerHTML={{ __html: cur.back }} />
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
                    Again<span className={s.revInterval}>{curPreviews.again}</span>
                  </button>
                  <button className={`${s.revBtn} ${s.rev_hard}`} onClick={() => submitReview('hard')}>
                    Hard<span className={s.revInterval}>{curPreviews.hard}</span>
                  </button>
                  <button className={`${s.revBtn} ${s.rev_good}`} onClick={() => submitReview('good')}>
                    Good<span className={s.revInterval}>{curPreviews.good}</span>
                  </button>
                  <button className={`${s.revBtn} ${s.rev_easy}`} onClick={() => submitReview('easy')}>
                    Easy<span className={s.revInterval}>{curPreviews.easy}</span>
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

import { getTreeById } from './treeTypes'
import { getSubjectColor, getSubjectName } from './subjectColors'
import { createSeededRandom } from './seededRandom'

const PAGE_SIZE = 150

const USABLE_START = 5
const USABLE_WIDTH = 90
const COLS = 8

export function getTreeLayout(sessions) {
  return sessions.map((session, i) => {
    const rng = createSeededRandom(session.id || String(i))
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const depth = rng()

    const xJitter = (rng() - 0.5) * 6
    const baseX = USABLE_START + ((col + 0.5) / COLS) * USABLE_WIDTH + xJitter

    const sizeVar = 0.85 + rng() * 0.3

    return {
      col,
      row,
      depth,
      x: Math.max(2, Math.min(98, baseX)),
      sizeVar,
      scale: 0.88 + rng() * 0.22,
      rotation: -2.5 + rng() * 5,
    }
  })
}

export function buildGroves(sessions) {
  const map = new Map()
  for (const s of sessions) {
    const subjectId = s.subject_id || 'other'
    if (!map.has(subjectId)) {
      map.set(subjectId, {
        subjectId,
        subjectName: s.subject_name || getSubjectName(subjectId),
        sessions: [],
        totalMinutes: 0,
      })
    }
    const g = map.get(subjectId)
    g.sessions.push(s)
    g.totalMinutes += s.duration_min || 0
  }
  return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes)
}

export function getTreePreview(treeId) {
  return getTreeById(treeId) || getTreeById('oak')
}

export function formatMinutes(min) {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function getDateBounds(filter) {
  const now = new Date()
  if (filter === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { start: start.toISOString(), end: null }
  }
  if (filter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: start.toISOString(), end: null }
  }
  return { start: null, end: null }
}

export function splitRows(sessions, layout) {
  const back = []
  const mid = []
  const front = []
  for (let i = 0; i < sessions.length; i++) {
    const l = layout[i]
    if (l.depth < 0.33) back.push({ session: sessions[i], layout: l })
    else if (l.depth < 0.66) mid.push({ session: sessions[i], layout: l })
    else front.push({ session: sessions[i], layout: l })
  }
  return { back, mid, front }
}

export { getSubjectColor, getSubjectName, PAGE_SIZE }

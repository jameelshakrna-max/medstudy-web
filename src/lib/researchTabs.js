export const RESEARCH_TAB_VALUES = ['discover', 'mine', 'saved']

export const RESEARCH_TABS = [
  { id: 'discover', label: 'Discover' },
  { id: 'mine', label: 'My Posts' },
  { id: 'saved', label: 'Saved' },
]

export const RESEARCH_DEFAULT_TAB = 'discover'

export function getResearchTab(searchParams) {
  const raw = searchParams.get('tab')
  if (RESEARCH_TAB_VALUES.includes(raw)) return raw
  return RESEARCH_DEFAULT_TAB
}

export function setResearchTab(searchParams, nextTab) {
  const next = new URLSearchParams(searchParams)
  if (nextTab === RESEARCH_DEFAULT_TAB) {
    next.delete('tab')
  } else {
    next.set('tab', nextTab)
  }
  return next
}

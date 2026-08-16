export const COMMUNITY_DETAIL_TAB_VALUES = ['chat', 'leaderboard', 'competitions', 'voice', 'stats', 'hall-of-fame', 'settings']

export const COMMUNITY_DETAIL_MOD_TAB = { id: 'mod', label: 'Mod Dashboard' }

export const COMMUNITY_DETAIL_DEFAULT_TAB = 'chat'

export function getCommunityDetailTab({ requestedTab, allowedTabs, defaultTab = COMMUNITY_DETAIL_DEFAULT_TAB }) {
  if (Array.isArray(allowedTabs) && allowedTabs.includes(requestedTab)) return requestedTab
  return defaultTab
}

export function setCommunityDetailTab(searchParams, nextTab) {
  const next = new URLSearchParams(searchParams)
  if (nextTab === COMMUNITY_DETAIL_DEFAULT_TAB) {
    next.delete('tab')
  } else {
    next.set('tab', nextTab)
  }
  return next
}

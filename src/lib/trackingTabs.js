export const TRACKING_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'uworld', label: 'UWorld Tracker' },
  { id: 'mrcp', label: 'MRCP Progress' },
  { id: 'board', label: 'Local Board Tracker' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'goals', label: 'Goals' },
]

export const TRACKING_TAB_VALUES = ['overview', 'uworld', 'mrcp', 'board', 'sessions', 'rotation', 'goals']

export const TRACKING_DEFAULT_TAB = { '/progress': 'overview', '/uworld': 'uworld' }

export function resolveTrackingTab(pathname, searchParams) {
  const raw = searchParams.get('tab')
  if (TRACKING_TAB_VALUES.includes(raw)) return raw
  if (TRACKING_DEFAULT_TAB[pathname]) return TRACKING_DEFAULT_TAB[pathname]
  return 'overview'
}

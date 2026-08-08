// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const pushMocks = vi.hoisted(() => {
  const requestPushPermission = vi.fn()
  const state = { permission: 'default', blocked: false, supported: true }
  return { requestPushPermission, state }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: {}, signOut: vi.fn() }),
}))

vi.mock('../../context/PomodoroContext', () => ({
  usePomodoro: () => ({
    pushPermission: pushMocks.state.permission,
    pushBlocked: pushMocks.state.blocked,
    pushSupported: pushMocks.state.supported,
    requestPushPermission: pushMocks.requestPushPermission,
  }),
  usePomodoroSettings: () => ({
    focusMins: 25, setFocusMins: vi.fn(),
    shortMins: 5, setShortMins: vi.fn(),
    longMins: 15, setLongMins: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('../../lib/queryKeys', () => ({
  queryKeys: {
    settings: { notifPrefs: () => ['notifPrefs'], profile: () => ['profile'] },
    profile: { badges: () => ['badges'], all: ['profileAll'] },
    research: {
      profile: () => ['researchProfile'],
      skills: () => ['researchSkills'],
      portfolio: () => ['researchPortfolio'],
    },
  },
}))

vi.mock('../../data/universities', () => ({
  universities: [],
  filterUniversities: (q) => [],
}))

vi.mock('../../components/ui', () => ({
  Autocomplete: () => React.createElement('div', null, 'autocomplete'),
}))

vi.mock('../../components/AvatarUpload', () => ({ default: () => React.createElement('div', null, 'avatar') }))
vi.mock('../../components/BannerUpload', () => ({ default: () => React.createElement('div', null, 'banner') }))
vi.mock('../../components/ProfileCompletion', () => ({ default: () => React.createElement('div', null, 'completion') }))
vi.mock('../../components/profile/SkillEditor', () => ({ default: () => React.createElement('div', null, 'skills') }))
vi.mock('../../components/profile/PortfolioForm', () => ({ default: () => React.createElement('div', null, 'portfolio') }))

import Settings from '../Settings'

function openSection(title) {
  const button = screen.getByRole('button', { name: new RegExp(title) })
  fireEvent.click(button)
}

function renderSettings() {
  const view = render(React.createElement(Settings))
  openSection('Notifications')
  return view
}

describe('Settings push notification toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    pushMocks.requestPushPermission.mockReset()
    pushMocks.state.permission = 'default'
    pushMocks.state.blocked = false
    pushMocks.state.supported = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggle on calls requestPushPermission', () => {
    const { unmount } = renderSettings()
    const pushCheckbox = screen.getAllByRole('checkbox')[0]
    fireEvent.click(pushCheckbox)
    expect(pushMocks.requestPushPermission).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('medstudy-push-enabled')).toBeNull()
    unmount()
  })

  it('Enable Notifications button calls requestPushPermission when permission is default', () => {
    const { unmount } = renderSettings()
    const enableBtn = screen.getByRole('button', { name: 'Enable Notifications' })
    fireEvent.click(enableBtn)
    expect(pushMocks.requestPushPermission).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('toggle off persists opt-out without requesting permission', () => {
    pushMocks.state.permission = 'granted'
    const { unmount } = renderSettings()
    const pushCheckbox = screen.getAllByRole('checkbox')[0]
    expect(pushCheckbox.checked).toBe(true)
    fireEvent.click(pushCheckbox)
    expect(localStorage.getItem('medstudy-push-enabled')).toBe('false')
    expect(pushMocks.requestPushPermission).not.toHaveBeenCalled()
    unmount()
  })

  it('denied/blocked permission renders browser-site-permission guidance', () => {
    pushMocks.state.permission = 'denied'
    pushMocks.state.blocked = true
    const { unmount } = renderSettings()
    expect(screen.getByText(/Notifications are blocked for this site/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enable Notifications' })).toBeNull()
    unmount()
  })

  it('granted permission renders enabled confirmation without extra prompts', () => {
    pushMocks.state.permission = 'granted'
    const { unmount } = renderSettings()
    expect(screen.getByText(/Notifications are enabled/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enable Notifications' })).toBeNull()
    expect(screen.queryByText(/Notifications are blocked for this site/i)).toBeNull()
    unmount()
  })

  it('does not use the medstudy-push-resubscribe flag', () => {
    pushMocks.state.permission = 'granted'
    const { unmount } = renderSettings()
    const pushCheckbox = screen.getAllByRole('checkbox')[0]
    fireEvent.click(pushCheckbox)
    fireEvent.click(pushCheckbox)
    expect(localStorage.getItem('medstudy-push-resubscribe')).toBeNull()
    expect(screen.queryByText(/medstudy-push-resubscribe/i)).toBeNull()
    unmount()
  })

  it('shows Not supported label when push API unavailable', () => {
    pushMocks.state.supported = false
    const { unmount } = renderSettings()
    expect(screen.getByText('Not supported')).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    unmount()
  })
})

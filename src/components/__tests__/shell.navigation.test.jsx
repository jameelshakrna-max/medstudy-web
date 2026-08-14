// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const authMock = vi.hoisted(() => ({
  user: { id: 'user-1' },
  profile: { plan: 'core' },
  userProfile: { username: 'drjane', display_name: 'Jane Doe', avatar_url: null },
  signOut: vi.fn(),
}))

const pomodoroMock = vi.hoisted(() => ({
  focusMode: false,
  exitFocusMode: vi.fn(),
}))

vi.mock('../../context/PomodoroContext', () => ({
  usePomodoro: () => pomodoroMock,
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authMock,
}))

vi.mock('../../context/PresenceContext', () => ({
  usePresence: () => ({ myStatus: 'online', updateStatus: vi.fn(), getBulkPresence: vi.fn() }),
}))

vi.mock('../../context/LayerContext', () => ({
  useLayer: () => ({
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    closeTopmost: vi.fn(),
    closeAll: vi.fn(),
    isTopOverlay: () => true,
    hasOverlays: false,
    overlayCount: 0,
  }),
}))

vi.mock('../../context/ProfilePanelContext', () => ({
  useProfilePanel: () => ({ openProfile: vi.fn(), closeProfile: vi.fn() }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: 0, isLoading: false, error: null }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: () => undefined }),
}))

vi.mock('../../components/NotificationCenter', () => ({ default: () => null }))
vi.mock('../../components/StatusIndicator', () => ({ default: () => null }))
vi.mock('react-swipeable', () => ({ useSwipeable: () => ({}) }))

import Layout from '../Layout'
import BottomNav from '../BottomNav'
import MobileSheet from '../ui/MobileSheet/MobileSheet'
import bottomNavStyles from '../BottomNav.module.css'
import { getProfilePath, isFocusPath, isProgressPath, matchesPath } from '../../lib/nav'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

describe('nav.js helpers', () => {
  it('getProfilePath prefers /u/:username, falls back to /profile/:userId, else null', () => {
    expect(getProfilePath({ username: 'drjane' }, { id: 'user-1' })).toBe('/u/drjane')
    expect(getProfilePath({ display_name: 'Jane' }, { id: 'user-1' })).toBe('/profile/user-1')
    expect(getProfilePath(null, null)).toBeNull()
    expect(getProfilePath({}, null)).toBeNull()
  })

  it('isFocusPath matches all legacy focus routes', () => {
    expect(isFocusPath('/focus')).toBe(true)
    expect(isFocusPath('/pomodoro')).toBe(true)
    expect(isFocusPath('/forest')).toBe(true)
    expect(isFocusPath('/focus/123')).toBe(false)
    expect(isFocusPath('/dashboard')).toBe(false)
  })

  it('isProgressPath matches all legacy progress routes', () => {
    expect(isProgressPath('/progress')).toBe(true)
    expect(isProgressPath('/uworld')).toBe(true)
    expect(isProgressPath('/sessions')).toBe(true)
    expect(isProgressPath('/goals')).toBe(false)
  })

  it('matchesPath handles exact and nested paths', () => {
    expect(matchesPath('/dashboard', '/dashboard')).toBe(true)
    expect(matchesPath('/resources/123', '/resources')).toBe(true)
    expect(matchesPath('/resources', '/anki')).toBe(false)
    expect(matchesPath('/dashboardx', '/dashboard')).toBe(false)
  })
})

describe('Layout shell', () => {
  beforeEach(() => {
    authMock.signOut.mockClear()
    pomodoroMock.focusMode = false
    pomodoroMock.exitFocusMode.mockClear()
    try { localStorage.removeItem('sidebarCollapsed') } catch {}
  })

  function renderShell(entry = '/dashboard') {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders grouped navigation with all Phase 1 destinations', () => {
    renderShell()
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByText('Today')).toBeInTheDocument()
    expect(within(nav).getByText('Study')).toBeInTheDocument()
    expect(within(nav).getAllByText('Progress').length).toBeGreaterThanOrEqual(1)
    expect(within(nav).getAllByText('Community').length).toBeGreaterThanOrEqual(1)
    for (const label of ['Home', 'Focus', 'Study Plan', 'Curriculum', 'Anki', 'Resources', 'Goals', 'Research']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Sign Out')).toBeInTheDocument()
  })

  it('shows the plan badge and profile identity', () => {
    renderShell()
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('collapses the sidebar and hides the profile name when collapsed', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /sidebar/i })
    await user.click(toggle)
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true')
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThanOrEqual(1)
  })

  it('signs out and navigates to landing', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(authMock.signOut).toHaveBeenCalled()
  })

  it('marks the Focus link active on legacy /pomodoro', () => {
    renderShell('/pomodoro')
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByRole('link', { name: 'Focus' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the Focus link active on legacy /forest', () => {
    renderShell('/forest')
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByRole('link', { name: 'Focus' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the Progress link active on legacy /uworld', () => {
    renderShell('/uworld')
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the Progress link active on legacy /sessions', () => {
    renderShell('/sessions')
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks only the Home link active on /dashboard', () => {
    renderShell('/dashboard')
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    const activeLinks = within(nav)
      .getAllByRole('link')
      .filter(link => link.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('omits the shell while focusMode is active and restores it otherwise', () => {
    pomodoroMock.focusMode = true
    const { unmount } = renderShell('/focus')
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sidebar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Bottom navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More menu' })).not.toBeInTheDocument()
    expect(screen.queryByText('Sign Out')).not.toBeInTheDocument()
    unmount()

    pomodoroMock.focusMode = false
    renderShell('/focus')
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /sidebar/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More menu' })).toBeInTheDocument()
    expect(screen.getByText('Sign Out')).toBeInTheDocument()
  })
})

describe('BottomNav', () => {
  function renderNav(entry) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="*" element={<LocationProbe />} />
          <Route path="/u/drjane" element={<div>PROFILE</div>} />
        </Routes>
        <BottomNav />
      </MemoryRouter>,
    )
  }

  it('renders Home | Plan | Focus | More tabs', () => {
    renderNav('/dashboard')
    const nav = screen.getByRole('navigation', { name: 'Bottom navigation' })
    for (const label of ['Home', 'Plan', 'Focus', 'More']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
  })

  it('marks More as active when on a non-tab route (e.g. /anki)', () => {
    renderNav('/anki')
    const more = screen.getByRole('button', { name: 'More menu' })
    expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    expect(more).toHaveAttribute('aria-expanded', 'false')
  })

  it('marks the Focus tab active on /pomodoro but not More', () => {
    renderNav('/pomodoro')
    const nav = screen.getByRole('navigation', { name: 'Bottom navigation' })
    expect(within(nav).getByRole('link', { name: 'Focus' })).toHaveAttribute('aria-current', 'page')
    const more = screen.getByRole('button', { name: 'More menu' })
    expect(more.classList.contains(bottomNavStyles.active)).toBe(false)
  })

  it('marks the Focus tab inactive and More active on /uworld', () => {
    renderNav('/uworld')
    const nav = screen.getByRole('navigation', { name: 'Bottom navigation' })
    expect(within(nav).getByRole('link', { name: 'Focus' })).not.toHaveAttribute('aria-current')
    const more = screen.getByRole('button', { name: 'More menu' })
    expect(more.classList.contains(bottomNavStyles.active)).toBe(true)
  })

  it('opens the More sheet with all destinations and profile entry', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    await user.click(screen.getByRole('button', { name: 'More menu' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('More')).toBeInTheDocument()
    for (const label of ['Curriculum', 'Anki', 'Resources', 'Progress', 'Goals', 'Community', 'Research', 'Settings']) {
      expect(within(dialog).getByText(label)).toBeInTheDocument()
    }
    expect(within(dialog).getByText('Jane Doe')).toBeInTheDocument()
    expect(within(dialog).getByText('Core')).toBeInTheDocument()
    expect(within(dialog).getByText('Sign Out')).toBeInTheDocument()
  })

  it('signs out from the More sheet Sign Out action', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    await user.click(screen.getByRole('button', { name: 'More menu' }))
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(authMock.signOut).toHaveBeenCalled()
  })

  it('closes the sheet on Escape and restores focus to the More button', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    const more = screen.getByRole('button', { name: 'More menu' })
    await user.click(more)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(document.activeElement).toBe(more)
    })
  })

  it('closes via the visible close button', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    await user.click(screen.getByRole('button', { name: 'More menu' }))
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates when a sheet destination is clicked and closes the sheet', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    await user.click(screen.getByRole('button', { name: 'More menu' }))
    await user.click(screen.getByRole('link', { name: /Progress/ }))
    expect(screen.getByTestId('location').textContent).toBe('/progress')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to the profile destination from the sheet profile entry', async () => {
    const user = userEvent.setup()
    renderNav('/dashboard')
    await user.click(screen.getByRole('button', { name: 'More menu' }))
    await user.click(screen.getByRole('button', { name: /Jane Doe/ }))
    expect(screen.getByText('PROFILE')).toBeInTheDocument()
  })
})

describe('MobileSheet primitive a11y', () => {
  it('renders a labelled, modal dialog with a close button', () => {
    render(
      <MemoryRouter>
        <MobileSheet open onOpenChange={() => {}} title="Sheet Title" closeLabel="Close sheet">
          <div>content</div>
        </MobileSheet>
      </MemoryRouter>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Sheet Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close sheet' })).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })
})

describe('App.jsx compatibility routes', () => {
  it('registers /focus and /progress parents and guards the floating timer', () => {
    const appPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../App.jsx')
    const src = fs.readFileSync(appPath, 'utf8')
    expect(src).toMatch(/path="focus"\s+element=\{<FocusPage/)
    expect(src).toMatch(/path="progress"\s+element=\{<TrackingHub/)
    expect(src).toMatch(/FloatingTimerWrapper/)
    expect(src).toMatch(/isFocusPath/)
  })
})

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { LayerProvider } from './context/LayerContext'
import ErrorFallback from './components/ErrorFallback'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PomodoroProvider, usePomodoro } from './context/PomodoroContext'
import PlannerPomodoroSyncBridge from './components/rotation/today/PlannerPomodoroSyncBridge'
import { PresenceProvider } from './context/PresenceContext'
import { NotificationProvider } from './context/NotificationContext'
import { ProfilePanelProvider } from './context/ProfilePanelContext'
import ProfilePanel from './components/ProfilePanel'
import { CommunityPanelProvider } from './context/CommunityPanelContext'
import CommunityPanel from './components/CommunityPanel/CommunityPanel'
import FloatingTimer from './components/FloatingTimer'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

const Landing    = lazy(() => import('./pages/Landing'))
const Login      = lazy(() => import('./pages/Login'))
const Signup     = lazy(() => import('./pages/Signup'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Dashboard  = lazy(() => import('./pages/Dashboard'))
const Curriculum = lazy(() => import('./pages/Curriculum'))
const Anki       = lazy(() => import('./pages/Anki'))
const TrackingHub = lazy(() => import('./pages/TrackingHub'))
const Pomodoro   = lazy(() => import('./pages/Pomodoro'))
const Sessions   = lazy(() => import('./pages/Sessions'))
const Settings   = lazy(() => import('./pages/Settings'))
const Resources  = lazy(() => import('./pages/Resources'))
const ResourceDetail = lazy(() => import('./pages/ResourceDetail'))
const Goals      = lazy(() => import('./pages/Goals'))
const Communities = lazy(() => import('./pages/Communities'))
const CommunityDetail = lazy(() => import('./pages/CommunityDetail'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const People = lazy(() => import('./pages/People'))
const DMInbox = lazy(() => import('./components/DMInbox'))
const DMConversation = lazy(() => import('./components/DMConversation'))
const ResearchHub = lazy(() => import('./pages/ResearchHub'))
const ForestPage = lazy(() => import('./pages/ForestPage'))
const RotationPlanner = lazy(() => import('./pages/RotationPlanner'))

const PAGE_LOADING = <LoadingScreen />

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return PAGE_LOADING
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return PAGE_LOADING
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

/* Shows floating timer when running AND not on the /pomodoro page */
function FloatingTimerWrapper() {
  const location = useLocation()
  const { running } = usePomodoro()
  if (!running || location.pathname === '/pomodoro') return null
  return <FloatingTimer />
}

function AppRoutes() {
  return (
    <Suspense fallback={PAGE_LOADING}>
      <Routes>
        <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/login"  element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/reset-password" element={<ResetPassword />} /> 
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="curriculum" element={<Curriculum />} />
          <Route path="anki"       element={<Anki />} />
          <Route path="uworld"     element={<TrackingHub />} />
          <Route path="pomodoro"   element={<Pomodoro />} />
          <Route path="resources" element={<Resources />} />
          <Route path="resources/:id" element={<ResourceDetail />} />
          <Route path="sessions"   element={<Sessions />} />
          <Route path="goals"     element={<Goals />} />
          <Route path="communities" element={<Communities />} />
          <Route path="communities/:id" element={<CommunityDetail />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="people" element={<People />} />
          <Route path="profile/:userId" element={<ProfilePage />} />
          <Route path="u/:username" element={<ProfilePage />} />
          <Route path="settings"   element={<Settings />} />
          <Route path="messages" element={<DMInbox />} />
          <Route path="messages/:conversationId" element={<DMConversation />} />
          <Route path="forest" element={<ForestPage />} />
          <Route path="rotations" element={<RotationPlanner />} />
          <Route path="research" element={<ResearchHub />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FloatingTimerWrapper />
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <LayerProvider>
            <PomodoroProvider>
            <PlannerPomodoroSyncBridge />
            <PresenceProvider>
              <NotificationProvider>
                <CommunityPanelProvider>
                  <ProfilePanelProvider>
                    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
                      <AppRoutes />
                    </ErrorBoundary>
                    <ProfilePanel />
                    <CommunityPanel />
                  </ProfilePanelProvider>
                </CommunityPanelProvider>
              </NotificationProvider>
            </PresenceProvider>
          </PomodoroProvider>
          </LayerProvider>
        </BrowserRouter>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

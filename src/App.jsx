import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PomodoroProvider, usePomodoro } from './context/PomodoroContext'
import FloatingTimer from './components/FloatingTimer'
import Layout from './components/Layout'

const Landing    = lazy(() => import('./pages/Landing'))
const Login      = lazy(() => import('./pages/Login'))
const Signup     = lazy(() => import('./pages/Signup'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Dashboard  = lazy(() => import('./pages/Dashboard'))
const Curriculum = lazy(() => import('./pages/Curriculum'))
const Anki       = lazy(() => import('./pages/Anki'))
const UWorld     = lazy(() => import('./pages/UWorld'))
const Pomodoro   = lazy(() => import('./pages/Pomodoro'))
const Sessions   = lazy(() => import('./pages/Sessions'))
const Settings   = lazy(() => import('./pages/Settings'))

const PAGE_LOADING = <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--teal)',fontSize:'24px'}}>🏥</div>

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
          <Route path="uworld"     element={<UWorld />} />
          <Route path="pomodoro"   element={<Pomodoro />} />
          <Route path="sessions"   element={<Sessions />} />
          <Route path="settings"   element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FloatingTimerWrapper />
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PomodoroProvider>
          <AppRoutes />
        </PomodoroProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

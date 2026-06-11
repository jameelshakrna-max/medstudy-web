import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PomodoroProvider, usePomodoro } from './context/PomodoroContext'
import FloatingTimer from './components/FloatingTimer'
import Landing    from './pages/Landing'
import Login      from './pages/Login'
import Signup     from './pages/Signup'
import Dashboard  from './pages/Dashboard'
import Curriculum from './pages/Curriculum'
import Anki       from './pages/Anki'
import UWorld     from './pages/UWorld'
import Pomodoro   from './pages/Pomodoro'
import Sessions   from './pages/Sessions'
import Layout     from './components/Layout'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--teal)',fontSize:'24px'}}>🏥</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
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
    <>
      <Routes>
        <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/login"  element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="curriculum" element={<Curriculum />} />
          <Route path="anki"       element={<Anki />} />
          <Route path="uworld"     element={<UWorld />} />
          <Route path="pomodoro"   element={<Pomodoro />} />
          <Route path="sessions"   element={<Sessions />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FloatingTimerWrapper />
    </>
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

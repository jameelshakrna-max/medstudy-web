import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate   = useNavigate()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return }
    const { error } = await signUp(email, password, name)
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <AuthLayout title="Check your email 📬" sub="We sent a confirmation link to your inbox.">
      <div style={{textAlign:'center',color:'var(--mist)',fontSize:'14px',lineHeight:'1.7'}}>
        <p>Click the link in the email to activate your account.</p>
        <p style={{marginTop:'8px'}}>Then come back and <Link to="/login" style={{color:'var(--teal)'}}>sign in →</Link></p>
      </div>
    </AuthLayout>
  )

  return (
    <AuthLayout title="Create your account" sub="Free forever. No credit card required.">
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Full Name</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@university.edu" required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Min 8 characters" required />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account →'}
        </button>
        <div className="auth-links">
          <Link to="/login">Already have an account? Sign in</Link>
        </div>
        <div className="auth-note">
          By signing up you agree to our terms. Your curriculum is seeded automatically on first login — 19 systems, 4 years, ready to go.
        </div>
      </form>
    </AuthLayout>
  )
}

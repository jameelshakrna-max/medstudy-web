import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import styles from './ResetPassword.module.css'

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash
    // The Supabase client automatically detects it on page load
    const hash = window.location.hash
    if (!hash || !hash.includes('type=recovery')) {
      setError('Invalid or expired reset link. Please request a new one.')
    }
  }, [])

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully! Redirecting to login...')
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    }
  }

  if (error && !window.location.hash.includes('type=recovery')) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2>❌ Invalid Link</h2>
          <p>{error}</p>
          <button 
            className={styles.button} 
            onClick={() => navigate('/login')}
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2>Reset Your Password</h2>
        <p className={styles.subtitle}>Enter your new password below</p>

        <form onSubmit={handleResetPassword} className={styles.form}>
          <div className={styles.field}>
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          <div className={styles.field}>
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {message && <p className={styles.success}>{message}</p>}

          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
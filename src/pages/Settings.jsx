import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePomodoro } from '../context/PomodoroContext'
import { supabase } from '../lib/supabase'
import s from './Settings.module.css'

const APP_VERSION = '1.0.0'

export default function Settings() {
  const { user, profile, signOut } = useAuth()
  const { focusMins, setFocusMins, shortMins, setShortMins, longMins, setLongMins } = usePomodoro()

  // ── Local state ──
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // { type: 'success'|'error', msg: '' }

  // Account
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState(null)

  // Notifications
  const [pushEnabled, setPushEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Appearance
  const [theme, setTheme] = useState('dark')

  // ── Init from profile ──
  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name)
  }, [profile])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-theme')
    if (saved) setTheme(saved)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-push-enabled')
    if (saved !== null) setPushEnabled(saved === 'true')
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-sound-enabled')
    if (saved !== null) setSoundEnabled(saved === 'true')
  }, [])

  // ── Profile save ──
  const handleSaveProfile = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)

      if (error) throw error
      setStatus({ type: 'success', msg: 'Profile updated!' })
    } catch (err) {
      console.error(err)
      setStatus({ type: 'error', msg: err.message || 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  // ── Password change ──
  const handleChangePassword = async () => {
    setPasswordStatus(null)
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ type: 'error', msg: 'Password must be at least 6 characters' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', msg: 'Passwords do not match' })
      return
    }

    setPasswordSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordStatus({ type: 'success', msg: 'Password changed successfully!' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordStatus({ type: 'error', msg: err.message || 'Failed to change password' })
    } finally {
      setPasswordSaving(false)
    }
  }

  // ── Toggle handlers ──
  const handlePushToggle = async (enabled) => {
    setPushEnabled(enabled)
    localStorage.setItem('medstudy-push-enabled', String(enabled))

    if (!enabled) {
      // Unsubscribe from push
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          const sub = await reg.pushManager.getSubscription()
          if (sub) await sub.unsubscribe()
        }
      } catch (e) {
        console.error('Unsubscribe error:', e)
      }
    } else {
      // Re-subscribe on next user gesture — just flag it
      localStorage.setItem('medstudy-push-resubscribe', 'true')
    }
  }

  const handleSoundToggle = (enabled) => {
    setSoundEnabled(enabled)
    localStorage.setItem('medstudy-sound-enabled', String(enabled))
  }

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('medstudy-theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  // ── Delete account ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteAccount = async () => {
    try {
      // Delete user data first
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
      await supabase.from('pending_notifications').delete().eq('user_id', user.id)
      await supabase.from('study_sessions').delete().eq('user_id', user.id)

      // Sign out
      await signOut()
    } catch (err) {
      console.error('Delete account error:', err)
    }
  }

  // ── Computed ──
  const initials = (profile?.full_name || profile?.email || 'S')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const themeClass = theme === 'light' ? s.pageLight : ''

  return (
    <div className={`${s.page} ${themeClass}`}>
      {/* Header */}
      <div className={s.header}>
        <h1 className={s.title}>Settings</h1>
        <p className={s.subtitle}>Manage your account and preferences</p>
      </div>

      {/* ═══ Profile ═══ */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionIcon}>👤</div>
          <h2 className={s.sectionTitle}>Profile</h2>
        </div>

        <div className={s.profileRow}>
          <div className={s.avatar}>{initials}</div>
          <div className={s.profileInfo}>
            <div className={s.profileName}>{profile?.full_name || 'Student'}</div>
            <div className={s.profileEmail}>{user?.email}</div>
            <div className={s.profilePlan}>
              {profile?.plan === 'pro' ? '🏆 Pro' : profile?.plan === 'core' ? '🎓 Core' : '🆓 Free'}
            </div>
          </div>
        </div>

        <div className={s.field}>
          <label className={s.label}>Display Name</label>
          <input
            className={s.input}
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Enter your name"
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Email</label>
          <input
            className={s.input}
            type="email"
            value={user?.email || ''}
            disabled
          />
        </div>

        <div className={s.btnRow}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSaveProfile} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {status && (
          <div className={`${s.statusMsg} ${status.type === 'success' ? s.statusSuccess : s.statusError}`}>
            {status.msg}
          </div>
        )}
      </div>

      {/* ═══ Account ═══ */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionIcon}>🔐</div>
          <h2 className={s.sectionTitle}>Account</h2>
        </div>

        <div className={s.field}>
          <label className={s.label}>New Password</label>
          <input
            className={s.input}
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>Confirm New Password</label>
          <input
            className={s.input}
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
          />
        </div>

        <div className={s.btnRow}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleChangePassword} disabled={passwordSaving}>
            {passwordSaving ? 'Changing...' : 'Change Password'}
          </button>
        </div>

        {passwordStatus && (
          <div className={`${s.statusMsg} ${passwordStatus.type === 'success' ? s.statusSuccess : s.statusError}`}>
            {passwordStatus.msg}
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {!showDeleteConfirm ? (
            <button className={`${s.btn} ${s.btnDanger}`} onClick={() => setShowDeleteConfirm(true)}>
              Delete Account
            </button>
          ) : (
            <div>
              <p style={{ color: 'var(--coral, #F25C5C)', fontSize: '13px', margin: '0 0 8px', fontFamily: 'DM Sans, sans-serif' }}>
                This will permanently delete your account and all data. This cannot be undone.
              </p>
              <div className={s.btnRow}>
                <button className={`${s.btn} ${s.btnDanger}`} onClick={handleDeleteAccount}>
                  Yes, Delete My Account
                </button>
                <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Notifications ═══ */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionIcon}>🔔</div>
          <h2 className={s.sectionTitle}>Notifications</h2>
        </div>

        <div className={s.toggleRow}>
          <div className={s.toggleInfo}>
            <p className={s.toggleLabel}>Push Notifications</p>
            <p className={s.toggleDesc}>Receive timer notifications when the app is in the background</p>
          </div>
          <label className={s.toggle}>
            <input type="checkbox" checked={pushEnabled} onChange={e => handlePushToggle(e.target.checked)} />
            <span className={s.slider} />
          </label>
        </div>

        <div className={s.toggleRow}>
          <div className={s.toggleInfo}>
            <p className={s.toggleLabel}>Sound & Chime</p>
            <p className={s.toggleDesc}>Play a chime sound when the timer completes</p>
          </div>
          <label className={s.toggle}>
            <input type="checkbox" checked={soundEnabled} onChange={e => handleSoundToggle(e.target.checked)} />
            <span className={s.slider} />
          </label>
        </div>
      </div>

      {/* ═══ Appearance ═══ */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionIcon}>🎨</div>
          <h2 className={s.sectionTitle}>Appearance</h2>
        </div>

        <div className={s.themePicker}>
          <div
            className={`${s.themeOption} ${theme === 'dark' ? s.themeOptionActive : ''}`}
            onClick={() => handleThemeChange('dark')}
          >
            <div className={`${s.themePreview} ${s.themePreviewDark}`} />
            <div className={s.themeLabel}>Dark</div>
          </div>
          <div
            className={`${s.themeOption} ${theme === 'light' ? s.themeOptionActive : ''}`}
            onClick={() => handleThemeChange('light')}
          >
            <div className={`${s.themePreview} ${s.themePreviewLight}`} />
            <div className={s.themeLabel}>Light</div>
          </div>
        </div>
      </div>

      {/* ═══ Timer ═══ */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionIcon}>⏱</div>
          <h2 className={s.sectionTitle}>Timer Defaults</h2>
        </div>

        <div className={s.durationsGrid}>
          <div className={s.durationItem}>
            <label className={s.durationLabel}>Focus (min)</label>
            <input
              className={s.durationInput}
              type="number"
              min="1"
              max="90"
              value={focusMins}
              onChange={e => setFocusMins(Math.max(1, Math.min(90, +e.target.value || 1)))}
            />
          </div>
          <div className={s.durationItem}>
            <label className={s.durationLabel}>Short Break</label>
            <input
              className={s.durationInput}
              type="number"
              min="1"
              max="30"
              value={shortMins}
              onChange={e => setShortMins(Math.max(1, Math.min(30, +e.target.value || 1)))}
            />
          </div>
          <div className={s.durationItem}>
            <label className={s.durationLabel}>Long Break</label>
            <input
              className={s.durationInput}
              type="number"
              min="1"
              max="60"
              value={longMins}
              onChange={e => setLongMins(Math.max(1, Math.min(60, +e.target.value || 1)))}
            />
          </div>
        </div>
      </div>

      {/* ═══ About ═══ */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionIcon}>ℹ️</div>
          <h2 className={s.sectionTitle}>About</h2>
        </div>

        <div className={s.aboutGrid}>
          <div className={s.aboutRow}>
            <span className={s.aboutLabel}>App Version</span>
            <span className={s.aboutValue}>v{APP_VERSION}</span>
          </div>
          <div className={s.aboutRow}>
            <span className={s.aboutLabel}>Platform</span>
            <span className={s.aboutValue}>PWA</span>
          </div>
          <div className={s.aboutRow}>
            <span className={s.aboutLabel}>User ID</span>
            <span className={s.aboutValue}>{user?.id?.slice(0, 8)}...</span>
          </div>
        </div>

        <div className={s.logoutSection}>
          <button className={`${s.btn} ${s.btnSecondary}`} onClick={signOut} style={{ width: '100%', justifyContent: 'center' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

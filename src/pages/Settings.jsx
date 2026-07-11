import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePomodoroSettings } from '../context/PomodoroContext'
import { supabase } from '../lib/supabase'
import { User, Lock, Bell, Palette, Clock, ShieldAlert, Medal, Loader2 } from 'lucide-react'
import { apiGet } from '../lib/api'
import s from './Settings.module.css'

const APP_VERSION = '1.0.0'
const NAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Settings() {
  const { user, profile, signOut } = useAuth()
  const { focusMins, setFocusMins, shortMins, setShortMins, longMins, setLongMins } = usePomodoroSettings()
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [badges, setBadges] = useState([])
  const [badgesLoading, setBadgesLoading] = useState(true)

  // ── Local state ──
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Name change tracking
  const [nameLastChanged, setNameLastChanged] = useState(null)
  const nameChangeAllowed = !nameLastChanged || (Date.now() - nameLastChanged) > NAME_CHANGE_COOLDOWN_MS
  const nameCooldownDays = nameLastChanged
    ? Math.max(0, Math.ceil((NAME_CHANGE_COOLDOWN_MS - (Date.now() - nameLastChanged)) / (24 * 60 * 60 * 1000)))
    : 0

  // Account
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  // Notifications
  const [pushEnabled, setPushEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Appearance
  const [theme, setTheme] = useState('dark')

  // Accordion — which section is open
  const [openSection, setOpenSection] = useState('profile')

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── Init from profile ──
  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name)
  }, [profile])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-theme')
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-push-enabled')
    if (saved !== null) setPushEnabled(saved === 'true')
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-sound-enabled')
    if (saved !== null) setSoundEnabled(saved === 'true')
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('medstudy-name-last-changed')
    if (saved) setNameLastChanged(parseInt(saved, 10))
  }, [])

  useEffect(() => {
    if (!user?.id) return
    setBadgesLoading(true)
    apiGet(`/users/${user.id}/badges`).then(setBadges).catch(() => setBadges([])).finally(() => setBadgesLoading(false))
  }, [user?.id])

  // ── Accordion toggle ──
  const toggleSection = (section) => {
    setOpenSection(prev => prev === section ? null : section)
  }

  // ── Profile save ──
  const handleSaveProfile = async () => {
    if (!nameChangeAllowed) {
      setStatus({ type: 'error', msg: `You can change your name again in ${nameCooldownDays} days` })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)

      if (error) throw error

      const now = Date.now()
      setNameLastChanged(now)
      localStorage.setItem('medstudy-name-last-changed', String(now))
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

    if (!currentPassword) {
      setPasswordStatus({ type: 'error', msg: 'Please enter your current password' })
      return
    }

    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ type: 'error', msg: 'New password must be at least 6 characters' })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', msg: 'Passwords do not match' })
      return
    }

    setPasswordSaving(true)
    try {
      // First verify current password by re-authenticating
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      })

      if (authError) {
        setPasswordStatus({ type: 'error', msg: 'Current password is incorrect' })
        setPasswordSaving(false)
        return
      }

      // Now update the password
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

  // ── Forgot password ──
  const handleForgotPassword = async () => {
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      user.email,
      {
        redirectTo: `${window.location.origin}/reset-password`
      }
    )

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
    } else {
      setMessage('Password reset link sent to your email!')
    }
  }
  // ── Toggle handlers ──
  const handlePushToggle = async (enabled) => {
    setPushEnabled(enabled)
    localStorage.setItem('medstudy-push-enabled', String(enabled))

    if (!enabled) {
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
  const handleDeleteAccount = async () => {
    try {
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
      await supabase.from('pending_notifications').delete().eq('user_id', user.id)
      await supabase.from('study_sessions').delete().eq('user_id', user.id)
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

  // ── Accordion sections config ──
  const sections = [
    {
      key: 'profile',
      icon: User,
      title: 'Profile',
      content: (
        <>
          <div className={s.profileRow}>
            <div className={s.avatar}>{initials}</div>
            <div className={s.profileInfo}>
              <div className={s.profileName}>{profile?.full_name || 'Student'}</div>
              <div className={s.profileEmail}>{user?.email}</div>
              <div className={s.profilePlan}>
                {profile?.plan === 'pro' ? 'Pro' : profile?.plan === 'core' ? 'Core' : 'Free'}
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
              disabled={!nameChangeAllowed}
            />
            {!nameChangeAllowed && (
              <p className={s.fieldHint}>You can change your name again in {nameCooldownDays} day{nameCooldownDays !== 1 ? 's' : ''}</p>
            )}
          </div>

          <div className={s.field}>
            <label className={s.label}>Email</label>
            <input className={s.input} type="email" value={user?.email || ''} disabled />
          </div>

          <div className={s.btnRow}>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSaveProfile} disabled={saving || !nameChangeAllowed}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {status && (
            <div className={`${s.statusMsg} ${status.type === 'success' ? s.statusSuccess : s.statusError}`}>
              {status.msg}
            </div>
          )}
        </>
      )
    },
    {
      key: 'account',
      icon: Lock,
      title: 'Account',
      content: (
        <>
          <div className={s.field}>
            <label className={s.label}>Current Password</label>
            <input
              className={s.input}
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
            />
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

          {!showForgotPassword ? (
            <button className={s.forgotBtn} onClick={() => setShowForgotPassword(true)}>
              Forgot password?
            </button>
          ) : (
            <div className={s.forgotSection}>
              <p className={s.forgotText}>We'll send a password reset link to your email.</p>
              {error && <div className={`${s.statusMsg} ${s.statusError}`}>{error}</div>}
              {message && <div className={`${s.statusMsg} ${s.statusSuccess}`}>{message}</div>}
              {loading && <p className={s.forgotText}>Sending reset link...</p>}
              <div className={s.btnRow}>
                <button className={`${s.btn} ${s.btnSecondary}`} onClick={handleForgotPassword} disabled={loading}>
                  Send Reset Link
                </button>
                <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setShowForgotPassword(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className={s.dangerZone}>
            <div className={s.dangerLabel}>Danger Zone</div>
            {!showDeleteConfirm ? (
              <button className={`${s.btn} ${s.btnDanger}`} onClick={() => setShowDeleteConfirm(true)}>
                Delete Account
              </button>
            ) : (
              <div>
                <p className={s.dangerText}>
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
        </>
      )
    },
    {
      key: 'notifications',
      icon: Bell,
      title: 'Notifications',
      content: (
        <>
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
        </>
      )
    },
    {
      key: 'appearance',
      icon: Palette,
      title: 'Appearance',
      content: (
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
      )
    },
    {
      key: 'badges',
      icon: Medal,
      title: 'Badges',
      content: (
        <>
          {badgesLoading ? (
            <div className={s.badgesLoading}><Loader2 size={16} className={s.spinner} /> Loading badges...</div>
          ) : badges.length === 0 ? (
            <p className={s.badgesEmpty}>No badges yet. Study hard and compete in community leaderboards to earn monthly badges!</p>
          ) : (
            <div className={s.badgesList}>
              {badges.map(b => (
                <div key={`${b.community_id}-${b.year}-${b.month}`} className={s.badgeCard}>
                  <span className={s.badgeEmoji}>{b.emoji}</span>
                  <div className={s.badgeInfo}>
                    <div className={s.badgeCommunity}>{b.community_name}</div>
                    <div className={s.badgeMeta}>{MONTH_NAMES[b.month]} {b.year} · #{b.rank}</div>
                    {b.title && <div className={s.badgeTitle}>"{b.title}"</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )
    },
    {
      key: 'timer',
      icon: Clock,
      title: 'Timer Defaults',
      content: (
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
      )
    },
    {
      key: 'about',
      icon: 'ℹ️',
      title: 'About',
      content: (
        <>
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
        </>
      )
    }
  ]

  return (
    <div className={`${s.page} ${themeClass}`}>
      {/* Header */}
      <div className={s.header}>
        <h1 className={s.title}>Settings</h1>
        <p className={s.subtitle}>Manage your account and preferences</p>
      </div>

      {/* Accordion Sections */}
      {sections.map(({ key, icon: Icon, title, content }) => (
        <div key={key} className={s.section}>
          <button className={s.sectionToggle} onClick={() => toggleSection(key)}>
            <div className={s.sectionHeader}>
              <div className={s.sectionIcon}><Icon size={18} strokeWidth={1.5} /></div>
              <h2 className={s.sectionTitle}>{title}</h2>
            </div>
            <span className={`${s.chevron} ${openSection === key ? s.chevronOpen : ''}`}>
              ▼
            </span>
          </button>

          {openSection === key && (
            <div className={s.sectionContent}>
              {content}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

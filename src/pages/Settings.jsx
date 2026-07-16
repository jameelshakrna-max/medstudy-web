import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { usePomodoroSettings } from '../context/PomodoroContext'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { User, Lock, Bell, Palette, Clock, ShieldAlert, Medal, Loader2, Camera, MapPin, LinkIcon, AtSign, FileText, Award, FlaskConical } from 'lucide-react'
import { Autocomplete } from '../components/ui'
import { universities, filterUniversities } from '../data/universities'
import AvatarUpload from '../components/AvatarUpload'
import BannerUpload from '../components/BannerUpload'
import ProfileCompletion from '../components/ProfileCompletion'
import SkillEditor from '../components/profile/SkillEditor'
import PortfolioForm from '../components/profile/PortfolioForm'
import s from './Settings.module.css'

const APP_VERSION = '1.0.0'
const NAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Settings() {
  const { user, profile, signOut } = useAuth()
  const { focusMins, setFocusMins, shortMins, setShortMins, longMins, setLongMins } = usePomodoroSettings()
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── Local state ──
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [location, setLocation] = useState('')
  const [activeTitle, setActiveTitle] = useState('')
  const [usernameStatus, setUsernameStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameCooldown, setUsernameCooldown] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileStatus, setProfileStatus] = useState(null)
  const [profileVisibility, setProfileVisibility] = useState('public')
  const [activityVisibility, setActivityVisibility] = useState('public')
  const [university, setUniversity] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [languages, setLanguages] = useState('')

  // Research Profile
  const [researchBio, setResearchBio] = useState('')
  const [institution, setInstitution] = useState('')
  const [department, setDepartment] = useState('')
  const [researchInterests, setResearchInterests] = useState('')
  const [orcid, setOrcid] = useState('')
  const [googleScholar, setGoogleScholar] = useState('')
  const [researchgate, setResearchgate] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [researchSaving, setResearchSaving] = useState(false)
  const [researchStatus, setResearchStatus] = useState(null)
  const [editingResearchSkills, setEditingResearchSkills] = useState(false)
  const [addingResearchPortfolio, setAddingResearchPortfolio] = useState(false)

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
  const [notifPrefsStatus, setNotifPrefsStatus] = useState(null)

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

  const { data: notifPrefsData, isLoading: isNotifPrefsLoading } = useQuery({
    queryKey: queryKeys.settings.notifPrefs(),
    queryFn: () => apiGet('/notifications/preferences'),
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  const { data: badgesData, isLoading: isBadgesLoading } = useQuery({
    queryKey: queryKeys.profile.badges(user?.id),
    queryFn: () => apiGet(`/users/${user.id}/badges`),
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  const { data: profileData } = useQuery({
    queryKey: queryKeys.settings.profile(user?.id),
    queryFn: async () => {
      const API = import.meta.env.VITE_API_URL || '/api'
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return null
      const res = await fetch(`${API}/users/${user.id}/profile`, {
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      })
      return res.ok ? res.json() : null
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  })

  const { data: researchProfileData } = useQuery({
    queryKey: queryKeys.research.profile(user?.id),
    queryFn: () => apiGet(`/users/${user.id}/research-profile`),
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  const { data: researchSkillsData } = useQuery({
    queryKey: queryKeys.research.skills(user?.id),
    queryFn: () => apiGet(`/users/${user.id}/research-skills`).then(d => d.skills || []),
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  const { data: researchPortfolioData } = useQuery({
    queryKey: queryKeys.research.portfolio(user?.id),
    queryFn: () => apiGet(`/users/${user.id}/research-portfolio`).then(d => d.entries || []),
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!profileData) return
    setUsername(profileData.username || '')
    setBio(profileData.bio || '')
    setWebsite(profileData.website || '')
    setLocation(profileData.location || '')
    setActiveTitle(profileData.active_title || '')
    setFullName(profileData.display_name || profile?.full_name || '')
    setProfileVisibility(profileData.profile_visibility || 'public')
    setActivityVisibility(profileData.activity_visibility || 'public')
    setUniversity(profileData.university || '')
    setGraduationYear(profileData.graduation_year || '')
    setSpecialty(profileData.specialty || '')
    try {
      const langs = typeof profileData.languages === 'string' ? JSON.parse(profileData.languages) : profileData.languages
      setLanguages(Array.isArray(langs) ? langs.join(', ') : '')
    } catch { setLanguages('') }
  }, [profileData])

  useEffect(() => {
    if (!researchProfileData) return
    setResearchBio(researchProfileData.bio || '')
    setInstitution(researchProfileData.institution || '')
    setDepartment(researchProfileData.department || '')
    setResearchInterests(researchProfileData.research_interests || '')
    setOrcid(researchProfileData.orcid || '')
    setGoogleScholar(researchProfileData.google_scholar || '')
    setResearchgate(researchProfileData.researchgate || '')
    setLinkedin(researchProfileData.linkedin || '')
  }, [researchProfileData])

  useEffect(() => {
    if (!username || username === profileData?.username) {
      setUsernameStatus(null)
      return
    }
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(username)) {
      setUsernameStatus('invalid')
      return
    }
    setUsernameStatus('checking')
    const timer = setTimeout(() => {
      const API = import.meta.env.VITE_API_URL || '/api'
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch(`${API}/users/check-username/${username}`, {
          headers: { 'Authorization': 'Bearer ' + session.access_token }
        })
        .then(r => r.json())
        .then(data => setUsernameStatus(data.available ? 'available' : 'taken'))
        .catch(() => setUsernameStatus(null))
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [username, profileData?.username])

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

  const handleNotifPrefToggle = async (key) => {
    if (!notifPrefsData) return
    const updated = { ...notifPrefsData, [key]: notifPrefsData[key] ? 0 : 1 }
    queryClient.setQueryData(queryKeys.settings.notifPrefs(), updated)
    setNotifPrefsStatus(null)
    try {
      const API = import.meta.env.VITE_API_URL || '/api'
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API}/notifications/preferences`, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: updated[key] }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setNotifPrefsStatus({ type: 'success', msg: 'Saved' })
    } catch (err) {
      queryClient.setQueryData(queryKeys.settings.notifPrefs(), notifPrefsData)
      setNotifPrefsStatus({ type: 'error', msg: err.message })
    }
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

  // ── Full profile save ──
  const handleSaveFullProfile = async () => {
    setProfileSaving(true)
    setProfileStatus(null)
    try {
      const API = import.meta.env.VITE_API_URL || '/api'
      const { data: { session } } = await supabase.auth.getSession()
      
      const { error: supaErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)
      if (supaErr) throw supaErr

      const res = await fetch(`${API}/users/${user.id}/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: fullName,
          username: username || null,
          bio,
          website,
          location,
          active_title: activeTitle,
          profile_visibility: profileVisibility,
          activity_visibility: activityVisibility,
          university,
          graduation_year: graduationYear ? Number(graduationYear) : null,
          specialty,
          languages: languages ? JSON.stringify(languages.split(',').map(s => s.trim()).filter(Boolean)) : '[]',
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update profile')
      }

      const now = Date.now()
      setNameLastChanged(now)
      localStorage.setItem('medstudy-name-last-changed', String(now))

      queryClient.invalidateQueries({ queryKey: queryKeys.settings.profile(user?.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all })

      setProfileStatus({ type: 'success', msg: 'Profile updated successfully!' })
    } catch (err) {
      setProfileStatus({ type: 'error', msg: err.message || 'Failed to update profile' })
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Research profile save ──
  const handleSaveResearchProfile = async () => {
    setResearchSaving(true)
    setResearchStatus(null)
    try {
      const API = import.meta.env.VITE_API_URL || '/api'
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API}/users/${user.id}/research-profile`, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bio: researchBio,
          institution,
          department,
          research_interests: researchInterests,
          orcid,
          google_scholar: googleScholar,
          researchgate,
          linkedin,
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update research profile')
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.research.profile(user?.id) })
      setResearchStatus({ type: 'success', msg: 'Research profile updated!' })
    } catch (err) {
      setResearchStatus({ type: 'error', msg: err.message || 'Failed to update research profile' })
    } finally {
      setResearchSaving(false)
    }
  }

  // ── Accordion sections config ──
  const sections = [
    {
      key: 'profile',
      icon: User,
      title: 'Profile',
      content: (
        <>
          {/* Profile Completion */}
          {profileData?.profile_completion && (
            <ProfileCompletion completion={profileData.profile_completion} />
          )}

          {/* Banner Upload */}
          <div className={s.field}>
            <label className={s.label}>Profile Banner</label>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
              <BannerUpload
                url={profileData?.banner_url}
                userId={user?.id}
                editable={true}
                onChange={(url) => queryClient.setQueryData(queryKeys.settings.profile(user?.id), prev => ({ ...prev, banner_url: url }))}
              />
            </div>
          </div>

          {/* Avatar + Basic Info */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
            <AvatarUpload
              url={profileData?.avatar_url}
              size="lg"
              userName={fullName || profile?.full_name}
              userId={user?.id}
              editable={true}
              onChange={(url) => queryClient.setQueryData(queryKeys.settings.profile(user?.id), prev => ({ ...prev, avatar_url: url }))}
            />
            <div style={{ flex: 1 }}>
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
                <label className={s.label}><AtSign size={12} /> Username</label>
                <input
                  className={s.input}
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g. jimmy"
                  maxLength={20}
                />
                {usernameStatus === 'checking' && <p className={s.fieldHint} style={{ color: 'var(--mist)' }}>Checking...</p>}
                {usernameStatus === 'available' && <p className={s.fieldHint} style={{ color: 'var(--emerald)' }}>✓ Username is available</p>}
                {usernameStatus === 'taken' && <p className={s.fieldHint}>✕ Username is already taken</p>}
                {usernameStatus === 'invalid' && <p className={s.fieldHint}>3-20 characters, lowercase letters, numbers, and hyphens only</p>}
              </div>
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}><FileText size={12} /> Bio</label>
            <textarea
              className={s.input}
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 300))}
              placeholder="Tell others about yourself..."
              rows={3}
              maxLength={300}
              style={{ resize: 'vertical', minHeight: 80 }}
            />
            <p className={s.fieldHint} style={{ color: 'var(--mist)' }}>{bio.length}/300</p>
          </div>

          <div className={s.field}>
            <label className={s.label}><Award size={12} /> Profile Title</label>
            <input
              className={s.input}
              type="text"
              value={activeTitle}
              onChange={e => setActiveTitle(e.target.value)}
              placeholder="e.g. Cardiology Expert"
              maxLength={100}
            />
            <p className={s.fieldHint} style={{ color: 'var(--mist)' }}>A title shown under your name on your profile</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={s.field}>
              <label className={s.label}><MapPin size={12} /> Location</label>
              <input
                className={s.input}
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Palestine"
                maxLength={100}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}><LinkIcon size={12} /> Website</label>
              <input
                className={s.input}
                type="text"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="e.g. https://..."
                maxLength={200}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className={s.field}>
              <label className={s.label}>University</label>
              <Autocomplete
                value={university}
                onValueChange={setUniversity}
                onSelect={(item) => setUniversity(item.label)}
                suggestions={universities}
                placeholder="Search universities..."
                className={s.input}
                filterFn={filterUniversities}
                renderItem={(item) => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{item.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.5 }}>{item.city}</span>
                  </div>
                )}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>Graduation Year</label>
              <input
                className={s.input}
                type="number"
                value={graduationYear}
                onChange={e => setGraduationYear(e.target.value)}
                placeholder="e.g. 2027"
                min="2020"
                max="2040"
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={s.field}>
              <label className={s.label}>Specialty Interest</label>
              <input
                className={s.input}
                type="text"
                value={specialty}
                onChange={e => setSpecialty(e.target.value)}
                placeholder="e.g. Cardiology"
                maxLength={100}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>Languages</label>
              <input
                className={s.input}
                type="text"
                value={languages}
                onChange={e => setLanguages(e.target.value)}
                placeholder="e.g. Arabic, English"
                maxLength={200}
              />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Email</label>
            <input className={s.input} type="email" value={user?.email || ''} disabled />
          </div>

          <div className={s.field}>
            <label className={s.label}>Profile Visibility</label>
            <select
              className={s.input}
              value={profileVisibility}
              onChange={e => setProfileVisibility(e.target.value)}
            >
              <option value="public">Public - Anyone can view your profile</option>
              <option value="followers">Followers - Only followers can view your profile</option>
              <option value="private">Private - Only you can view your profile</option>
            </select>
          </div>

          <div className={s.field}>
            <label className={s.label}>Activity Visibility</label>
            <select
              className={s.input}
              value={activityVisibility}
              onChange={e => setActivityVisibility(e.target.value)}
            >
              <option value="public">Public - Anyone can see your activity</option>
              <option value="followers">Followers - Only followers can see your activity</option>
              <option value="private">Private - No one can see your activity</option>
            </select>
          </div>

          <div className={s.btnRow}>
            <button
              className={`${s.btn} ${s.btnPrimary}`}
              onClick={handleSaveFullProfile}
              disabled={profileSaving || (usernameStatus === 'taken' || usernameStatus === 'invalid')}
            >
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          {profileStatus && (
            <div className={`${s.statusMsg} ${profileStatus.type === 'success' ? s.statusSuccess : s.statusError}`}>
              {profileStatus.msg}
            </div>
          )}
        </>
      )
    },
    {
      key: 'research',
      icon: FlaskConical,
      title: 'Research Profile',
      content: (
        <>
          <div className={s.field}>
            <label className={s.label}>Research Bio</label>
            <textarea
              className={s.input}
              value={researchBio}
              onChange={e => setResearchBio(e.target.value.slice(0, 500))}
              placeholder="Describe your research background and interests..."
              rows={3}
              maxLength={500}
              style={{ resize: 'vertical', minHeight: 80 }}
            />
            <p className={s.fieldHint}>{researchBio.length}/500</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={s.field}>
              <label className={s.label}>Institution</label>
              <input
                className={s.input}
                type="text"
                value={institution}
                onChange={e => setInstitution(e.target.value)}
                placeholder="e.g. Harvard Medical School"
                maxLength={150}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>Department</label>
              <input
                className={s.input}
                type="text"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                placeholder="e.g. Cardiology"
                maxLength={150}
              />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Research Interests</label>
            <textarea
              className={s.input}
              value={researchInterests}
              onChange={e => setResearchInterests(e.target.value)}
              placeholder="e.g. Clinical trials, epidemiology, medical AI..."
              rows={2}
              style={{ resize: 'vertical', minHeight: 60 }}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--card-border)', marginTop: 12, paddingTop: 12, marginBottom: 4 }}>
            <p className={s.label}>External Links</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={s.field}>
              <label className={s.label}>ORCID</label>
              <input
                className={s.input}
                type="text"
                value={orcid}
                onChange={e => setOrcid(e.target.value)}
                placeholder="e.g. 0000-0002-1234-5678"
                maxLength={50}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>Google Scholar</label>
              <input
                className={s.input}
                type="text"
                value={googleScholar}
                onChange={e => setGoogleScholar(e.target.value)}
                placeholder="Google Scholar profile URL"
                maxLength={300}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={s.field}>
              <label className={s.label}>ResearchGate</label>
              <input
                className={s.input}
                type="text"
                value={researchgate}
                onChange={e => setResearchgate(e.target.value)}
                placeholder="ResearchGate profile URL"
                maxLength={300}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>LinkedIn</label>
              <input
                className={s.input}
                type="text"
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                placeholder="LinkedIn profile URL"
                maxLength={300}
              />
            </div>
          </div>

          <div className={s.btnRow}>
            <button
              className={`${s.btn} ${s.btnPrimary}`}
              onClick={handleSaveResearchProfile}
              disabled={researchSaving}
            >
              {researchSaving ? 'Saving...' : 'Save Research Profile'}
            </button>
          </div>

          {researchStatus && (
            <div className={`${s.statusMsg} ${researchStatus.type === 'success' ? s.statusSuccess : s.statusError}`}>
              {researchStatus.msg}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--card-border)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p className={s.label}>Research Skills</p>
              <button
                onClick={() => setEditingResearchSkills(true)}
                style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'none', color: 'var(--text)', cursor: 'pointer' }}
              >
                Edit Skills
              </button>
            </div>
            {(researchSkillsData || []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--mist)' }}>No skills added yet</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {researchSkillsData?.map(sk => (
                  <span key={sk.skill_id || sk.skill} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    {sk.skill}
                    <span style={{ fontSize: 10, color: 'var(--mist)' }}>{sk.proficiency}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--card-border)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p className={s.label}>Research Portfolio</p>
              <button
                onClick={() => setAddingResearchPortfolio(true)}
                style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'none', color: 'var(--text)', cursor: 'pointer' }}
              >
                Add Entry
              </button>
            </div>
            {(researchPortfolioData || []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--mist)' }}>No portfolio entries yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {researchPortfolioData?.map(entry => (
                  <div key={entry.pid} style={{ padding: 10, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{entry.title}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {entry.research_type && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>{entry.research_type}</span>
                      )}
                      {entry.role && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>{entry.role}</span>
                      )}
                      {entry.status && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: entry.status === 'ongoing' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: entry.status === 'ongoing' ? '#fbbf24' : '#34d399' }}>{entry.status}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editingResearchSkills && (
            <SkillEditor
              userId={user.id}
              skills={researchSkillsData || []}
              onClose={() => setEditingResearchSkills(false)}
              onSaved={() => {
                setEditingResearchSkills(false)
                queryClient.invalidateQueries({ queryKey: queryKeys.research.skills(user?.id) })
              }}
            />
          )}
          {addingResearchPortfolio && (
            <PortfolioForm
              userId={user.id}
              entry={null}
              onClose={() => setAddingResearchPortfolio(false)}
              onSaved={() => {
                setAddingResearchPortfolio(false)
                queryClient.invalidateQueries({ queryKey: queryKeys.research.portfolio(user?.id) })
              }}
            />
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

          <div style={{ borderTop: '1px solid var(--card-border)', marginTop: 12, paddingTop: 12 }}>
            <p className={s.label} style={{ marginBottom: 12 }}>In-App Notification Categories</p>
            {isNotifPrefsLoading ? (
              <div style={{ fontSize: 13, color: 'var(--mist)' }}>Loading preferences...</div>
            ) : notifPrefsData ? (
              <>
                {[
                  { key: 'mentions', label: 'Mentions', desc: 'When someone @mentions you in a community' },
                  { key: 'dms', label: 'Direct Messages', desc: 'New DM conversations or messages' },
                  { key: 'follows', label: 'Followers', desc: 'When someone follows you' },
                  { key: 'community_messages', label: 'Community Messages', desc: 'New messages in your communities' },
                  { key: 'community_mentions', label: 'Community Mentions', desc: 'Mentions in communities you belong to' },
                  { key: 'announcements', label: 'Announcements', desc: 'Community announcements and updates' },
                  { key: 'global', label: 'Global Notifications', desc: 'System-wide notifications and updates' },
                  { key: 'study_streaks', label: 'Study Streaks', desc: 'Streak milestones (7, 30, 100 days)' },
                  { key: 'flashcard_milestones', label: 'Flashcard Milestones', desc: 'Deck completion and card count milestones' },
                  { key: 'uworld_milestones', label: 'UWorld Milestones', desc: 'Question completion and score milestones' },
                  { key: 'goal_completed', label: 'Goal Completed', desc: 'When you hit a study goal' },
                ].map(({ key, label, desc }) => (
                  <div className={s.toggleRow} key={key}>
                    <div className={s.toggleInfo}>
                      <p className={s.toggleLabel}>{label}</p>
                      <p className={s.toggleDesc}>{desc}</p>
                    </div>
                    <label className={s.toggle}>
                      <input type="checkbox" checked={!!notifPrefsData[key]} onChange={() => handleNotifPrefToggle(key)} />
                      <span className={s.slider} />
                    </label>
                  </div>
                ))}
                {notifPrefsStatus && (
                  <div className={`${s.statusMsg} ${notifPrefsStatus.type === 'success' ? s.statusSuccess : s.statusError}`}>
                    {notifPrefsStatus.msg}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--mist)' }}>Could not load preferences</div>
            )}
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
          {isBadgesLoading ? (
            <div className={s.badgesLoading}><Loader2 size={16} className={s.spinner} /> Loading badges...</div>
          ) : (badgesData || []).length === 0 ? (
            <p className={s.badgesEmpty}>No badges yet. Study hard and compete in community leaderboards to earn monthly badges!</p>
          ) : (
            <div className={s.badgesList}>
              {badgesData.map(b => (
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

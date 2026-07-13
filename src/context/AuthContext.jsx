import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }, [])

  const fetchUserProfile = useCallback(async (userId) => {
    try {
      const API = import.meta.env.VITE_API_URL || '/api'
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(`${API}/users/${userId}/profile`, {
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      })
      if (res.ok) {
        const data = await res.json()
        setUserProfile(data)
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        fetchUserProfile(session.user.id)
      } else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        fetchUserProfile(session.user.id)
      } else {
        setProfile(null)
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile, fetchUserProfile])

  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    })
    return { data, error }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const resetPassword = useCallback(async (email) => {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
  }, [])

  const refreshUserProfile = useCallback(async () => {
    if (user?.id) await fetchUserProfile(user.id)
  }, [user?.id, fetchUserProfile])

  const value = useMemo(() => ({
    user, profile, userProfile, loading, signUp, signIn, signOut, resetPassword, refreshUserProfile
  }), [user, profile, userProfile, loading, signUp, signIn, signOut, resetPassword, refreshUserProfile])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

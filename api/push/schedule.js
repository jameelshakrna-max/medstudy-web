// api/push/schedule.js — ESM
// Schedules a push notification for when the timer ends

import { createClient } from '@supabase/supabase-js'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL(process.env.SUPABASE_URL + '/auth/v1/jwks')
)

async function getUser(req) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, JWKS)
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  try {
    const user = await getUser(req)
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { end_time, mode } = req.body
    if (!end_time) {
      return res.status(400).json({ error: 'Missing end_time' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const user_id = user.id

    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    const label = MODE_LABELS[mode] || 'Timer'
    const body = mode === 'study'
      ? 'Great work! Time for a break.'
      : 'Break is over. Ready to focus?'

    await supabase
      .from('pending_notifications')
      .delete()
      .eq('user_id', user_id)

    const { error: insertError } = await supabase
      .from('pending_notifications')
      .insert({
        user_id,
        end_time: new Date(end_time).toISOString(),
        title: label + ' Complete',
        body,
        mode: mode || 'study',
        sent: false,
        created_at: new Date().toISOString()
      })

    if (insertError) {
      console.error('Schedule insert error:', insertError)
      return res.status(500).json({ error: insertError.message })
    }

    return res.status(200).json({ success: true, scheduled_at: new Date(end_time).toISOString() })
  } catch (err) {
    console.error('Schedule error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

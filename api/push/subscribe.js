// api/push/subscribe.js — ESM multi-device
// Stores or updates a push subscription per device (unique by endpoint)

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

    const { subscription } = req.body
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription.endpoint' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const user_id = user.id

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys ? subscription.keys.p256dh : null,
        auth: subscription.keys ? subscription.keys.auth : null,
        subscription,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' })

    if (error) {
      console.error('Save subscription error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Subscribe error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

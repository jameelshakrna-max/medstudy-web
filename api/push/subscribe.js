// api/push/subscribe.js — ESM multi-device
// Stores or updates a push subscription per device (unique by endpoint)

import { createClient } from '@supabase/supabase-js'

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
    const { user_id, subscription } = req.body

    if (!user_id || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing user_id or subscription.endpoint' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Upsert by endpoint — allows multiple devices per user
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh || null,
        auth: subscription.keys?.auth || null,
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

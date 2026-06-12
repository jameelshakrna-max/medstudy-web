// api/push/subscribe.js — v2 CommonJS
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'push-subscribe',
      version: '2-commonjs',
      hasSupabase: !!(SUPABASE_URL && SUPABASE_SERVICE_KEY),
      envKeys: Object.keys(process.env).filter(k =>
        k.startsWith('SUPABASE') || k.startsWith('VAPID')
      ).map(k => k + '=SET')
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars' })
  }

  try {
    const { user_id, subscription } = req.body

    if (!user_id || !subscription) {
      return res.status(400).json({ error: 'Missing user_id or subscription' })
    }

    if (!subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription.endpoint' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: existing, error: findError } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .eq('user_id', user_id)
      .limit(1)

    if (findError) {
      return res.status(500).json({ error: findError.message })
    }

    let result
    if (existing && existing.length > 0) {
      result = await supabase
        .from('push_subscriptions')
        .update({
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh || null,
          auth: subscription.keys?.auth || null,
          subscription: subscription,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id)
    } else {
      result = await supabase
        .from('push_subscriptions')
        .insert({
          user_id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh || null,
          auth: subscription.keys?.auth || null,
          subscription: subscription,
          updated_at: new Date().toISOString()
        })
    }

    if (result.error) {
      return res.status(500).json({ error: result.error.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
// api/push/subscribe.js
// Stores or updates a push subscription for a user
// Converted to CommonJS for Vercel serverless compatibility

const webpush = require('web-push')
const { createClient } = require('@supabase/supabase-js')

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

// Set VAPID details only if keys are available
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:medstudy.os.app@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
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

    // First try to update existing subscription
    const { data: existing, error: findError } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .eq('user_id', user_id)
      .limit(1)

    if (findError) {
      console.error('Find subscription error:', findError)
      return res.status(500).json({ error: findError.message })
    }

    let result
    if (existing && existing.length > 0) {
      // Update existing subscription
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
      // Insert new subscription
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
      console.error('Save subscription error:', result.error)
      return res.status(500).json({ error: result.error.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Subscribe error:', err)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}

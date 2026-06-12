// api/cron/notify.js — v4 ESM multi-device
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

let vapidInitialized = false
function ensureVapid() {
  if (vapidInitialized) return
  webpush.setVapidDetails('mailto:medstudy.os.app@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  vapidInitialized = true
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ service: 'cron-notify', version: '4-esm', status: 'active' })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  try {
    ensureVapid()
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const now = new Date().toISOString()

    const { data: pending, error: fetchError } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('sent', false)
      .lte('end_time', now)
      .limit(50)

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!pending || pending.length === 0) return res.status(200).json({ sent: 0 })

    const userIds = [...new Set(pending.map(n => n.user_id))]
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)

    if (subsError) return res.status(500).json({ error: subsError.message })

    // Group subscriptions by user_id (multiple devices per user)
    const subsByUser = {}
    for (const sub of subs || []) {
      if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = []
      subsByUser[sub.user_id].push(sub)
    }

    let sentCount = 0

    for (const notification of pending) {
      const userSubs = subsByUser[notification.user_id] || []

      if (userSubs.length === 0) {
        await supabase.from('pending_notifications').update({ sent: true, sent_at: now }).eq('id', notification.id)
        continue
      }

      // Send to ALL devices for this user
      for (const sub of userSubs) {
        try {
          let pushSubscription
          if (sub.subscription && typeof sub.subscription === 'object') {
            pushSubscription = {
              endpoint: sub.subscription.endpoint || sub.endpoint,
              keys: sub.subscription.keys || { p256dh: sub.p256dh, auth: sub.auth }
            }
          } else {
            pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
          }

          const appUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173'
          const payload = JSON.stringify({ title: notification.title, body: notification.body, tag: 'pomodoro-timer', mode: notification.mode, url: `${appUrl}/pomodoro` })
          await webpush.sendNotification(pushSubscription, payload)
          sentCount++
        } catch (pushErr) {
          console.error('Push failed:', pushErr?.statusCode, pushErr?.message)
          if (pushErr?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }

      await supabase.from('pending_notifications').update({ sent: true, sent_at: now }).eq('id', notification.id)
    }

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
    await supabase.from('pending_notifications').delete().eq('sent', true).lt('created_at', oneDayAgo)

    return res.status(200).json({ sent: sentCount, total: pending.length })
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
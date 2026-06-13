// api/cron/notify.js — ESM multi-device
// Called by pg_cron every minute
// Finds pending notifications where end_time has passed, sends push to ALL devices

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Lazy-init VAPID
let vapidInitialized = false
function ensureVapid() {
  if (vapidInitialized) return
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('Missing VAPID keys in environment')
  }
  webpush.setVapidDetails(
    'mailto:medstudy.os.app@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  vapidInitialized = true
}

export default async function handler(req, res) {
  // Auth check — TEMPORARILY DISABLED
  // TODO: Re-enable after verifying CRON_SECRET matches between Vercel and pg_cron
  // if (process.env.CRON_SECRET) {
  //   const authHeader = req.headers['authorization']
  //   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //     return res.status(401).json({ error: 'Unauthorized' })
  //   }
  // }

  // Check required env vars
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('Missing VAPID keys')
    return res.status(500).json({ error: 'Server misconfigured: missing VAPID keys' })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials')
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase credentials' })
  }

  try {
    ensureVapid()
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const now = new Date().toISOString()

    // Find all pending notifications where end_time has passed
    const { data: pending, error: fetchError } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('sent', false)
      .lte('end_time', now)
      .limit(50)

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      return res.status(500).json({ error: fetchError.message })
    }

    if (!pending || pending.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No pending notifications' })
    }

    // Get all push subscriptions for the affected users (multi-device)
    const userIds = [...new Set(pending.map(n => n.user_id))]
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)

    if (subsError) {
      console.error('Subs error:', subsError)
      return res.status(500).json({ error: subsError.message })
    }

    // Build a map of user_id -> [subscriptions] (multi-device)
    const subMap = {}
    for (const sub of subs || []) {
      if (!subMap[sub.user_id]) subMap[sub.user_id] = []
      subMap[sub.user_id].push(sub)
    }

    let sentCount = 0

    // Send push for each pending notification (to ALL user devices)
    for (const notification of pending) {
      const userSubs = subMap[notification.user_id] || []

      if (userSubs.length === 0) {
        // No subscriptions — mark as sent anyway
        await supabase
          .from('pending_notifications')
          .update({ sent: true, sent_at: now })
          .eq('id', notification.id)
        continue
      }

      const appUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        tag: 'pomodoro-timer',
        mode: notification.mode,
        url: `${appUrl}/pomodoro`
      })

      for (const sub of userSubs) {
        try {
          let pushSubscription
          if (sub.subscription && typeof sub.subscription === 'object') {
            pushSubscription = {
              endpoint: sub.subscription.endpoint || sub.endpoint,
              keys: sub.subscription.keys || { p256dh: sub.p256dh, auth: sub.auth }
            }
          } else {
            pushSubscription = {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            }
          }

          await webpush.sendNotification(pushSubscription, payload)
          sentCount++
        } catch (pushErr) {
          console.error(`Push failed for user ${notification.user_id}:`, pushErr?.statusCode, pushErr?.message)
          // If subscription expired (410), remove it
          if (pushErr?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }

      // Mark notification as sent
      await supabase
        .from('pending_notifications')
        .update({ sent: true, sent_at: now })
        .eq('id', notification.id)
    }

    // Clean up old sent notifications (older than 1 day)
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
    await supabase
      .from('pending_notifications')
      .delete()
      .eq('sent', true)
      .lt('created_at', oneDayAgo)

    return res.status(200).json({ sent: sentCount, total: pending.length })
  } catch (err) {
    console.error('Cron notify error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

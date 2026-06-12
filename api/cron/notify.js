const webpush = require('web-push')
const { createClient } = require('@supabase/supabase-js')

let vapidInitialized = false
function ensureVapid() {
  if (vapidInitialized) return
  webpush.setVapidDetails(
    'mailto:medstudy.os.app@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  vapidInitialized = true
}

module.exports = async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY ||
      !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
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

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message })
    }

    if (!pending || pending.length === 0) {
      return res.status(200).json({ sent: 0 })
    }

    const userIds = [...new Set(pending.map(n => n.user_id))]
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)

    const subMap = {}
    for (const sub of subs || []) {
      subMap[sub.user_id] = sub
    }

    let sentCount = 0

    for (const notification of pending) {
      const sub = subMap[notification.user_id]
      if (!sub) {
        await supabase.from('pending_notifications').update({ sent: true, sent_at: now }).eq('id', notification.id)
        continue
      }

      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }
        const appUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173'
        const payload = JSON.stringify({
          title: notification.title,
          body: notification.body,
          tag: 'pomodoro-timer',
          mode: notification.mode,
          url: `${appUrl}/pomodoro`
        })
        await webpush.sendNotification(pushSubscription, payload)
        sentCount++
      } catch (pushErr) {
        if (pushErr?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('user_id', notification.user_id)
        }
      }

      await supabase.from('pending_notifications').update({ sent: true, sent_at: now }).eq('id', notification.id)
    }

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
    await supabase.from('pending_notifications').delete().eq('sent', true).lt('created_at', oneDayAgo)

    return res.status(200).json({ sent: sentCount, total: pending.length })
  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}
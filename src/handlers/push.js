import { json, uuid } from '../lib/worker-utils.js'
import webPush from 'web-push'

// ── VAPID config ──
let vapidConfigured = false

function configureVapid(env) {
  if (vapidConfigured) return
  const privateKey = env.VAPID_PRIVATE_KEY
  const publicKey = env.VAPID_PUBLIC_KEY
  if (!privateKey || !publicKey) {
    console.error('[push] Missing VAPID_PRIVATE_KEY or VAPID_PUBLIC_KEY env vars')
    return
  }
  webPush.setVapidDetails(
    'mailto:support@medstudy.app',
    publicKey,
    privateKey
  )
  vapidConfigured = true
}

// ── Subscribe: store browser push subscription (upsert by endpoint) ──
export async function handleSubscribe(request, env, user) {
  const body = await request.json()
  const { subscription } = body

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return json({ error: 'Invalid subscription payload' }, 400)
  }

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, expiration_time)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       expiration_time = excluded.expiration_time`
  ).bind(
    id, user.sub, subscription.endpoint,
    subscription.keys.p256dh, subscription.keys.auth,
    subscription.expirationTime || null
  ).run()

  return json({ success: true })
}

// ── Schedule: queue a push notification (cancel previous for same type) ──
export async function handleSchedulePush(request, env, user) {
  const body = await request.json()
  const { type, title, body: notifBody, url, data, duration_ms } = body

  if (!type || !title || !notifBody) {
    return json({ error: 'Missing required fields: type, title, body' }, 400)
  }

  if (!duration_ms || duration_ms <= 0) {
    return json({ error: 'Invalid duration_ms' }, 400)
  }

  const scheduled_at = Date.now() + duration_ms

  // Cancel any existing scheduled push of the same type for this user
  await env.DB.prepare(
    'DELETE FROM scheduled_pushes WHERE user_id = ? AND type = ?'
  ).bind(user.sub, type).run()

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO scheduled_pushes (id, user_id, type, title, body, url, data, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.sub, type, title, notifBody, url || null, data || null, scheduled_at).run()

  return json({ success: true, scheduled_at })
}

// ── Cron handler: process due notifications ──
export async function handlePushCron(env) {
  configureVapid(env)

  if (!vapidConfigured) {
    console.error('[push-cron] VAPID not configured, skipping')
    return json({ error: 'VAPID not configured' }, 500)
  }

  const now = Date.now()

  // Fetch due notifications (not yet attempted 3+ times)
  const { results: due } = await env.DB.prepare(
    'SELECT * FROM scheduled_pushes WHERE scheduled_at <= ? AND attempts < 3 LIMIT 50'
  ).bind(now).all()

  if (!due.length) return json({ processed: 0 })

  let processed = 0
  let failed = 0

  for (const push of due) {
    try {
      // Get all subscriptions for this user
      const { results: subs } = await env.DB.prepare(
        'SELECT * FROM push_subscriptions WHERE user_id = ?'
      ).bind(push.user_id).all()

      if (!subs.length) {
        // No subscriptions — delete the scheduled push
        await env.DB.prepare('DELETE FROM scheduled_pushes WHERE id = ?').bind(push.id).run()
        continue
      }

      // Parse notification data
      let notificationData = {}
      if (push.data) {
        try { notificationData = JSON.parse(push.data) } catch (_) {}
      }

      // Build web-push payload
      const payload = JSON.stringify({
        title: push.title,
        body: push.body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: push.type,
        renotify: false,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: {
          url: push.url || '/pomodoro',
          ...notificationData
        },
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      })

      let anySuccess = false

      for (const sub of subs) {
        try {
          // Reconstruct the PushSubscription object for web-push
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          }

          await webPush.sendNotification(pushSubscription, payload, {
            TTL: 86400,
            urgency: 'high'
          })
          anySuccess = true
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription expired — remove it
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
              .bind(sub.endpoint).run()
          } else {
            console.error('[push-cron] Send error:', sub.endpoint, err.statusCode, err.message)
          }
        }
      }

      if (anySuccess) {
        // Delete delivered notification
        await env.DB.prepare('DELETE FROM scheduled_pushes WHERE id = ?').bind(push.id).run()
        processed++
      } else {
        // Increment attempts
        await env.DB.prepare(
          'UPDATE scheduled_pushes SET attempts = attempts + 1 WHERE id = ?'
        ).bind(push.id).run()
        failed++
      }
    } catch (err) {
      console.error('[push-cron] Error processing push:', push.id, err.message)
      failed++
    }
  }

  return json({ processed, failed, total: due.length })
}

// ── Cancel: remove scheduled pushes for a user (called on timer stop/reset) ──
export async function handleCancelPushes(request, env, user) {
  const body = await request.json().catch(() => ({}))
  const type = body.type || null

  let result
  if (type) {
    result = await env.DB.prepare(
      'DELETE FROM scheduled_pushes WHERE user_id = ? AND type = ?'
    ).bind(user.sub, type).run()
  } else {
    result = await env.DB.prepare(
      'DELETE FROM scheduled_pushes WHERE user_id = ?'
    ).bind(user.sub).run()
  }

  return json({ success: true, deleted: result.meta?.changes || 0 })
}

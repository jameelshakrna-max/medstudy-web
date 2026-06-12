// api/push/schedule.js
// Schedules a push notification for when the timer ends
// Converted to CommonJS for Vercel serverless compatibility

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

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
    const { user_id, end_time, mode } = req.body

    if (!user_id || !end_time) {
      return res.status(400).json({ error: 'Missing user_id or end_time' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    const label = MODE_LABELS[mode] || 'Timer'
    const body = mode === 'study'
      ? 'Great work! Time for a break.'
      : 'Break is over. Ready to focus?'

    // Delete any existing pending notifications for this user
    const { error: deleteError } = await supabase
      .from('pending_notifications')
      .delete()
      .eq('user_id', user_id)

    if (deleteError) {
      console.error('Delete old notifications error:', deleteError)
      // Don't fail the request, just log
    }

    // Insert new pending notification
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
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}

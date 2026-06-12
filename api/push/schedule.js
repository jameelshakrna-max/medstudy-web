const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
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

    await supabase
      .from('pending_notifications')
      .delete()
      .eq('user_id', user_id)

    const { error } = await supabase
      .from('pending_notifications')
      .insert({
        user_id,
        end_time: new Date(end_time).toISOString(),
        title: `${label} Complete`,
        body,
        mode: mode || 'study',
        sent: false,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('Schedule error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Schedule error:', err)
    return res.status(500).json({ error: err.message })
  }
}
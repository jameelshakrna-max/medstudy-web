import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs' }

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return Response.json({ error: 'Storage not configured' }, { status: 500 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.find(b => b.name === 'card-images')) {
      await supabase.storage.createBucket('card-images', { public: true })
    }

    const form = await req.formData()
    const file = form.get('image')
    if (!file) return Response.json({ error: 'No image file' }, { status: 400 })

    const ext = file.name?.split('.').pop() || 'png'
    const fileName = crypto.randomUUID() + '.' + ext
    const buffer = await file.arrayBuffer()

    const { data, error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/png',
        upsert: false,
      })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const { data: { publicUrl } } = supabase.storage
      .from('card-images')
      .getPublicUrl(fileName)

    return Response.json({ url: publicUrl })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

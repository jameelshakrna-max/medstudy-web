import { useState, useRef } from 'react'
import { Camera, Loader2 } from 'lucide-react'

const SIZES = { sm: 32, md: 64, lg: 96 }
const MAX_DIM = 400
const QUALITY = 0.8

function getInitials(name) {
  if (!name) return '?'
  return name.slice(0, 2).toUpperCase()
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_DIM) {
          height = Math.round(height * (MAX_DIM / width))
          width = MAX_DIM
        }
        if (height > MAX_DIM) {
          width = Math.round(width * (MAX_DIM / height))
          height = MAX_DIM
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/webp', QUALITY)
        if (dataUrl.startsWith('data:image/webp')) {
          resolve(dataUrl)
        } else {
          resolve(canvas.toDataURL('image/jpeg', QUALITY))
        }
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export default function AvatarUpload({
  url = null,
  size = 'md',
  onChange,
  editable = false,
  userName = '',
  userId,
}) {
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const px = SIZES[size] || SIZES.md
  const displayUrl = preview || url
  const initials = getInitials(userName)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const previousUrl = displayUrl

    try {
      const resizedDataUrl = await resizeImage(file)
      setPreview(resizedDataUrl)

      const blob = dataUrlToBlob(resizedDataUrl)
      const formData = new FormData()
      formData.append('image', blob, 'avatar.webp')

      setUploading(true)

      const API = import.meta.env.VITE_API_URL || '/api'
      const { default: { supabase } } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(`${API}/users/${userId}/avatar`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
        body: formData,
      })

      if (!res.ok) throw new Error('Upload failed')

      const data = await res.json()
      setPreview(null)
      onChange?.(data.url)
    } catch (err) {
      console.error('Avatar upload failed:', err)
      setPreview(null)
      if (previousUrl !== url) setPreview(null)
      onChange?.(previousUrl || null)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="avatarUpload" style={{ position: 'relative', width: px, height: px, flexShrink: 0 }}>
      <style>{`
        .avatarUpload { border-radius: 50%; overflow: hidden; }
        .avatarImg { width: 100%; height: 100%; object-fit: cover; display: block; }
        .avatarFallback {
          width: 100%; height: 100%;
          background: linear-gradient(135deg, var(--blue), var(--emerald));
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Serif Display', serif;
          color: #fff; font-weight: 600;
          user-select: none;
        }
        .avatarOverlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
          border-radius: 50%;
        }
        .avatarUpload:hover .avatarOverlay { opacity: 1; }
        .avatarLoading {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
          pointer-events: none;
        }
        @keyframes avatarSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .avatarLoading svg { animation: avatarSpin 0.8s linear infinite; }
      `}</style>

      {displayUrl ? (
        <img className="avatarImg" src={displayUrl} alt={userName || 'Avatar'} draggable={false} />
      ) : (
        <div className="avatarFallback" style={{ fontSize: px * 0.35 }}>
          {initials}
        </div>
      )}

      {editable && (
        <>
          <div className="avatarOverlay" onClick={() => !uploading && inputRef.current?.click()}>
            {uploading ? (
              <Loader2 size={px * 0.35} color="#fff" />
            ) : (
              <Camera size={px * 0.35} color="#fff" strokeWidth={1.5} />
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFile}
            disabled={uploading}
          />
        </>
      )}
    </div>
  )
}

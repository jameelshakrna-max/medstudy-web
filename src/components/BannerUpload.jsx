import { useState, useRef } from 'react'
import { Camera, Image as ImageIcon, Loader2 } from 'lucide-react'

const MAX_W = 1200
const MAX_H = 400
const QUALITY = 0.82

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_W) {
          height = Math.round(height * (MAX_W / width))
          width = MAX_W
        }
        if (height > MAX_H) {
          width = Math.round(width * (MAX_H / height))
          height = MAX_H
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

export default function BannerUpload({ url = null, onChange, editable = false, userId }) {
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const displayUrl = preview || url

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const previousUrl = displayUrl

    try {
      const resizedDataUrl = await resizeImage(file)
      setPreview(resizedDataUrl)

      const blob = dataUrlToBlob(resizedDataUrl)
      const formData = new FormData()
      formData.append('image', blob, 'banner.webp')

      setUploading(true)

      const API = import.meta.env.VITE_API_URL || '/api'
      const { supabase } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(`${API}/users/${userId}/banner`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
        body: formData,
      })

      if (!res.ok) throw new Error('Upload failed')

      const data = await res.json()
      setPreview(null)
      onChange?.(data.url)
    } catch (err) {
      console.error('Banner upload failed:', err)
      setPreview(null)
      onChange?.(previousUrl || null)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="bannerUpload" style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: '20px 20px 0 0' }}>
      <style>{`
        .bannerUpload {
          width: 100%;
          aspect-ratio: 3 / 1;
          min-height: 120px;
          max-height: 300px;
          position: relative;
          overflow: hidden;
        }
        .bannerImg {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .bannerPlaceholder {
          width: 100%; height: 100%;
          background: linear-gradient(135deg, var(--navy2), var(--navy3));
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          color: var(--mist); user-select: none;
        }
        .bannerPlaceholder span {
          font-size: 13px; opacity: 0.6;
        }
        .bannerOverlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .bannerUpload:hover .bannerOverlay { opacity: 1; }
        .bannerOverlayText {
          font-size: 13px; color: #fff; font-weight: 500; letter-spacing: 0.02em;
        }
        .bannerLoading {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        @keyframes bannerSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .bannerLoading svg { animation: bannerSpin 0.8s linear infinite; }
      `}</style>

      {displayUrl ? (
        <img className="bannerImg" src={displayUrl} alt="Banner" draggable={false} />
      ) : (
        <div className="bannerPlaceholder">
          <ImageIcon size={36} strokeWidth={1.2} />
          <span>No banner</span>
        </div>
      )}

      {editable && (
        <>
          <div className="bannerOverlay" onClick={() => !uploading && inputRef.current?.click()}>
            {uploading ? (
              <Loader2 size={28} color="#fff" />
            ) : (
              <Camera size={28} color="#fff" strokeWidth={1.5} />
            )}
            <span className="bannerOverlayText">Change Banner</span>
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

      {uploading && (
        <div className="bannerLoading">
          <Loader2 size={32} color="#fff" />
        </div>
      )}
    </div>
  )
}

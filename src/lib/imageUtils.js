// lib/imageUtils.js — Client-side image resize
// Resizes images before saving to keep database lean
// Returns base64 data URLs that get stored directly in Turso

const MAX_WIDTH = 800
const MAX_HEIGHT = 600
const QUALITY = 0.8 // 80% quality for WebP

/**
 * Resize an image file to fit within MAX_WIDTH x MAX_HEIGHT
 * Converts to WebP for smaller file size
 * Returns a base64 data URL string (e.g. "data:image/webp;base64,...")
 * This string is saved directly in the image_url column in Turso
 */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img

        // Scale down if larger than max dimensions
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width))
          width = MAX_WIDTH
        }
        if (height > MAX_HEIGHT) {
          width = Math.round(width * (MAX_HEIGHT / height))
          height = MAX_HEIGHT
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Try WebP first, fall back to JPEG
        const dataUrl = canvas.toDataURL('image/webp', QUALITY)

        // Check if WebP is supported (old browsers might not support it)
        if (dataUrl.startsWith('data:image/webp')) {
          resolve(dataUrl)
        } else {
          const jpegUrl = canvas.toDataURL('image/jpeg', QUALITY)
          resolve(jpegUrl)
        }
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

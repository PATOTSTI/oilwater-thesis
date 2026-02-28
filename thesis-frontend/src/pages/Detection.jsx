/**
 * Detection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Oil detection page for the AquaDetect dashboard.
 *
 * Left column  – Image upload card (built here)
 * Right column – Placeholder (EXIF, drone inputs, detect button — next prompts)
 */

import { useState, useRef } from 'react'
import { Upload, AlertCircle } from 'lucide-react'

// ── Shared card style ─────────────────────────────────────────────────────────
const cardClass =
  'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5'

const titleClass = 'text-sm font-semibold text-gray-900 dark:text-white'

export default function Detection() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState(null)
  const fileInputRef = useRef(null)

  // ── Image handler ─────────────────────────────────────────────────────────
  const handleImageSelect = (file) => {
    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setFileError('Only JPG and PNG files are supported')
      return
    }

    // Validate file size — max 10 MB
    if (file.size > 10 * 1024 * 1024) {
      setFileError('File size must be under 10MB')
      return
    }

    setFileError(null)
    setSelectedImage(file)

    // Create a blob preview URL for the img tag
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
  }

  const handleReset = () => {
    // Revoke the existing blob URL to free memory
    if (imagePreview) URL.revokeObjectURL(imagePreview)

    setSelectedImage(null)
    setImagePreview(null)
    setFileError(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 w-full h-full">
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN — Image Upload
        ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4">

          {/* ── Image Upload Card ────────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Upload Drone Image</h2>

            {/* ── No image selected: show drag-and-drop zone ─────────────── */}
            {!selectedImage ? (
              <>
                <div
                  className={[
                    'border-2 border-dashed rounded-xl p-8 transition-colors duration-150 cursor-pointer',
                    isDragging
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-gray-300 dark:border-gray-600',
                  ].join(' ')}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragging(false)
                    const file = e.dataTransfer.files[0]
                    if (file) handleImageSelect(file)
                  }}
                >
                  {/* Upload icon */}
                  <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />

                  {/* Instructions */}
                  <p className="text-sm text-gray-400 text-center mb-2">
                    Drag and drop your drone image here
                  </p>
                  <p className="text-xs text-gray-500 text-center mb-3">or</p>

                  {/* Browse button */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                    >
                      Browse File
                    </button>
                  </div>
                </div>

                {/* Accepted formats note */}
                <p className="text-xs text-gray-500 text-center mt-3">
                  Accepted formats: JPG, PNG • Max size: 10MB
                </p>
              </>
            ) : (
              /* ── Image selected: show preview ──────────────────────────── */
              <>
                {/* Image preview */}
                <img
                  src={imagePreview}
                  alt="Selected drone image"
                  className="w-full rounded-xl object-contain max-h-64 border border-gray-200 dark:border-gray-700"
                />

                {/* File info row */}
                <div className="flex justify-between items-center mt-2">
                  {/* Left — file name + size */}
                  <div>
                    <p className="text-xs text-gray-400 truncate max-w-48">
                      {selectedImage.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(selectedImage.size / 1024).toFixed(0)} KB
                    </p>
                  </div>

                  {/* Right — change button */}
                  <button
                    onClick={handleReset}
                    className="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  >
                    Change Image
                  </button>
                </div>
              </>
            )}

            {/* ── File error message ──────────────────────────────────────── */}
            {fileError && (
              <div className="flex items-center gap-2 mt-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-xs text-red-400">{fileError}</span>
              </div>
            )}

            {/* Hidden file input — triggered by Browse button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) handleImageSelect(e.target.files[0])
              }}
            />
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN — Placeholder (EXIF, drone inputs, detect button)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full lg:w-1/2" />

      </div>
    </div>
  )
}
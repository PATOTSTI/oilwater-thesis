/**
 * Detection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Oil detection page for the AquaDetect dashboard.
 *
 * Left column  – Image upload card + Drone information inputs + Detect button
 * Right column – Placeholder (results panel — next prompt)
 */

import { useState, useRef, useEffect } from 'react'
import { Upload, AlertCircle, CheckCircle, Loader2, Circle, ScanSearch, Navigation } from 'lucide-react'
import exifr from 'exifr'
import { detectOil } from '../api/endpoints'
import { useNavigation } from '../hooks/useNavigation'

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
  const canvasRef = useRef(null)
  const imageRef = useRef(null)

  // ── Drone info state ─────────────────────────────────────────────────────
  const [droneLat, setDroneLat] = useState('')
  const [droneLng, setDroneLng] = useState('')
  const [droneAltitude, setDroneAltitude] = useState('')
  const [droneHeading, setDroneHeading] = useState('')

  // ── EXIF status state ──────────────────────────────────────────────────
  const [exifAutoFilled, setExifAutoFilled] = useState(false)
  const [exifNotFound, setExifNotFound] = useState(false)
  const [exifLoading, setExifLoading] = useState(false)

  // ── Detection state ────────────────────────────────────────────────────
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState(null)
  const [detectionResult, setDetectionResult] = useState(null)
  const [navigatedId, setNavigatedId] = useState(null)

  // ── Destructure navigation hook
  const { navigateToLocation } = useNavigation()

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

    // Read EXIF data automatically
    readExifData(file)
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

    // Reset drone info fields
    setDroneLat('')
    setDroneLng('')
    setDroneAltitude('')
    setDroneHeading('')
    setExifAutoFilled(false)
    setExifNotFound(false)
    setExifLoading(false)

    // Reset detection state
    setDetectionResult(null)
    setDetectionError(null)
    setIsDetecting(false)
  }

  // ── EXIF reading ─────────────────────────────────────────────────────────
  // Parses GPS + altitude from DJI image metadata.
  // Heading is intentionally skipped — DJI Mini 2 gimbal heading is unreliable.
  const readExifData = async (file) => {
    setExifLoading(true)
    setExifAutoFilled(false)
    setExifNotFound(false)

    try {
      const exif = await exifr.parse(file, {
        gps: true,
        xmp: true,
        translateKeys: true,
        translateValues: true,
      })

      console.log('[EXIF] Raw data:', exif)

      let filled = false

      // Read GPS coordinates
      if (exif?.latitude && exif?.longitude) {
        setDroneLat(exif.latitude.toFixed(6))
        setDroneLng(exif.longitude.toFixed(6))
        filled = true
      }

      // Read altitude — prefer XMP RelativeAltitude (DJI-specific), fall back to GPSAltitude
      if (exif?.RelativeAltitude !== undefined) {
        const alt = Math.abs(parseFloat(exif.RelativeAltitude))
        setDroneAltitude(alt.toFixed(1))
        filled = true
      } else if (exif?.GPSAltitude !== undefined) {
        setDroneAltitude(parseFloat(exif.GPSAltitude).toFixed(1))
        filled = true
      }

      // Note: Heading intentionally not read.
      // DJI Mini 2 gimbal heading is unreliable — user must enter manually.

      if (filled) {
        setExifAutoFilled(true)
      } else {
        setExifNotFound(true)
      }
    } catch (err) {
      console.warn('[EXIF] Failed to read:', err)
      setExifNotFound(true)
    } finally {
      setExifLoading(false)
    }
  }
  // ── Detection: input validation ────────────────────────────────────────────
  const validateInputs = () => {
    if (!selectedImage) {
      setDetectionError('Please select an image first')
      return false
    }
    if (!droneLat || !droneLng || !droneAltitude || !droneHeading) {
      setDetectionError('Please fill in all drone information fields')
      return false
    }

    const lat = parseFloat(droneLat)
    const lng = parseFloat(droneLng)
    const alt = parseFloat(droneAltitude)
    const hdg = parseFloat(droneHeading)

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setDetectionError('Latitude must be a number between -90 and 90')
      return false
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setDetectionError('Longitude must be a number between -180 and 180')
      return false
    }
    if (isNaN(alt) || alt < 0 || alt > 500) {
      setDetectionError('Altitude must be between 0 and 500 meters')
      return false
    }
    if (isNaN(hdg) || hdg < 0 || hdg > 360) {
      setDetectionError('Heading must be between 0 and 360 degrees')
      return false
    }

    setDetectionError(null)
    return true
  }

  // ── Detection: API call ──────────────────────────────────────────────────
  const handleDetect = async () => {
    if (!validateInputs()) return

    const formData = new FormData()
    formData.append('file', selectedImage)
    formData.append('drone_lat', parseFloat(droneLat))
    formData.append('drone_lng', parseFloat(droneLng))
    formData.append('drone_altitude', parseFloat(droneAltitude))
    formData.append('drone_heading', parseFloat(droneHeading))

    try {
      setIsDetecting(true)
      setDetectionError(null)
      setDetectionResult(null)

      const result = await detectOil(formData)
      console.log('[Detection] Result:', result)

      // Store result — used by the results panel in the next prompt
      setDetectionResult(result)
    } catch (err) {
      console.error('[Detection] Error:', err)
      setDetectionError(err.message || 'Detection failed. Please try again.')
    } finally {
      setIsDetecting(false)
    }
  }
  // Draw bounding boxes on canvas
  useEffect(() => {
    // Only draw when we have results with detections
    if (!detectionResult) return
    if (detectionResult.total_detections === 0) return
    if (!canvasRef.current) return
    if (!imageRef.current) return

    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas.getContext('2d')

    const drawBoxes = () => {
      const rect = img.getBoundingClientRect()

      // Natural image dimensions
      const naturalW = img.naturalWidth
      const naturalH = img.naturalHeight

      // Displayed container dimensions
      const containerW = rect.width
      const containerH = rect.height

      // Calculate scale maintaining aspect ratio
      // (same as object-contain behavior)
      const scale = Math.min(
        containerW / naturalW,
        containerH / naturalH
      )

      // Actual rendered image size
      const renderedW = naturalW * scale
      const renderedH = naturalH * scale

      // Offset from container edge to image edge
      // (the letterbox padding)
      const offsetX = (containerW - renderedW) / 2
      const offsetY = (containerH - renderedH) / 2

      // Set canvas to container size
      canvas.width = containerW
      canvas.height = containerH

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw each detection
      detectionResult.detections.forEach((det) => {
        // Scale bbox to rendered image size then offset by letterbox padding
        const x1 = (det.bbox.x1 / naturalW) * renderedW + offsetX
        const y1 = (det.bbox.y1 / naturalH) * renderedH + offsetY
        const x2 = (det.bbox.x2 / naturalW) * renderedW + offsetX
        const y2 = (det.bbox.y2 / naturalH) * renderedH + offsetY
        const w = x2 - x1
        const h = y2 - y1

        // Draw red bounding box
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2.5
        ctx.strokeRect(x1, y1, w, h)

        // Draw semi transparent fill
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
        ctx.fillRect(x1, y1, w, h)

        // Draw label background
        const pct = (det.confidence * 100).toFixed(0)
        const label = `Oil Spill ${pct}%`
        ctx.font = 'bold 11px sans-serif'
        const textW = ctx.measureText(label).width
        const labelH = 18
        const labelY = y1 > labelH ? y1 - labelH : y1
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(x1, labelY, textW + 10, labelH)

        // Draw label text
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, x1 + 5, labelY + 13)

        // Draw yellow center dot
        const cx = (det.center_pixel.cx / naturalW) * renderedW + offsetX
        const cy = (det.center_pixel.cy / naturalH) * renderedH + offsetY
        ctx.fillStyle = '#facc15'
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.fill()

        // White outline on center dot
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.stroke()
      })
    }

    // Draw immediately if image already loaded
    if (img.complete && img.naturalWidth !== 0) {
      drawBoxes()
    } else {
      img.onload = drawBoxes
    }

    // Use ResizeObserver for reliable redraws on any size change
    const observer = new ResizeObserver(() => {
      if (img.complete && img.naturalWidth !== 0) {
        drawBoxes()
      }
    })
    observer.observe(img)

    return () => {
      observer.disconnect()
    }
  }, [detectionResult])

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

          {/* ── Drone Information Card ────────────────────────────────────── */}
          <div className={cardClass}>

            {/* Title row with EXIF status badge */}
            <div className="flex justify-between items-center mb-3">
              <h2 className={titleClass}>Drone Information</h2>

              {/* EXIF status badge */}
              {exifLoading && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Reading metadata...
                </span>
              )}
              {!exifLoading && exifAutoFilled && (
                <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Auto-filled
                </span>
              )}
              {!exifLoading && exifNotFound && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                  Manual entry
                </span>
              )}
            </div>

            {/* EXIF status message */}
            {exifAutoFilled && (
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-xs text-green-400">
                  GPS and altitude filled from image metadata. You can edit if needed.
                </span>
              </div>
            )}
            {exifNotFound && (
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                <span className="text-xs text-yellow-400">
                  No GPS data found in image. Please enter coordinates manually.
                </span>
              </div>
            )}

            {/* Input fields — 2-column grid */}
            <div className="grid grid-cols-2 gap-3">

              {/* Field 1 — Latitude */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Latitude *</label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 14.599500"
                  value={droneLat}
                  onChange={(e) => setDroneLat(e.target.value)}
                  className={[
                    'w-full rounded-lg px-3 py-2 text-sm',
                    'bg-gray-100 dark:bg-gray-700',
                    'text-gray-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500',
                    'transition-colors duration-150',
                    exifAutoFilled && droneLat !== ''
                      ? 'border border-green-500/50'
                      : 'border border-gray-300 dark:border-gray-600',
                  ].join(' ')}
                />
              </div>

              {/* Field 2 — Longitude */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Longitude *</label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 120.984200"
                  value={droneLng}
                  onChange={(e) => setDroneLng(e.target.value)}
                  className={[
                    'w-full rounded-lg px-3 py-2 text-sm',
                    'bg-gray-100 dark:bg-gray-700',
                    'text-gray-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500',
                    'transition-colors duration-150',
                    exifAutoFilled && droneLng !== ''
                      ? 'border border-green-500/50'
                      : 'border border-gray-300 dark:border-gray-600',
                  ].join(' ')}
                />
              </div>

              {/* Field 3 — Altitude */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Altitude (meters) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 50.0"
                  value={droneAltitude}
                  onChange={(e) => setDroneAltitude(e.target.value)}
                  className={[
                    'w-full rounded-lg px-3 py-2 text-sm',
                    'bg-gray-100 dark:bg-gray-700',
                    'text-gray-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500',
                    'transition-colors duration-150',
                    exifAutoFilled && droneAltitude !== ''
                      ? 'border border-green-500/50'
                      : 'border border-gray-300 dark:border-gray-600',
                  ].join(' ')}
                />
              </div>

              {/* Field 4 — Heading (always manual, never auto-filled) */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Heading (0-360°) *</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="360"
                  placeholder="Enter manually (0-360)"
                  value={droneHeading}
                  onChange={(e) => setDroneHeading(e.target.value)}
                  className={[
                    'w-full rounded-lg px-3 py-2 text-sm',
                    'bg-gray-100 dark:bg-gray-700',
                    'border border-gray-300 dark:border-gray-600',
                    'text-gray-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500',
                    'transition-colors duration-150',
                  ].join(' ')}
                />
                <p className="text-xs text-gray-500 mt-1">⚠ Enter drone heading manually</p>
              </div>

            </div>

            {/* Required fields note */}
            <div className="mt-3 space-y-0.5">
              <p className="text-xs text-gray-500">
                * All fields required for accurate GPS coordinate calculation
              </p>
              <p className="text-xs text-gray-500">
                * Auto-filled values can be edited
              </p>
            </div>

          </div>

          {/* ── Detect Button Card ───────────────────────────────────────── */}
          {(() => {
            const requirements = [
              { label: 'Image selected',  met: selectedImage !== null },
              { label: 'GPS coordinates', met: droneLat !== '' && droneLng !== '' },
              { label: 'Altitude',        met: droneAltitude !== '' },
              { label: 'Heading',         met: droneHeading !== '' },
            ]
            const allRequirementsMet = requirements.every((r) => r.met)

            return (
              <div className={cardClass}>

                {/* Requirements checklist */}
                <div className="mb-1">
                  {requirements.map(({ label, met }) => (
                    <div key={label} className="flex items-center gap-2 text-xs mb-1">
                      {met ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      )}
                      <span className={met ? 'text-gray-300 dark:text-gray-300 text-gray-600' : 'text-gray-500'}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Detect Oil button */}
                <button
                  onClick={handleDetect}
                  disabled={!allRequirementsMet || isDetecting}
                  className={[
                    'py-3 px-4 rounded-xl text-base font-bold mt-4',
                    'flex items-center justify-center gap-2 w-full',
                    'transition-all duration-150',
                    isDetecting
                      ? 'bg-blue-700 text-white cursor-wait'
                      : allRequirementsMet
                        ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60',
                  ].join(' ')}
                >
                  {isDetecting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ScanSearch className="w-5 h-5" />
                  )}
                  {isDetecting ? 'Analyzing Image...' : 'Detect Oil Spill'}
                </button>

                {/* Detection error */}
                {detectionError && (
                  <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-red-400">{detectionError}</span>
                  </div>
                )}

                {/* Detection success preview */}
                {detectionResult && !isDetecting && (
                  <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    {detectionResult.total_detections > 0 ? (
                      <span className="text-xs text-green-400">
                        {detectionResult.total_detections} oil detection(s) found! See results on the right.
                      </span>
                    ) : (
                      <span className="text-xs text-yellow-400">
                        No oil detected in this image.
                      </span>
                    )}
                  </div>
                )}

                {/* Hint */}
                <p className="text-xs text-gray-500 text-center mt-3">
                  Results and GPS coordinates will appear after detection completes
                </p>

              </div>
            )
          })()}

        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN — Detection Results
        ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4">

          {/* ── Card 1: Image with Bounding Boxes ──────────────────────── */}
          <div className={cardClass}>

            {/* Title row with detection count badge */}
            <div className="flex justify-between items-center mb-3">
              <h2 className={titleClass}>Detection Results</h2>
              {detectionResult && (
                detectionResult.total_detections > 0 ? (
                  <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">
                    {detectionResult.total_detections} oil spill(s) found
                  </span>
                ) : (
                  <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
                    No oil detected
                  </span>
                )
              )}
            </div>

            {/* Empty state — no detection run yet */}
            {!detectionResult ? (
              <div className="py-12">
                <ScanSearch className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 text-center">No detection run yet</p>
                <p className="text-xs text-gray-500 text-center mt-1">
                  Upload an image and click Detect Oil Spill
                </p>
              </div>
            ) : (
              /* Image with canvas overlay for bounding boxes */
              <div className="relative w-full">
                <img
                  ref={imageRef}
                  src={imagePreview}
                  className="w-full rounded-lg block"
                  style={{ maxHeight: '320px', objectFit: 'contain' }}
                  alt="Detection result"
                />
                {/* Canvas overlay — only rendered when there are detections */}
                {detectionResult?.total_detections > 0 && (
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 pointer-events-none rounded-lg"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                {/* Analysing overlay — shown while the API call is in flight */}
                {isDetecting && (
                  <div className="absolute inset-0 bg-gray-900/70 rounded-lg flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <span className="text-sm text-white mt-2">Analyzing image...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Card 2: Detection Details list ─────────────────────────── */}
          {/* Only rendered when there is at least one detection */}
          {detectionResult !== null && detectionResult.total_detections > 0 && (
            <div className={cardClass}>
              <h2 className={`${titleClass} mb-3`}>Detected Oil Spills</h2>

              {/* One row per detection */}
              {detectionResult.detections.map((det, index) => (
                <div
                  key={det.detection_id}
                  className="py-3 border-b border-gray-700/50 last:border-0"
                >
                  <div className="flex justify-between items-start gap-3">

                    {/* ── Left side: details ─────────────────────────── */}
                    <div>
                      {/* Header: dot + name + confidence badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Detection {index + 1}
                        </span>
                        <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">
                          {(det.confidence * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* GPS coordinates */}
                      {det.estimated_gps.lat !== 0 ? (
                        <p className="text-xs text-gray-400">
                          GPS: {det.estimated_gps.lat.toFixed(4)}, {det.estimated_gps.lng.toFixed(4)}
                        </p>
                      ) : (
                        <p className="text-xs text-yellow-400">
                          GPS: Requires drone coordinates
                        </p>
                      )}

                      {/* Area estimate */}
                      {det.area_sqm > 0 && (
                        <p className="text-xs text-gray-500">
                          Area: {det.area_sqm.toFixed(1)} m²
                        </p>
                      )}
                    </div>

                    {/* ── Right side: navigate button ─────────────────── */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {det.estimated_gps.lat !== 0 ? (
                        <>
                          <button
                            onClick={() => {
                              navigateToLocation(
                                det.estimated_gps.lat,
                                det.estimated_gps.lng,
                                'detection',
                                det.detection_id
                              )
                              setNavigatedId(det.detection_id)
                              setTimeout(() => setNavigatedId(null), 1000)
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <Navigation className="w-3 h-3" />
                            Navigate
                          </button>
                          {/* 1-second success flash after clicking Navigate */}
                          {navigatedId === det.detection_id && (
                            <span className="text-xs text-green-400">Navigating!</span>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-gray-500 text-right">
                          Enter drone GPS for navigation
                        </p>
                      )}
                    </div>

                  </div>
                </div>
              ))}

              {/* Summary footer: image dimensions + timestamp */}
              <div className="border-t border-gray-700/50 pt-3 mt-2 flex justify-between text-xs text-gray-400">
                <span>
                  Image: {detectionResult.image_width}x{detectionResult.image_height}px
                </span>
                <span>
                  Analyzed: {new Date(detectionResult.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  )
}
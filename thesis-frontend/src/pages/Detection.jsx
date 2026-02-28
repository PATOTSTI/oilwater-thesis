/**
 * Detection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Oil detection page for the AquaDetect dashboard.
 *
 * Left column  – Image upload card + Drone information inputs + Detect button
 * Right column – Placeholder (results panel — next prompt)
 */

import { useState, useRef } from 'react'
import { Upload, AlertCircle, CheckCircle, Loader2, Circle, ScanSearch } from 'lucide-react'
import exifr from 'exifr'
import { detectOil } from '../api/endpoints'

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
            RIGHT COLUMN — Placeholder (results panel — next prompt)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full lg:w-1/2" />

      </div>
    </div>
  )
}
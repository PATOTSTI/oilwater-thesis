/**
 * BatchScreening.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-flight drone image triage page.
 *
 * Workflow:
 *   1. User selects multiple drone images copied from the SD card.
 *   2. Clicks "Screen Images" — all files are sent to POST /detect/screen-batch.
 *   3. Results arrive grouped into With Oil / Uncertain / Without Oil.
 *   4. User reviews only the flagged images before opening them one by one
 *      in the Detection page for detailed bounding-box analysis.
 */

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  AlertCircle,
  CheckCircle,
  Loader2,
  Images,
  Droplets,
  HelpCircle,
  ScanSearch,
  ExternalLink,
} from 'lucide-react'
import { screenBatch } from '../api/endpoints'

// ── Shared card / title style — matches Detection.jsx ─────────────────────────
const cardClass =
  'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5'
const titleClass = 'text-sm font-semibold text-gray-900 dark:text-white'

// ── Per-status display config ─────────────────────────────────────────────────
const STATUS_CFG = {
  with_oil: {
    label: 'With Oil',
    badgeClass: 'bg-red-500/20 text-red-400',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-500/40',
    countClass: 'text-red-400',
    icon: Droplets,
  },
  uncertain: {
    label: 'Uncertain',
    badgeClass: 'bg-yellow-500/20 text-yellow-400',
    dotClass: 'bg-yellow-500',
    borderClass: 'border-yellow-500/40',
    countClass: 'text-yellow-400',
    icon: HelpCircle,
  },
  without_oil: {
    label: 'Without Oil',
    badgeClass: 'bg-green-500/20 text-green-400',
    dotClass: 'bg-green-500',
    borderClass: 'border-green-500/40',
    countClass: 'text-green-400',
    icon: CheckCircle,
  },
}

const FILTER_TABS = [
  { key: 'all',         label: 'All Images'   },
  { key: 'with_oil',   label: 'With Oil'     },
  { key: 'uncertain',  label: 'Uncertain'    },
  { key: 'without_oil', label: 'Without Oil' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function tabCount(key, result) {
  if (!result) return 0
  if (key === 'all')         return result.total_images
  if (key === 'with_oil')   return result.with_oil_count
  if (key === 'uncertain')  return result.uncertain_count
  return result.without_oil_count
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BatchScreening() {
  // ── File state ──────────────────────────────────────────────────────────────
  const [files, setFiles]             = useState([])           // File[] chosen by user
  const [previewUrls, setPreviewUrls] = useState({})           // filename → blob URL
  const [isDragging, setIsDragging]   = useState(false)
  const [fileError, setFileError]     = useState(null)

  // ── Screening state ──────────────────────────────────────────────────────────
  const [isScreening, setIsScreening]         = useState(false)
  const [uploadProgress, setUploadProgress]   = useState(0)    // 0-100 during upload
  const [screeningResult, setScreeningResult] = useState(null)
  const [screeningError, setScreeningError]   = useState(null)

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState('all')

  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  // ── Open a screened image in the detailed Detection page ──────────────────────
  // Passes the File object + screening metadata through React Router location.state
  // so Detection.jsx can pre-load the image and show the screening context banner.
  const handleOpenInDetection = useCallback((item) => {
    const file = files.find((f) => f.name === item.filename)
    if (!file) return
    navigate('/detection', {
      state: {
        screenedFile:        file,
        screenedStatus:      item.status,
        screenedConfidence:  item.best_confidence,
        screenedDetections:  item.total_detections,
      },
    })
  }, [files, navigate])

  // ── File selection ────────────────────────────────────────────────────────────
  const applyFiles = useCallback((rawList) => {
    const valid = [...rawList].filter((f) =>
      ['image/jpeg', 'image/jpg', 'image/png'].includes(f.type)
    )
    const skipped = rawList.length - valid.length

    if (valid.length === 0) {
      setFileError('No valid images found. Only JPG and PNG files are supported.')
      return
    }
    if (valid.length > 100) {
      setFileError(`Maximum 100 images per batch. You selected ${valid.length}.`)
      return
    }

    // Build blob-URL preview map keyed by filename
    const urls = {}
    valid.forEach((f) => { urls[f.name] = URL.createObjectURL(f) })

    setPreviewUrls((prev) => {
      Object.values(prev).forEach(URL.revokeObjectURL)
      return urls
    })

    setFiles(valid)
    setFileError(skipped > 0 ? `${skipped} non-image file(s) were ignored.` : null)
    setScreeningResult(null)
    setScreeningError(null)
    setActiveFilter('all')
  }, [])

  const handleReset = useCallback(() => {
    Object.values(previewUrls).forEach(URL.revokeObjectURL)
    setFiles([])
    setPreviewUrls({})
    setFileError(null)
    setScreeningResult(null)
    setScreeningError(null)
    setUploadProgress(0)
    setActiveFilter('all')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [previewUrls])

  // ── Run screening ─────────────────────────────────────────────────────────────
  const handleScreen = async () => {
    if (!files.length) return

    setIsScreening(true)
    setScreeningError(null)
    setScreeningResult(null)
    setUploadProgress(0)

    try {
      const result = await screenBatch(files, setUploadProgress)
      setScreeningResult(result)
      setActiveFilter('all')
    } catch (err) {
      setScreeningError(err.message || 'Screening failed. Please try again.')
    } finally {
      setIsScreening(false)
      setUploadProgress(0)
    }
  }

  // ── Filtered grid ─────────────────────────────────────────────────────────────
  const filteredResults = (screeningResult?.results ?? []).filter(
    (r) => activeFilter === 'all' || r.status === activeFilter
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 w-full">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Images className="w-6 h-6 text-blue-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Batch Image Screening
          </h1>
        </div>
        <p className="text-sm text-gray-500 ml-9">
          Import drone images from the SD card and automatically sort them into{' '}
          <span className="text-red-400 font-medium">With Oil</span>,{' '}
          <span className="text-yellow-400 font-medium">Uncertain</span>, and{' '}
          <span className="text-green-400 font-medium">Without Oil</span> groups.
          No GPS or drone metadata required.
        </p>
      </div>

      <div className="flex flex-col gap-5">

        {/* ══════════════════════════════════════════════════════════════════════
            UPLOAD CARD
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={cardClass}>
          <h2 className={`${titleClass} mb-3`}>Select Drone Images</h2>

          {files.length === 0 ? (
            /* ── Drop zone ─────────────────────────────────────────────────── */
            <>
              <div
                className={[
                  'border-2 border-dashed rounded-xl p-10 transition-colors duration-150 cursor-pointer',
                  isDragging
                    ? 'border-blue-500 bg-blue-500/5'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
                ].join(' ')}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  if (e.dataTransfer.files.length) applyFiles(e.dataTransfer.files)
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-400 text-center mb-1">
                  Drag and drop your drone images here, or click to browse
                </p>
                <p className="text-xs text-gray-500 text-center">
                  JPG &amp; PNG &nbsp;•&nbsp; Up to 100 images per batch
                </p>
              </div>

              <div className="flex justify-center mt-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg transition-colors"
                >
                  Browse Files
                </button>
              </div>
            </>
          ) : (
            /* ── Files selected — summary row ───────────────────────────────── */
            <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-3">
                <Images className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {files.length} image{files.length !== 1 ? 's' : ''} selected
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatBytes(files.reduce((acc, f) => acc + f.size, 0))} total
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* File warning (skipped files, too many, etc.) */}
          {fileError && (
            <div className="flex items-center gap-2 mt-3">
              <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
              <span className="text-xs text-yellow-400">{fileError}</span>
            </div>
          )}

          {/* Hidden multi-file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) applyFiles(e.target.files) }}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SCREEN BUTTON + PROGRESS
        ══════════════════════════════════════════════════════════════════════ */}
        {files.length > 0 && (
          <div className={cardClass}>

            {/* Progress bar — visible only while screening */}
            {isScreening && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>
                    {uploadProgress < 100
                      ? `Uploading… ${uploadProgress}%`
                      : 'Running model inference on each image…'}
                  </span>
                  <span>{files.length} image{files.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                  />
                </div>
                {uploadProgress >= 100 && (
                  <p className="text-xs text-blue-400 mt-1.5 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Model is analyzing each image — please wait…
                  </p>
                )}
              </div>
            )}

            {/* Screen button */}
            <button
              onClick={handleScreen}
              disabled={isScreening || files.length === 0}
              className={[
                'w-full py-3 px-4 rounded-xl text-base font-bold',
                'flex items-center justify-center gap-2',
                'transition-all duration-150',
                isScreening
                  ? 'bg-blue-700 text-white cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white',
              ].join(' ')}
            >
              {isScreening
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <ScanSearch className="w-5 h-5" />}
              {isScreening
                ? 'Screening images…'
                : `Screen ${files.length} Image${files.length !== 1 ? 's' : ''}`}
            </button>

            {/* Screening error */}
            {screeningError && (
              <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-400">{screeningError}</span>
              </div>
            )}

            <p className="text-xs text-gray-500 text-center mt-3">
              No GPS, altitude, or heading required for screening
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            RESULTS SECTION  (only shown after screening completes)
        ══════════════════════════════════════════════════════════════════════ */}
        {screeningResult && (
          <>
            {/* ── Summary stat cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

              {/* Total screened */}
              <div className={`${cardClass} !p-4`}>
                <p className="text-xs text-gray-500 mb-1">Total Screened</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white leading-none">
                  {screeningResult.total_images}
                </p>
                <p className="text-xs text-gray-500 mt-1">images processed</p>
              </div>

              {/* With Oil */}
              <div className={`${cardClass} !p-4 border-red-500/30`}>
                <p className="text-xs text-red-400 mb-1">With Oil</p>
                <p className="text-3xl font-bold text-red-400 leading-none">
                  {screeningResult.with_oil_count}
                </p>
                <p className="text-xs text-gray-500 mt-1">confirmed detections</p>
              </div>

              {/* Uncertain */}
              <div className={`${cardClass} !p-4 border-yellow-500/30`}>
                <p className="text-xs text-yellow-400 mb-1">Uncertain</p>
                <p className="text-3xl font-bold text-yellow-400 leading-none">
                  {screeningResult.uncertain_count}
                </p>
                <p className="text-xs text-gray-500 mt-1">needs manual review</p>
              </div>

              {/* Without Oil */}
              <div className={`${cardClass} !p-4 border-green-500/30`}>
                <p className="text-xs text-green-400 mb-1">Without Oil</p>
                <p className="text-3xl font-bold text-green-400 leading-none">
                  {screeningResult.without_oil_count}
                </p>
                <p className="text-xs text-gray-500 mt-1">clean images</p>
              </div>
            </div>

            {/* ── Results card: filter tabs + image grid ──────────────────────── */}
            <div className={cardClass}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <h2 className={titleClass}>Screening Results</h2>
                <span className="text-xs text-gray-500">
                  Screened {new Date(screeningResult.screened_at).toLocaleString()}
                </span>
              </div>

              {/* ── Filter tabs ─────────────────────────────────────────────── */}
              <div className="flex gap-1.5 mb-5 flex-wrap">
                {FILTER_TABS.map(({ key, label }) => {
                  const count = tabCount(key, screeningResult)
                  const isActive = activeFilter === key
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveFilter(key)}
                      className={[
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        'flex items-center gap-1.5',
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600',
                      ].join(' ')}
                    >
                      {/* Colored dot for non-"all" tabs */}
                      {key !== 'all' && (
                        <span className={[
                          'w-2 h-2 rounded-full flex-shrink-0',
                          key === 'with_oil'    ? 'bg-red-400'
                          : key === 'uncertain' ? 'bg-yellow-400'
                          : 'bg-green-400',
                        ].join(' ')} />
                      )}
                      {label}
                      {/* Count pill */}
                      <span className={[
                        'rounded-full px-1.5 py-0.5 text-xs leading-none',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300',
                      ].join(' ')}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* ── Image grid ──────────────────────────────────────────────── */}
              {filteredResults.length === 0 ? (
                <div className="py-14 text-center">
                  <CheckCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No images in this category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filteredResults.map((item) => {
                    const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.without_oil
                    const StatusIcon = cfg.icon
                    const thumbUrl = previewUrls[item.filename]

                    return (
                      <div
                        key={item.filename}
                        className={[
                          'rounded-xl border overflow-hidden',
                          'bg-gray-50 dark:bg-gray-700/50',
                          'transition-all duration-150 hover:shadow-lg hover:scale-[1.02]',
                          cfg.borderClass,
                        ].join(' ')}
                      >
                        {/* ── Thumbnail ─────────────────────────────────── */}
                        <div className="relative aspect-square overflow-hidden bg-gray-200 dark:bg-gray-700">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={item.filename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Images className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          {/* Status indicator dot */}
                          <span className={[
                            'absolute top-1.5 right-1.5 w-3 h-3 rounded-full',
                            'border-2 border-white dark:border-gray-800 shadow-sm',
                            cfg.dotClass,
                          ].join(' ')} />
                        </div>

                        {/* ── Card info ─────────────────────────────────── */}
                        <div className="p-2.5">
                          {/* Status badge */}
                          <span className={[
                            'inline-flex items-center gap-1 text-xs px-1.5 py-0.5',
                            'rounded-full font-medium mb-1.5',
                            cfg.badgeClass,
                          ].join(' ')}>
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>

                          {/* Filename */}
                          <p
                            className="text-xs text-gray-700 dark:text-gray-300 truncate font-mono leading-tight"
                            title={item.filename}
                          >
                            {item.filename}
                          </p>

                          {/* Confidence + detection count */}
                          <div className="flex justify-between mt-1.5 text-xs text-gray-500">
                            <span title="Best model confidence">
                              {(item.best_confidence * 100).toFixed(0)}% conf.
                            </span>
                            <span title="Detections above threshold">
                              {item.total_detections} det.
                            </span>
                          </div>

                          {/* Image dimensions */}
                          {item.image_width > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {item.image_width}×{item.image_height}px
                            </p>
                          )}

                          {/* Open in Detection — shown for with_oil and uncertain only */}
                          {(item.status === 'with_oil' || item.status === 'uncertain') && (
                            <button
                              onClick={() => handleOpenInDetection(item)}
                              className={[
                                'mt-2 w-full flex items-center justify-center gap-1.5',
                                'text-xs font-medium py-1.5 rounded-lg transition-colors',
                                item.status === 'with_oil'
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200',
                              ].join(' ')}
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open in Detection
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

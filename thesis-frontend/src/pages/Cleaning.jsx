import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  startCleaning,
  stopCleaning,
  getCleaningStatus
} from '../api/endpoints'
import {
  Play,
  Square,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Crosshair,
  Waves
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMap
} from 'react-leaflet'

// Keeps the map view centred when coordinates change
function MapRecenter({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center)
  }, [center, map])
  return null
}

export default function Cleaning() {
  const { deviceStatus, currentMode } = useApp()

  // Form state
  const [centerLat, setCenterLat] = useState('')
  const [centerLng, setCenterLng] = useState('')
  const [maxRadius, setMaxRadius] = useState('5.0')
  const [stepSize, setStepSize] = useState('0.5')
  const [innerSpeed, setInnerSpeed] = useState('120')
  const [outerSpeed, setOuterSpeed] = useState('180')

  // UI state
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [cleaningError, setCleaningError] = useState(null)
  const [cleaningSuccess, setCleaningSuccess] = useState(null)
  const [cleaningStatus, setCleaningStatus] = useState(null)

  // Progress tracking state
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [cleaningStartTime, setCleaningStartTime] = useState(null)

  // Fetch cleaning status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await getCleaningStatus()
        setCleaningStatus(result)
      } catch (err) {
        console.warn('[Cleaning] Status fetch:', err.message)
      }
    }
    fetchStatus()
  }, [])

  // Poll for live status updates while cleaning is active
  useEffect(() => {
    let interval = null

    if (cleaningStatus?.active) {
      if (!cleaningStartTime) {
        setCleaningStartTime(Date.now())
      }

      interval = setInterval(async () => {
        try {
          const result = await getCleaningStatus()
          setCleaningStatus(result)

          if (cleaningStartTime) {
            setElapsedSeconds(
              Math.floor((Date.now() - cleaningStartTime) / 1000)
            )
          }
        } catch (err) {
          console.warn('[Cleaning] Poll failed:', err.message)
        }
      }, 2000)
    } else {
      setCleaningStartTime(null)
      setElapsedSeconds(0)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [cleaningStatus?.active, cleaningStartTime])

  // Handle start cleaning
  const handleStartCleaning = async () => {
    if (!centerLat || !centerLng) {
      setCleaningError('Please enter center GPS coordinates')
      return
    }

    console.log('centerLat:', centerLat)
    console.log('centerLng:', centerLng)
    console.log('parsed lat:', parseFloat(centerLat))
    console.log('parsed lng:', parseFloat(centerLng))

    const lat = parseFloat(centerLat)
    const lng = parseFloat(centerLng)
    const radius = parseFloat(maxRadius)
    const step = parseFloat(stepSize)
    const inner = parseInt(innerSpeed)
    const outer = parseInt(outerSpeed)

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setCleaningError('Center latitude must be between -90 and 90')
      return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setCleaningError('Center longitude must be between -180 and 180')
      return
    }
    if (isNaN(radius) || radius < 1 || radius > 50) {
      setCleaningError('Max radius must be between 1 and 50 meters')
      return
    }
    if (isNaN(step) || step < 0.1 || step > 5) {
      setCleaningError('Step size must be between 0.1 and 5 meters')
      return
    }
    if (isNaN(inner) || inner < 50 || inner > 255) {
      setCleaningError('Inner speed must be between 50 and 255')
      return
    }
    if (isNaN(outer) || outer < 50 || outer > 255) {
      setCleaningError('Outer speed must be between 50 and 255')
      return
    }

    try {
      setIsStarting(true)
      setCleaningError(null)
      setCleaningSuccess(null)

      await startCleaning({
        center_lat: lat,
        center_lng: lng,
        max_radius: radius,
        step_size: step,
        inner_speed: inner,
        outer_speed: outer
      })

      setCleaningSuccess('Cleaning pattern started successfully!')

      const status = await getCleaningStatus()
      setCleaningStatus(status)

      setTimeout(() => setCleaningSuccess(null), 3000)
    } catch (err) {
      setCleaningError(err.message || 'Failed to start cleaning')
    } finally {
      setIsStarting(false)
    }
  }

  // Handle stop cleaning
  const handleStopCleaning = async () => {
    try {
      setIsStopping(true)
      setCleaningError(null)

      await stopCleaning()

      setCleaningSuccess('Cleaning stopped.')

      const status = await getCleaningStatus()
      setCleaningStatus(status)

      setTimeout(() => setCleaningSuccess(null), 3000)
    } catch (err) {
      setCleaningError(err.message || 'Failed to stop cleaning')
    } finally {
      setIsStopping(false)
    }
  }

  // Format seconds as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Progress bar color based on completion percentage
  const getProgressColor = (percent) => {
    if (percent >= 75) return 'bg-green-500'
    if (percent >= 40) return 'bg-blue-500'
    return 'bg-cyan-500'
  }

  // Generate [lat, lng] points for the spiral preview polyline
  const generateSpiralPoints = (cLat, cLng, maxRad, stepSz) => {
    const points = []
    const lat = parseFloat(cLat)
    const lng = parseFloat(cLng)
    const maxR = parseFloat(maxRad)
    const step = parseFloat(stepSz)

    if (isNaN(lat) || isNaN(lng) || isNaN(maxR) || isNaN(step)) return []

    for (let radius = step; radius <= maxR; radius += step) {
      const numPoints = Math.max(8, Math.floor((2 * Math.PI * radius) / step))
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI
        const deltaLat = (radius * Math.cos(angle)) / 111000
        const deltaLng =
          (radius * Math.sin(angle)) /
          (111000 * Math.cos((lat * Math.PI) / 180))
        points.push([lat + deltaLat, lng + deltaLng])
      }
    }

    return points
  }

  // Derived map values
  const mapCenter = cleaningStatus?.active
    ? [cleaningStatus.center.lat, cleaningStatus.center.lng]
    : centerLat && centerLng
      ? [parseFloat(centerLat), parseFloat(centerLng)]
      : [14.5995, 120.9842]

  const centerMarkerPos =
    cleaningStatus?.active
      ? [cleaningStatus.center.lat, cleaningStatus.center.lng]
      : centerLat && centerLng
        ? [parseFloat(centerLat), parseFloat(centerLng)]
        : null

  const spiralPoints = cleaningStatus?.active
    ? generateSpiralPoints(
        cleaningStatus.center.lat,
        cleaningStatus.center.lng,
        maxRadius,
        stepSize
      )
    : centerLat
      ? generateSpiralPoints(centerLat, centerLng, maxRadius, stepSize)
      : []

  const isStartDisabled =
    cleaningStatus?.active || isStarting || !centerLat || !centerLng

  const isStopDisabled = !cleaningStatus?.active || isStopping

  return (
    <div className="p-6 h-full w-full">
      <div className="flex flex-col gap-6">

      {/* Two column layout — controls + progress */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Left column — controls */}
        <div className="w-full lg:w-96 flex flex-col gap-4">

          {/* Card 1 — Cleaning Center */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Cleaning Center
              </span>
              <button
                onClick={() => {
                  if (deviceStatus?.device_gps?.lat) {
                    setCenterLat(deviceStatus.device_gps.lat.toFixed(6))
                    setCenterLng(deviceStatus.device_gps.lng.toFixed(6))
                  } else {
                    setCleaningError('Device GPS not available')
                  }
                }}
                className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded-lg transition-colors"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Use Device Position
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Center Latitude *
                </label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 14.5995"
                  value={centerLat}
                  onChange={(e) => setCenterLat(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Center Longitude *
                </label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 120.9842"
                  value={centerLng}
                  onChange={(e) => setCenterLng(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Card 2 — Cleaning Parameters */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Cleaning Parameters
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Max Radius (m)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="50"
                  value={maxRadius}
                  onChange={(e) => setMaxRadius(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How far to spiral out (1-50m)
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Step Size (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  value={stepSize}
                  onChange={(e) => setStepSize(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Distance between spiral rings
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Inner Speed (PWM)
                </label>
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="255"
                  value={innerSpeed}
                  onChange={(e) => setInnerSpeed(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Speed for inner rings (50-255)
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Outer Speed (PWM)
                </label>
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="255"
                  value={outerSpeed}
                  onChange={(e) => setOuterSpeed(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Speed for outer rings (50-255)
                </p>
              </div>
            </div>
          </div>

          {/* Card 3 — Start / Stop Controls */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
            {/* Status indicator */}
            <div className="flex items-center gap-2 mb-4">
              {cleaningStatus?.active ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-green-400">
                    Cleaning Active
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                  <span className="text-sm font-medium text-gray-400">
                    Cleaning Inactive
                  </span>
                </>
              )}
            </div>

            {/* Start Cleaning button */}
            <button
              onClick={handleStartCleaning}
              disabled={isStartDisabled}
              className={`w-full mb-2 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                isStartDisabled
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Cleaning Pattern
                </>
              )}
            </button>

            {/* Stop Cleaning button */}
            <button
              onClick={handleStopCleaning}
              disabled={isStopDisabled}
              className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                isStopDisabled
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isStopping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  Stop Cleaning
                </>
              )}
            </button>

            {/* Success message */}
            {cleaningSuccess && (
              <div className="flex items-center gap-2 mt-3 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-xs text-green-400">{cleaningSuccess}</span>
              </div>
            )}

            {/* Error message */}
            {cleaningError && (
              <div className="flex items-center gap-2 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-xs text-red-400">{cleaningError}</span>
              </div>
            )}

            {/* Mode warning */}
            {currentMode !== 'cleaning' && cleaningStatus?.active && (
              <div className="flex items-start gap-2 mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <span className="text-xs text-yellow-400">
                  Device mode is not set to cleaning. The pattern may not
                  execute correctly.
                </span>
              </div>
            )}
          </div>

        </div>

        {/* Right column — progress display */}
        <div className="flex-1 flex flex-col gap-4">

          {/* Card 1 — Cleaning Status Overview */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Cleaning Status
            </p>

            {!cleaningStatus?.active ? (
              // Inactive state
              <div className="py-8 flex flex-col items-center">
                <Waves className="w-12 h-12 text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-400">
                  No Active Cleaning Pattern
                </p>
                <p className="text-xs text-gray-500 text-center mt-1 max-w-48">
                  Configure and start a cleaning pattern using the controls on
                  the left
                </p>
              </div>
            ) : (
              // Active state — 4 stat tiles
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Progress</p>
                  <p className="text-2xl font-bold text-cyan-400">
                    {cleaningStatus.progress_percent != null
                      ? cleaningStatus.progress_percent.toFixed(1) + '%'
                      : '--'}
                  </p>
                </div>

                <div className="bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Elapsed</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {formatTime(elapsedSeconds)}
                  </p>
                </div>

                <div className="bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Current Radius</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {cleaningStatus.current_radius != null
                      ? cleaningStatus.current_radius.toFixed(1) + 'm'
                      : '--'}
                  </p>
                </div>

                <div className="bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Waypoints</p>
                  <p className="text-2xl font-bold text-green-400">
                    {cleaningStatus.current_waypoint_index != null
                      ? `${cleaningStatus.current_waypoint_index}/${cleaningStatus.total_waypoints}`
                      : '--'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card 2 — Progress Bar (only when active) */}
          {cleaningStatus?.active && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Pattern Progress
              </p>

              {/* Waypoint progress bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all duration-500 ease-out ${getProgressColor(cleaningStatus.progress_percent ?? 0)}`}
                  style={{ width: `${cleaningStatus.progress_percent ?? 0}%` }}
                />
              </div>

              <div className="flex justify-between mt-2">
                <span className="text-xs text-gray-400">
                  Waypoint {cleaningStatus.current_waypoint_index} of{' '}
                  {cleaningStatus.total_waypoints}
                </span>
                <span
                  className={`text-xs font-bold ${
                    (cleaningStatus.progress_percent ?? 0) >= 75
                      ? 'text-green-400'
                      : (cleaningStatus.progress_percent ?? 0) >= 40
                        ? 'text-blue-400'
                        : 'text-cyan-400'
                  }`}
                >
                  {(cleaningStatus.progress_percent ?? 0).toFixed(1)}% complete
                </span>
              </div>

              {/* Radius progress bar */}
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-gray-400">Spiral Radius</span>
                  <span className="text-xs font-bold text-purple-400">
                    {cleaningStatus.current_radius != null
                      ? cleaningStatus.current_radius.toFixed(1) + 'm'
                      : '--'}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-purple-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        cleaningStatus.max_radius
                          ? (cleaningStatus.current_radius /
                              cleaningStatus.max_radius) *
                              100
                          : (cleaningStatus.current_radius /
                              parseFloat(maxRadius)) *
                              100,
                        100
                      )}%`
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Card 3 — Active Parameters Summary (only when active) */}
          {cleaningStatus?.active && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Active Parameters
              </p>

              <div className="divide-y divide-gray-700/50">
                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-400">Center GPS</span>
                  <span className="text-sm font-mono font-medium text-gray-200 dark:text-gray-200 text-gray-800">
                    {cleaningStatus.center
                      ? `${cleaningStatus.center.lat.toFixed(4)}, ${cleaningStatus.center.lng.toFixed(4)}`
                      : '--'}
                  </span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-400">Max Radius</span>
                  <span className="text-sm font-mono font-medium text-gray-200 dark:text-gray-200 text-gray-800">
                    {maxRadius}m
                  </span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-400">Step Size</span>
                  <span className="text-sm font-mono font-medium text-gray-200 dark:text-gray-200 text-gray-800">
                    {stepSize}m
                  </span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-400">Inner Speed</span>
                  <span className="text-sm font-mono font-medium text-gray-200 dark:text-gray-200 text-gray-800">
                    {innerSpeed} PWM
                  </span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-400">Outer Speed</span>
                  <span className="text-sm font-mono font-medium text-gray-200 dark:text-gray-200 text-gray-800">
                    {outerSpeed} PWM
                  </span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-400">Total Waypoints</span>
                  <span className="text-sm font-mono font-medium text-gray-200 dark:text-gray-200 text-gray-800">
                    {cleaningStatus.total_waypoints ?? '--'}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Full width map card — Spiral Pattern Preview */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
        {/* Title row with status badge */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Spiral Pattern Preview
          </span>
          {cleaningStatus?.active ? (
            <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
              Pattern Active
            </span>
          ) : centerLat !== '' ? (
            <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
              Preview Mode
            </span>
          ) : (
            <span className="bg-gray-500/20 text-gray-400 text-xs px-2 py-0.5 rounded-full">
              Enter coordinates to preview
            </span>
          )}
        </div>

        {/* Map */}
        <div className="h-80 rounded-lg overflow-hidden">
          <MapContainer
            center={mapCenter}
            zoom={18}
            scrollWheelZoom={true}
            className="h-full w-full"
          >
            <MapRecenter center={mapCenter} />

            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* Center marker */}
            {centerMarkerPos && (
              <CircleMarker
                center={centerMarkerPos}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.9,
                  weight: 2
                }}
                radius={8}
              >
                <Popup>
                  Cleaning Center
                  <br />
                  Lat: {centerMarkerPos[0].toFixed(4)}, Lng:{' '}
                  {centerMarkerPos[1].toFixed(4)}
                </Popup>
              </CircleMarker>
            )}

            {/* Spiral path preview */}
            {spiralPoints.length > 0 && (
              <Polyline
                positions={spiralPoints}
                pathOptions={{
                  color: '#06b6d4',
                  weight: 1.5,
                  dashArray: '4 4',
                  opacity: 0.7
                }}
              />
            )}
          </MapContainer>
        </div>
      </div>

      </div>
    </div>
  )
}

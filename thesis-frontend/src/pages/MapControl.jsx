import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { Home, Navigation, Loader2, RefreshCw, ScanSearch, Check } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigation } from '../hooks/useNavigation'
import { setHome, getDetections } from '../api/endpoints'

// ── Auto-center: flies to device position once when device comes online ────────
function MapAutoCenter({ deviceGps, isOnline }) {
  const map = useMap()
  useEffect(() => {
    const lat = deviceGps?.lat
    const lng = deviceGps?.lng
    if (isOnline && lat && lat !== 0.0 && lng && lng !== 0.0) {
      map.flyTo([lat, lng], 16)
    }
  }, [isOnline]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function MapControl() {
  const { deviceStatus, isDeviceOnline } = useApp()

  // Read GPS fields directly from the full payload object
  const deviceGps = deviceStatus?.device_gps ?? null
  const homeGps   = deviceStatus?.home_gps   ?? null
  const targetGps = deviceStatus?.target_gps ?? null
  const heading   = deviceStatus?.heading    ?? 0

  // Debug — remove once confirmed working
  console.log('[MapControl] deviceStatus:', deviceStatus)
  console.log('[MapControl] deviceGps:', deviceGps)

  // Helper: null/undefined first, then reject the backend default 0.0
  const hasCoords = (gps) =>
    gps != null &&
    gps.lat != null && gps.lng != null &&
    gps.lat !== 0.0 && gps.lng !== 0.0

  // ── Navigation controls state ───────────────────────────────────────────
  const { navigateToLocation, navigateHome, isLoading: navLoading } = useNavigation()

  const [targetLat,  setTargetLat]  = useState('')
  const [targetLng,  setTargetLng]  = useState('')
  const [navError,   setNavError]   = useState('')
  const [navSuccess, setNavSuccess] = useState(false)

  const [homeSaved,  setHomeSaved]  = useState(false)

  const handleSetHome = async () => {
    try {
      await setHome()
      setHomeSaved(true)
      setTimeout(() => setHomeSaved(false), 2000)
    } catch (err) {
      console.error('[MapControl] setHome failed:', err.message)
    }
  }

  const handleNavigate = async () => {
    setNavError('')
    const lat = parseFloat(targetLat)
    const lng = parseFloat(targetLng)
    if (targetLat === '' || targetLng === '') {
      setNavError('Both latitude and longitude are required.')
      return
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setNavError('Latitude must be a number between -90 and 90.')
      return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setNavError('Longitude must be a number between -180 and 180.')
      return
    }
    try {
      await navigateToLocation(lat, lng, 'manual_input')
      setNavSuccess(true)
      setTimeout(() => setNavSuccess(false), 2000)
    } catch (err) {
      setNavError(err.message || 'Failed to send navigation target.')
    }
  }

  // ── Past detections state ───────────────────────────────────────────
  const [detections,        setDetections]        = useState([])
  const [detectionsLoading, setDetectionsLoading] = useState(true)
  const [detectionsError,   setDetectionsError]   = useState('')

  const loadDetections = async () => {
    setDetectionsLoading(true)
    setDetectionsError('')
    try {
      const result = await getDetections({ limit: 5 })
      // getDetections returns the unwrapped payload; shape: { detections: [...] } or array
      setDetections(Array.isArray(result) ? result : (result?.detections ?? []))
    } catch (err) {
      setDetectionsError(err.message || 'Failed to load detections.')
    } finally {
      setDetectionsLoading(false)
    }
  }

  useEffect(() => { loadDetections() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Shared card style
  const CARD = 'rounded-xl border border-gray-200 bg-white p-5 shadow-lg dark:border-gray-700 dark:bg-gray-800'
  const FIELD_ROW = 'flex items-center justify-between border-b border-gray-200/50 py-1.5 dark:border-gray-700/50'
  const VALUE = 'text-sm font-mono font-medium text-gray-800 dark:text-gray-200'
  const INPUT = [
    'w-full rounded-lg border px-3 py-2 text-sm',
    'border-gray-300 bg-gray-100 text-gray-900',
    'dark:border-gray-600 dark:bg-gray-700 dark:text-white',
    'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500',
  ].join(' ')

  return (
    <div className="flex flex-col gap-6 p-6 lg:flex-row">

      {/* ── Map Card ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">

        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Live Device Location
          </p>

          {/* Connection status pill */}
          {isDeviceOnline ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-medium text-green-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-500/20 px-3 py-1 text-xs font-medium text-gray-400">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Offline
            </span>
          )}
        </div>

        {/* Leaflet map */}
        <div className="h-[calc(100vh-220px)] min-h-96 overflow-hidden rounded-lg">
          <MapContainer
            center={[14.5995, 120.9842]}
            zoom={16}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* Auto-center on device coming online */}
            <MapAutoCenter deviceGps={deviceGps} isOnline={isDeviceOnline} />

            {/* ── Device position marker (blue) ─────────────────────────────── */}
            {hasCoords(deviceGps) && (
              <CircleMarker
                center={[deviceGps.lat, deviceGps.lng]}
                radius={10}
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>
                  <strong>Device Position</strong><br />
                  Lat: {deviceGps.lat.toFixed(4)}<br />
                  Lng: {deviceGps.lng.toFixed(4)}<br />
                  Heading: {heading}°
                </Popup>
              </CircleMarker>
            )}

            {/* ── Home point marker (green) ─────────────────────────────────── */}
            {hasCoords(homeGps) && (
              <CircleMarker
                center={[homeGps.lat, homeGps.lng]}
                radius={8}
                pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>Home Point</Popup>
              </CircleMarker>
            )}

            {/* ── Navigation target marker (red) ───────────────────────────── */}
            {hasCoords(targetGps) && (
              <CircleMarker
                center={[targetGps.lat, targetGps.lng]}
                radius={8}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>Navigation Target</Popup>
              </CircleMarker>
            )}
            {/* ── Past detection markers (yellow) ─────────────────────────────────────── */}
            {detections.map((d) => {
              const gps = d.estimated_gps
              if (!hasCoords(gps)) return null
              const ts = d.timestamp
                ? new Date(d.timestamp).toLocaleString()
                : 'Unknown time'
              return (
                <CircleMarker
                  key={d.detection_id}
                  center={[gps.lat, gps.lng]}
                  radius={6}
                  pathOptions={{ color: '#eab308', fillColor: '#eab308', fillOpacity: 0.6, weight: 2 }}
                >
                  <Popup>
                    <strong>Oil Detection</strong><br />
                    Confidence: {(d.confidence * 100).toFixed(0)}%<br />
                    Detected at: {ts}
                  </Popup>
                </CircleMarker>
              )
            })}          </MapContainer>
        </div>

        {/* Map legend */}
        <div className="mt-3 flex gap-4">
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-blue-500" />Device
          </span>
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-green-500" />Home
          </span>
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-red-500" />Target
          </span>
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-yellow-500" />Detection
          </span>
        </div>
      </div>

      {/* ── Right column — navigation controls ──────────────────────────────── */}
      <div className="flex w-full flex-col gap-4 lg:w-80">

        {/* ── Card 1 — Current Position ───────────────────────────────────── */}
        <div className={CARD}>
          <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Current Position</p>

          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Latitude</span>
            <span className={VALUE}>{deviceStatus?.device_gps?.lat ?? '--'}</span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Longitude</span>
            <span className={VALUE}>{deviceStatus?.device_gps?.lng ?? '--'}</span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Heading</span>
            <span className={VALUE}>
              {deviceStatus?.heading != null ? `${deviceStatus.heading}°` : '--'}
            </span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Dist to Target</span>
            <span className={VALUE}>
              {deviceStatus?.distance_to_target != null
                ? `${deviceStatus.distance_to_target}m`
                : 'No target set'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-gray-400">Heading Error</span>
            <span className={VALUE}>
              {deviceStatus?.heading_error != null ? `${deviceStatus.heading_error}°` : '--'}
            </span>
          </div>

          {/* Set as Home button */}
          <button
            type="button"
            onClick={handleSetHome}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
          >
            <Home className="h-4 w-4" />
            {homeSaved
              ? <span className="text-green-400">✓ Home Saved!</span>
              : 'Set as Home Point'}
          </button>
        </div>

        {/* ── Card 2 — Navigate To Location ──────────────────────────────── */}
        <div className={CARD}>
          <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Navigate To</p>

          {/* Target Latitude */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-400">Target Latitude</label>
            <input
              type="number"
              step="0.0001"
              placeholder="e.g. 14.5995"
              value={targetLat}
              onChange={(e) => setTargetLat(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Target Longitude */}
          <div className="mb-1">
            <label className="mb-1 block text-xs text-gray-400">Target Longitude</label>
            <input
              type="number"
              step="0.0001"
              placeholder="e.g. 120.9842"
              value={targetLng}
              onChange={(e) => setTargetLng(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Validation / API error */}
          {navError && (
            <p className="mt-1 text-xs text-red-400">{navError}</p>
          )}

          {/* Send to Device button */}
          <button
            type="button"
            onClick={handleNavigate}
            disabled={navLoading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {navLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Navigation className="h-4 w-4" />}
            {navSuccess ? <span className="text-blue-200">✓ Target Set!</span> : 'Send to Device'}
          </button>

          {/* Navigate Home button */}
          <button
            type="button"
            onClick={navigateHome}
            disabled={navLoading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
          >
            {navLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Home className="h-4 w-4" />}
            Return to Home
          </button>
        </div>

        {/* ── Card 3 — Past Oil Detections ────────────────────────────────── */}
        <div className={CARD}>
          {/* Card header with refresh button */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Past Oil Detections</p>
            <RefreshCw
              className="h-3.5 w-3.5 cursor-pointer text-gray-400 transition-colors hover:text-white"
              onClick={loadDetections}
            />
          </div>

          {/* Loading skeletons */}
          {detectionsLoading && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 w-full animate-pulse rounded bg-gray-700" />
              ))}
            </div>
          )}

          {/* Error state */}
          {!detectionsLoading && detectionsError && (
            <p className="text-xs text-red-400">{detectionsError}</p>
          )}

          {/* Empty state */}
          {!detectionsLoading && !detectionsError && detections.length === 0 && (
            <div className="py-4">
              <ScanSearch className="mx-auto mb-2 h-8 w-8 text-gray-600" />
              <p className="text-center text-sm text-gray-400">No detections yet</p>
              <p className="text-center text-xs text-gray-500">
                Upload a drone image in the Detection page to get started
              </p>
            </div>
          )}

          {/* Detection list */}
          {!detectionsLoading && !detectionsError && detections.length > 0 && (
            <div>
              {detections.map((d) => {
                const ts = d.timestamp ? new Date(d.timestamp) : null
                const dateStr = ts
                  ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    + ' ' + ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                  : '--'
                return (
                  <div
                    key={d.detection_id}
                    className="flex items-start justify-between gap-2 border-b border-gray-700/50 py-2.5 last:border-0"
                  >
                    {/* Left: badge + coords + timestamp */}
                    <div>
                      <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-400">
                        {(d.confidence * 100).toFixed(0)}%
                      </span>
                      <p className="mt-1 text-xs text-gray-400">
                        Lat: {d.estimated_gps?.lat?.toFixed(4) ?? '--'}<br />
                        Lng: {d.estimated_gps?.lng?.toFixed(4) ?? '--'}
                      </p>
                      <p className="text-xs text-gray-500">{dateStr}</p>
                    </div>

                    {/* Right: navigate or visited */}
                    {d.was_navigated_to ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <Check className="h-3 w-3" />Visited
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigateToLocation(
                          d.estimated_gps.lat,
                          d.estimated_gps.lng,
                          'detection',
                          d.detection_id
                        )}
                        className="cursor-pointer text-xs text-blue-400 underline transition-colors hover:text-blue-300"
                      >
                        Navigate
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

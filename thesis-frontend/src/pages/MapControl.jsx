import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import {
  Home, Navigation, Loader2, RefreshCw,
  ScanSearch, Check, MapPin, Compass,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigation } from '../hooks/useNavigation'
import { setHome, getDetections } from '../api/endpoints'

// ── Tailwind helpers (shared with Dashboard) ────────────────────────────────────
const CARD = [
  'rounded-xl border p-5 shadow-sm',
  'bg-white border-gray-200',
  'dark:bg-gray-800/80 dark:border-gray-700/60',
].join(' ')

const FIELD_ROW = [
  'flex items-center justify-between py-2',
  'border-b border-gray-100 dark:border-gray-700/40',
  'last:border-0',
].join(' ')

const VALUE = 'font-mono text-sm font-medium text-gray-800 dark:text-gray-200'

const INPUT = [
  'w-full rounded-lg border px-3 py-2 text-sm',
  'border-gray-300 bg-gray-50 text-gray-900',
  'dark:border-gray-600/60 dark:bg-gray-700/60 dark:text-white',
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60',
  'transition-colors',
].join(' ')

const BTN_PRIMARY = [
  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5',
  'text-sm font-medium text-white transition-colors',
  'bg-blue-600 hover:bg-blue-700 disabled:opacity-50',
].join(' ')

const BTN_SECONDARY = [
  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5',
  'text-sm font-medium transition-colors',
  'border border-gray-200 bg-gray-50 text-gray-700',
  'hover:bg-gray-100',
  'dark:border-gray-700/60 dark:bg-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-700',
  'disabled:opacity-50',
].join(' ')

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

// ── User location marker (purple) ──────────────────────────────────────────────
function MapUserLocation() {
  const map = useMap()
  const [userGps, setUserGps] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords
        setUserGps({ lat: latitude, lng: longitude })
      },
      () => {}
    )
  }, [])

  return userGps && (
    <CircleMarker
      center={[userGps.lat, userGps.lng]}
      radius={8}
      pathOptions={{ color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.8, weight: 2 }}
    >
      <Popup>Your Location</Popup>
    </CircleMarker>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
export default function MapControl() {
  const { deviceStatus, isDeviceOnline } = useApp()

  const deviceGps = deviceStatus?.device_gps ?? null
  const homeGps   = deviceStatus?.home_gps   ?? null
  const targetGps = deviceStatus?.target_gps ?? null
  const heading   = deviceStatus?.heading    ?? null

  const hasCoords = (gps) =>
    gps != null &&
    gps.lat != null && gps.lng != null &&
    gps.lat !== 0.0 && gps.lng !== 0.0

  // ── Navigation state ────────────────────────────────────────────────────────
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
    } catch {
      // no-op — setHome failure is silent here; errors surface in AlertBanner
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
      setNavError('Latitude must be between -90 and 90.')
      return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setNavError('Longitude must be between -180 and 180.')
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

  // ── Past detections ─────────────────────────────────────────────────────────
  const [detections,        setDetections]        = useState([])
  const [detectionsLoading, setDetectionsLoading] = useState(true)
  const [detectionsError,   setDetectionsError]   = useState('')

  const loadDetections = async () => {
    setDetectionsLoading(true)
    setDetectionsError('')
    try {
      const result = await getDetections({ limit: 5 })
      setDetections(Array.isArray(result) ? result : (result?.detections ?? []))
    } catch (err) {
      setDetectionsError(err.message || 'Failed to load detections.')
    } finally {
      setDetectionsLoading(false)
    }
  }

  useEffect(() => { loadDetections() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v, suffix = '') =>
    v !== null && v !== undefined ? `${v}${suffix}` : '--'

  return (
    <div className="flex flex-col gap-4 p-6 lg:flex-row">

      {/* ── Map Card ─────────────────────────────────────────────────────────── */}
      <div className={`${CARD} flex-1`}>

        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Live Location
          </p>
        </div>

        {/* Leaflet map */}
        <div className="h-[calc(100vh-220px)] min-h-96 overflow-hidden rounded-lg ring-1 ring-gray-200 dark:ring-gray-700/40">
          <MapContainer
            center={[14.5995, 120.9842]}
            zoom={16}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution="© CartoDB contributors, © OpenStreetMap contributors"
              maxZoom={20}
            />

            <MapAutoCenter deviceGps={deviceGps} isOnline={isDeviceOnline} />
            <MapUserLocation />

            {/* Device — blue */}
            {hasCoords(deviceGps) && (
              <CircleMarker
                center={[deviceGps.lat, deviceGps.lng]}
                radius={10}
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.85, weight: 2 }}
              >
                <Popup>
                  <strong>Device</strong><br />
                  {deviceGps.lat.toFixed(6)}, {deviceGps.lng.toFixed(6)}<br />
                  Heading: {fmt(heading, '°')}
                </Popup>
              </CircleMarker>
            )}

            {/* Home — green */}
            {hasCoords(homeGps) && (
              <CircleMarker
                center={[homeGps.lat, homeGps.lng]}
                radius={8}
                pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.85, weight: 2 }}
              >
                <Popup>Home Point</Popup>
              </CircleMarker>
            )}

            {/* Target — red */}
            {hasCoords(targetGps) && (
              <CircleMarker
                center={[targetGps.lat, targetGps.lng]}
                radius={8}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.85, weight: 2 }}
              >
                <Popup>Navigation Target</Popup>
              </CircleMarker>
            )}

            {/* Past detections — yellow */}
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
                  pathOptions={{ color: '#eab308', fillColor: '#eab308', fillOpacity: 0.7, weight: 2 }}
                >
                  <Popup>
                    <strong>Oil Detection</strong><br />
                    Confidence: {(d.confidence * 100).toFixed(0)}%<br />
                    {ts}
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4">
          {[
            { color: 'bg-blue-500',   label: 'Device' },
            { color: 'bg-purple-500', label: 'You' },
            { color: 'bg-green-500',  label: 'Home' },
            { color: 'bg-red-500',    label: 'Target' },
            { color: 'bg-yellow-500', label: 'Detection' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Right column ─────────────────────────────────────────────────────── */}
      <div className="flex w-full flex-col gap-4 lg:w-80">

        {/* Card 1 — Current Position (read-only telemetry) */}
        <div className={CARD}>
          <div className="mb-3 flex items-center gap-2">
            <Compass className="h-4 w-4 text-cyan-400" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Current Position
            </p>
          </div>

          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Latitude</span>
            <span className={VALUE}>{fmt(deviceGps?.lat)}</span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Longitude</span>
            <span className={VALUE}>{fmt(deviceGps?.lng)}</span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Heading</span>
            <span className={VALUE}>{fmt(heading, '°')}</span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Heading Error</span>
            <span className={VALUE}>
              {deviceStatus?.heading_error != null
                ? `${deviceStatus.heading_error}°`
                : '--'}
            </span>
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Distance to Target</span>
            <span className={VALUE}>
              {deviceStatus?.distance_to_target != null
                ? `${deviceStatus.distance_to_target} m`
                : '--'}
            </span>
          </div>
        </div>

        {/* Card 2 — Navigate To + home actions */}
        <div className={CARD}>
          <div className="mb-3 flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-400" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Navigate To
            </p>
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Target Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              placeholder="e.g. 14.5995"
              value={targetLat}
              onChange={(e) => setTargetLat(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="mb-1">
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Target Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              placeholder="e.g. 120.9842"
              value={targetLng}
              onChange={(e) => setTargetLng(e.target.value)}
              className={INPUT}
            />
          </div>

          {navError && (
            <p className="mt-1.5 text-xs text-red-400">{navError}</p>
          )}

          <button
            type="button"
            onClick={handleNavigate}
            disabled={navLoading}
            className={`mt-3 ${BTN_PRIMARY}`}
          >
            {navLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Navigation className="h-4 w-4" />}
            {navSuccess ? 'Target Set!' : 'Send to Device'}
          </button>

          {/* Divider */}
          <div className="my-3 border-t border-gray-100 dark:border-gray-700/40" />

          <button
            type="button"
            onClick={handleSetHome}
            className={BTN_SECONDARY}
          >
            <Home className="h-4 w-4 flex-shrink-0" />
            {homeSaved
              ? <span className="flex items-center gap-1 text-green-400">
                  <Check className="h-3.5 w-3.5" /> Home Saved!
                </span>
              : 'Set as Home Point'}
          </button>

          <button
            type="button"
            onClick={navigateHome}
            disabled={navLoading}
            className={`mt-2 ${BTN_SECONDARY}`}
          >
            {navLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Home className="h-4 w-4" />}
            Return to Home
          </button>
        </div>

        {/* Card 3 — Past Oil Detections */}
        <div className={CARD}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Past Detections
            </p>
            <button
              type="button"
              onClick={loadDetections}
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700/60 dark:hover:text-gray-300"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {detectionsLoading && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700/50" />
              ))}
            </div>
          )}

          {!detectionsLoading && detectionsError && (
            <p className="text-xs text-red-400">{detectionsError}</p>
          )}

          {!detectionsLoading && !detectionsError && detections.length === 0 && (
            <div className="py-6 text-center">
              <ScanSearch className="mx-auto mb-2 h-8 w-8 text-gray-500 dark:text-gray-600" />
              <p className="text-sm text-gray-400">No detections yet</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Upload an image on the Detection page
              </p>
            </div>
          )}

          {!detectionsLoading && !detectionsError && detections.length > 0 && (
            <div>
              {detections.map((d) => {
                const ts = d.timestamp ? new Date(d.timestamp) : null
                const dateStr = ts
                  ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    + ' ' + ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                  : '--'
                return (
                  <div
                    key={d.detection_id}
                    className="flex items-start justify-between gap-2 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-700/40"
                  >
                    <div>
                      <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-400 ring-1 ring-yellow-500/20">
                        {(d.confidence * 100).toFixed(0)}%
                      </span>
                      <p className="mt-1.5 font-mono text-xs text-gray-400">
                        {d.estimated_gps?.lat?.toFixed(4) ?? '--'}, {d.estimated_gps?.lng?.toFixed(4) ?? '--'}
                      </p>
                      <p className="text-xs text-gray-500">{dateStr}</p>
                    </div>

                    {d.was_navigated_to ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <Check className="h-3.5 w-3.5" /> Visited
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
                        className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
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

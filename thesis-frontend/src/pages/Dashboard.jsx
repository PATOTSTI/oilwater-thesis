import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import {
  Radio, Battery, Droplets, Waves,
  Home, Navigation, Gamepad2, AlertOctagon,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCommand } from '../hooks/useCommand'
import { useNavigation } from '../hooks/useNavigation'
import { setHome } from '../api/endpoints'

// ── Tailwind helpers ────────────────────────────────────────────────────────────
const CARD = [
  'rounded-xl border p-5 shadow-lg',
  'bg-white border-gray-200',
  'dark:bg-gray-800 dark:border-gray-700',
].join(' ')

const FIELD_ROW = 'flex items-center justify-between border-b border-gray-700/30 py-1.5'

const MODE_COLORS = {
  manual:    'bg-blue-500/20 text-blue-400',
  automatic: 'bg-purple-500/20 text-purple-400',
  cleaning:  'bg-cyan-500/20 text-cyan-400',
  returning: 'bg-yellow-500/20 text-yellow-400',
  standby:   'bg-gray-500/20 text-gray-400',
}

const batteryColor = (lvl) =>
  lvl > 50 ? 'text-green-400' : lvl >= 20 ? 'text-yellow-400' : 'text-red-400 animate-pulse'

const batteryBarColor = (lvl) =>
  lvl > 50 ? 'bg-green-500' : lvl >= 20 ? 'bg-yellow-500' : 'bg-red-500'

// ── Leaflet map controller — centers once when device first comes online ────────
function MapController({ lat, lng, online }) {
  const map = useMap()
  const centeredRef = useRef(false)
  useEffect(() => {
    if (online && lat && lng && !centeredRef.current) {
      map.setView([lat, lng], 15)
      centeredRef.current = true
    }
    if (!online) centeredRef.current = false
  }, [online, lat, lng, map])
  return null
}

// ── Skeleton value while loading ────────────────────────────────────────────────
function Skel() {
  return <span className="inline-block h-5 w-16 animate-pulse rounded bg-gray-700" />
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { isDeviceOnline, currentMode, oilDetected,
          batteryLevel, batteryVoltage, solarCharging, deviceStatus } = useApp()
  const status = deviceStatus
  const isLoading = deviceStatus === null
  console.log('STATUS:', status)
  console.log('GPS:', status?.device_gps)
  console.log('LAT:', status?.device_gps?.lat)
  console.log('HEADING:', status?.heading)
  console.log('ESP32 MODE:', status?.esp32_mode)
  const { sendCommand, emergencyStop } = useCommand()
  const { navigateHome, error: navError, isSuccess: navSuccess } = useNavigation()

  const [homeSuccess, setHomeSuccess] = useState(false)
  const [homeError,   setHomeError]   = useState('')

  const handleSetHome = async () => {
    setHomeError('')
    try {
      await setHome()
      setHomeSuccess(true)
      setTimeout(() => setHomeSuccess(false), 2000)
    } catch (err) {
      setHomeError(err.message || 'Failed to save home point')
      setTimeout(() => setHomeError(''), 4000)
    }
  }

  // ── Derived values from status payload ─────────────────────────────────────
  // status is null until deviceStatus arrives; optional chaining handles null safely.
  const lat         = status?.device_gps?.lat ?? null
  const lng         = status?.device_gps?.lng ?? null
  const heading     = status?.heading         ?? null
  const tiltX       = status?.tilt_x          ?? null
  const tiltY       = status?.tilt_y          ?? null
  const distTarget  = status?.distance_to_target ?? null
  const timeSince   = status?.time_since_last_update ?? null
  // pump_status is a boolean from the backend (true = running, false = idle)
  const pumpRunning = status?.pump_status === true

  // esp32_mode = what the device confirmed executing (updated by POST /status).
  // current_mode = what the backend commanded (only changes via POST /mode).
  // Show esp32_mode so the badge reflects the device's actual reported state.
  const displayMode = status?.esp32_mode ?? currentMode ?? 'standby'
  const modeLabel = displayMode.charAt(0).toUpperCase() + displayMode.slice(1)

  const fmt = (v, suffix = '') => (v !== null && v !== undefined) ? `${v}${suffix}` : '--'

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ══ ROW 1 — STAT CARDS ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {/* Card 1 – Device Status */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-sm text-gray-400">Device Status</span>
            <Radio className="h-5 w-5 text-gray-400" />
          </div>
          <p className={`text-xl font-bold ${isDeviceOnline ? 'text-green-400' : 'text-gray-400'}`}>
            {isDeviceOnline ? 'Online' : 'Offline'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Last update: {timeSince !== null ? `${timeSince}s ago` : '--'}
          </p>
          <div className={`mt-3 h-1 w-full rounded-full ${isDeviceOnline ? 'bg-green-500' : 'bg-gray-600'}`} />
        </div>

        {/* Card 2 – Battery Level */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-sm text-gray-400">Battery Level</span>
            <Battery className="h-5 w-5 text-gray-400" />
          </div>
          {isLoading
            ? <Skel />
            : <p className={`text-xl font-bold ${batteryColor(batteryLevel)}`}>{batteryLevel}%</p>}
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span>{fmt(batteryVoltage, 'V')}</span>
            {solarCharging && <span className="text-yellow-400">⚡ Solar Charging</span>}
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-gray-700">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${batteryBarColor(batteryLevel)}`}
              style={{ width: `${batteryLevel}%` }}
            />
          </div>
        </div>

        {/* Card 3 – Oil Detection */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-sm text-gray-400">Oil Sensor</span>
            <Droplets className="h-5 w-5 text-gray-400" />
          </div>
          <p className={`text-xl font-bold ${oilDetected ? 'text-red-400' : 'text-green-400'}`}>
            {oilDetected ? 'DETECTED' : 'CLEAR'}
          </p>
          <p className="mt-1 text-xs text-gray-400">Capacitive Proximity Sensor</p>
          <div className={`mt-3 h-1 w-full rounded-full ${oilDetected ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
        </div>

        {/* Card 4 – Pump Status */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-sm text-gray-400">Pump Status</span>
            <Waves className="h-5 w-5 text-gray-400" />
          </div>
          {isLoading
            ? <Skel />
            : <p className={`text-xl font-bold ${pumpRunning ? 'text-blue-400' : 'text-gray-400'}`}>
                {pumpRunning ? 'RUNNING' : 'IDLE'}
              </p>}
          <button
            type="button"
            onClick={() => sendCommand(pumpRunning ? 'pump_off' : 'pump_on')}
            className="mt-3 rounded-lg bg-gray-700 px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
          >
            {pumpRunning ? 'Turn Off' : 'Turn On'}
          </button>
        </div>
      </div>

      {/* ══ ROW 2 — GPS / IMU + QUICK ACTIONS ════════════════════════════════ */}
      <div className="flex flex-col gap-4 md:flex-row">

        {/* Card — GPS & Orientation */}
        <div className={`${CARD} flex-1`}>
          <p className="mb-3 text-sm font-semibold text-white dark:text-white text-gray-900">GPS & Orientation</p>

          {/* GPS */}
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Latitude</span>
            {isLoading ? <Skel /> : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">{fmt(lat)}</span>}
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Longitude</span>
            {isLoading ? <Skel /> : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">{fmt(lng)}</span>}
          </div>

          {/* IMU */}
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Heading</span>
            {isLoading ? <Skel /> : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">{fmt(heading, '°')}</span>}
          </div>
          <div className={FIELD_ROW}>
            <span className="text-xs text-gray-400">Tilt X</span>
            {isLoading ? <Skel /> : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">{fmt(tiltX, '°')}</span>}
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-gray-400">Tilt Y</span>
            {isLoading ? <Skel /> : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">{fmt(tiltY, '°')}</span>}
          </div>

          {/* Distance to target */}
          <div className={`mt-3 rounded-lg px-3 py-2 ${distTarget !== null ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-700/30 text-gray-500'}`}>
            <span className="text-xs">Distance to Target: </span>
            <span className="text-sm font-semibold">
              {distTarget !== null ? `${distTarget}m` : 'No target set'}
            </span>
          </div>
        </div>

        {/* Card — Quick Actions */}
        <div className={`${CARD} flex-1`}>
          <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Quick Actions</p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSetHome}
              className="flex w-full items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
            >
              <Home className="h-4 w-4" />
              {homeSuccess
                ? <span className="text-green-400">✓ Home Point Saved!</span>
                : 'Set Current Location as Home'}
            </button>
            {homeError && (
              <p className="-mt-1 text-xs text-red-400">⚠️ {homeError}</p>
            )}

            <button
              type="button"
              onClick={navigateHome}
              className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
            >
              <Navigation className="h-4 w-4" />
              {navSuccess ? <span className="text-blue-200">✓ Navigating Home…</span> : 'Return to Home'}
            </button>
            {navError && (
              <p className="-mt-1 text-xs text-red-400">⚠️ {navError.message}</p>
            )}

            <button
              type="button"
              onClick={() => navigate('/control')}
              className="flex w-full items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
            >
              <Gamepad2 className="h-4 w-4" />
              Go to Manual Control
            </button>

            <button
              type="button"
              onClick={emergencyStop}
              className="flex w-full items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
            >
              <AlertOctagon className="h-4 w-4" />
              Emergency Stop
            </button>
          </div>

          {/* Current Mode */}
          <div className="mt-3 flex items-center justify-between border-t border-gray-700 pt-3">
            <span className="text-xs text-gray-400">Current Mode</span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${MODE_COLORS[displayMode] ?? MODE_COLORS.standby}`}>
              {modeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ══ ROW 3 — MAP PREVIEW ══════════════════════════════════════════════ */}
      <div className={CARD}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Live Device Location</p>
          <button
            type="button"
            onClick={() => navigate('/map')}
            className="text-xs text-blue-400 transition-colors hover:text-blue-300"
          >
            Open Full Map →
          </button>
        </div>

        <div className="h-64 overflow-hidden rounded-lg">
          <MapContainer
            center={[14.5995, 120.9842]}
            zoom={15}
            className="h-full w-full"
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            <MapController lat={lat} lng={lng} online={isDeviceOnline} />
            {lat !== null && lng !== null && lat !== 0 && lng !== 0 && (
              <CircleMarker
                center={[lat, lng]}
                radius={8}
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8 }}
              />
            )}
          </MapContainer>
        </div>
      </div>

    </div>
  )
}
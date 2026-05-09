import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import {
  Battery, Droplets, Waves, MapPin, Compass,
  Home, Navigation, Gamepad2, AlertOctagon,
  Signal, ChevronRight, Zap,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCommand } from '../hooks/useCommand'
import { useNavigation } from '../hooks/useNavigation'
import { setHome } from '../api/endpoints'

// ── Tailwind helpers ────────────────────────────────────────────────────────────
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

const MODE_COLORS = {
  manual:    { badge: 'border-blue-500/30 bg-blue-500/10 text-blue-400',   dot: 'bg-blue-400' },
  automatic: { badge: 'border-purple-500/30 bg-purple-500/10 text-purple-400', dot: 'bg-purple-400' },
  cleaning:  { badge: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',   dot: 'bg-cyan-400' },
  returning: { badge: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400', dot: 'bg-yellow-400' },
  standby:   { badge: 'border-gray-600/30 bg-gray-700/30 text-gray-400',   dot: 'bg-gray-500' },
}

const batteryTextColor = (lvl) =>
  lvl > 50 ? 'text-green-400' : lvl >= 20 ? 'text-yellow-400' : 'text-red-400 animate-pulse'

const batteryBarColor = (lvl) =>
  lvl > 50 ? 'bg-green-500' : lvl >= 20 ? 'bg-yellow-500' : 'bg-red-500'

// ── Leaflet: centers map once when device first comes online ────────────────────
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

function Skel() {
  return <span className="inline-block h-5 w-16 animate-pulse rounded bg-gray-700/40" />
}

// ── Action button variants ──────────────────────────────────────────────────────
const BTN_SECONDARY = [
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5',
  'text-sm font-medium transition-colors',
  'border border-gray-200 bg-gray-50 text-gray-700',
  'hover:bg-gray-100',
  'dark:border-gray-700/60 dark:bg-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-700',
].join(' ')

const BTN_PRIMARY = [
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5',
  'text-sm font-medium text-white transition-colors',
  'bg-blue-600 hover:bg-blue-700',
].join(' ')

// ───────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const {
    isDeviceOnline, currentMode, oilDetected,
    batteryLevel, batteryVoltage, solarCharging, deviceStatus,
  } = useApp()

  const status = deviceStatus
  const isLoading = deviceStatus === null
  const { sendCommand, emergencyStop } = useCommand()
  const { navigateHome, error: navError, isSuccess: navSuccess } = useNavigation()

  const [homeSuccess, setHomeSuccess] = useState(false)
  const [homeError, setHomeError] = useState('')

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

  // ── Derived values ──────────────────────────────────────────────────────────
  const lat        = status?.device_gps?.lat         ?? null
  const lng        = status?.device_gps?.lng         ?? null
  const heading    = status?.heading                 ?? null
  const distTarget = status?.distance_to_target      ?? null
  const timeSince  = status?.time_since_last_update  ?? null
  const pumpRunning = status?.pump_status === true

  const displayMode = status?.esp32_mode ?? currentMode ?? 'standby'
  const modeLabel   = displayMode.charAt(0).toUpperCase() + displayMode.slice(1)
  const modeStyle   = MODE_COLORS[displayMode] ?? MODE_COLORS.standby

  const fmt = (v, suffix = '') =>
    v !== null && v !== undefined ? `${v}${suffix}` : '--'

  const hasGpsFix = lat !== null && lng !== null

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* ══ HERO BANNER — System identity + live state ══════════════════════ */}
      <div className={[
        'relative overflow-hidden rounded-2xl border p-5 shadow-md',
        'border-blue-900/30 dark:border-blue-800/20',
        'bg-gradient-to-r from-slate-900 via-blue-950/80 to-slate-900',
      ].join(' ')}>
        {/* Decorative glow blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute -bottom-8 left-1/3 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl" />
        </div>

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
              <Waves className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">AquaDetect</h1>
              <p className="text-xs text-blue-300/60">Autonomous Oil-Water Cleaning System</p>
            </div>
          </div>

          {/* Live state pills */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className={[
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
              isDeviceOnline
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-gray-600/30 bg-gray-800/60 text-gray-400',
            ].join(' ')}>
              <span className={[
                'h-1.5 w-1.5 rounded-full',
                isDeviceOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500',
              ].join(' ')} />
              {isDeviceOnline ? 'Online' : 'Offline'}
            </div>

            <div className={[
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
              modeStyle.badge,
            ].join(' ')}>
              <span className={`h-1.5 w-1.5 rounded-full ${modeStyle.dot}`} />
              {modeLabel} Mode
            </div>

            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Signal className="h-3 w-3" />
              {timeSince !== null ? `Last ping ${timeSince}s ago` : 'No signal'}
            </div>
          </div>
        </div>
      </div>

      {/* ══ ROW 1 — STAT CARDS ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">

        {/* Battery */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Battery
            </span>
            <Battery className={`h-4 w-4 ${batteryTextColor(batteryLevel)}`} />
          </div>
          {isLoading
            ? <Skel />
            : <p className={`text-2xl font-bold ${batteryTextColor(batteryLevel)}`}>
                {batteryLevel}%
              </p>}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <span>{fmt(batteryVoltage, ' V')}</span>
            {solarCharging && (
              <span className="flex items-center gap-0.5 text-yellow-400">
                <Zap className="h-3 w-3" /> Charging
              </span>
            )}
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${batteryBarColor(batteryLevel)}`}
              style={{ width: `${batteryLevel ?? 0}%` }}
            />
          </div>
        </div>

        {/* Oil Sensor */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Oil Sensor
            </span>
            <Droplets className={`h-4 w-4 ${oilDetected ? 'text-red-400' : 'text-green-400'}`} />
          </div>
          <p className={`text-2xl font-bold ${oilDetected ? 'text-red-400' : 'text-green-400'}`}>
            {oilDetected ? 'Detected' : 'Clear'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Capacitive proximity</p>
          <div className={[
            'mt-3 h-1.5 w-full rounded-full',
            oilDetected ? 'bg-red-500 animate-pulse' : 'bg-green-500',
          ].join(' ')} />
        </div>

        {/* Pump */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Pump
            </span>
            <Waves className={`h-4 w-4 ${pumpRunning ? 'text-blue-400' : 'text-gray-400'}`} />
          </div>
          {isLoading
            ? <Skel />
            : <p className={`text-2xl font-bold ${pumpRunning ? 'text-blue-400' : 'text-gray-400'}`}>
                {pumpRunning ? 'Running' : 'Idle'}
              </p>}
          <p className="mt-1 text-xs text-gray-500">Collection pump</p>
          <div className={[
            'mt-3 h-1.5 w-full rounded-full',
            pumpRunning ? 'bg-blue-500 animate-pulse' : 'bg-gray-600',
          ].join(' ')} />
        </div>

        {/* GPS Fix */}
        <div className={CARD}>
          <div className="mb-3 flex items-start justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              GPS
            </span>
            <MapPin className={`h-4 w-4 ${hasGpsFix ? 'text-cyan-400' : 'text-gray-400'}`} />
          </div>
          <p className={`text-2xl font-bold ${hasGpsFix ? 'text-cyan-400' : 'text-gray-400'}`}>
            {hasGpsFix ? 'Fix' : 'No Fix'}
          </p>
          <div className="mt-1 space-y-0.5">
            <p className="font-mono text-xs text-gray-500">{fmt(lat)}</p>
            <p className="font-mono text-xs text-gray-500">{fmt(lng)}</p>
          </div>
          <div className={[
            'mt-3 h-1.5 w-full rounded-full',
            hasGpsFix ? 'bg-cyan-500' : 'bg-gray-600',
          ].join(' ')} />
        </div>
      </div>

      {/* ══ ROW 2 — MAP + RIGHT PANEL ═════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Live Map — takes 2/3 of the row */}
        <div className={`${CARD} lg:col-span-2`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-400" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Live Location
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/map')}
              className="flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
            >
              Full Map <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-80 overflow-hidden rounded-lg ring-1 ring-gray-200 dark:ring-gray-700/40">
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
                  radius={9}
                  pathOptions={{
                    color: '#0ea5e9',
                    fillColor: '#0ea5e9',
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                />
              )}
            </MapContainer>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">

          {/* Quick Actions */}
          <div className={CARD}>
            <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Quick Actions
            </p>

            <div className="flex flex-col gap-2">
              {/* Pump toggle */}
              <button
                type="button"
                onClick={() => sendCommand(pumpRunning ? 'pump_off' : 'pump_on')}
                className={BTN_SECONDARY}
              >
                <Waves className="h-4 w-4 flex-shrink-0" />
                {pumpRunning ? 'Turn Off Pump' : 'Turn On Pump'}
              </button>

              <button
                type="button"
                onClick={handleSetHome}
                className={BTN_SECONDARY}
              >
                <Home className="h-4 w-4 flex-shrink-0" />
                {homeSuccess
                  ? <span className="text-green-400">Home point saved!</span>
                  : 'Set as Home Point'}
              </button>
              {homeError && (
                <p className="-mt-1 text-xs text-red-400">{homeError}</p>
              )}

              <button
                type="button"
                onClick={navigateHome}
                className={BTN_PRIMARY}
              >
                <Navigation className="h-4 w-4 flex-shrink-0" />
                {navSuccess ? 'Navigating Home...' : 'Return to Home'}
              </button>
              {navError && (
                <p className="-mt-1 text-xs text-red-400">{navError.message}</p>
              )}

              <button
                type="button"
                onClick={() => navigate('/control')}
                className={BTN_SECONDARY}
              >
                <Gamepad2 className="h-4 w-4 flex-shrink-0" />
                Manual Control
              </button>
            </div>

            {/* Emergency Stop — visually separated danger zone */}
            <div className="mt-3 border-t border-red-900/20 pt-3">
              <button
                type="button"
                onClick={emergencyStop}
                className={[
                  'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5',
                  'text-sm font-bold text-white',
                  'bg-red-600 hover:bg-red-700 active:bg-red-800',
                  'shadow-md shadow-red-900/30 transition-colors',
                  'ring-1 ring-red-500/20',
                ].join(' ')}
              >
                <AlertOctagon className="h-4 w-4 flex-shrink-0" />
                Emergency Stop
              </button>
            </div>
          </div>

          {/* Navigation telemetry */}
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2">
              <Compass className="h-4 w-4 text-cyan-400" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Navigation
              </p>
            </div>

            <div className={FIELD_ROW}>
              <span className="text-xs text-gray-400">Heading</span>
              {isLoading
                ? <Skel />
                : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">
                    {fmt(heading, '°')}
                  </span>}
            </div>
            <div className={FIELD_ROW}>
              <span className="text-xs text-gray-400">Latitude</span>
              {isLoading
                ? <Skel />
                : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">
                    {fmt(lat)}
                  </span>}
            </div>
            <div className={FIELD_ROW}>
              <span className="text-xs text-gray-400">Longitude</span>
              {isLoading
                ? <Skel />
                : <span className="font-mono text-sm font-medium text-gray-200 dark:text-gray-200">
                    {fmt(lng)}
                  </span>}
            </div>

            <div className={[
              'mt-3 rounded-lg border px-3 py-2.5',
              distTarget !== null
                ? 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700/40 dark:bg-gray-700/20',
            ].join(' ')}>
              <p className="text-xs text-gray-400">Distance to Target</p>
              <p className="mt-0.5 text-sm font-semibold">
                {distTarget !== null ? `${distTarget} m` : 'No target set'}
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

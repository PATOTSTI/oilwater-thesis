import { useApp } from '../context/AppContext'
import {
  Droplets,
  Navigation,
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight
} from 'lucide-react'

// Convert heading degrees to cardinal direction label
const getCardinalDirection = (degrees) => {
  const dirs = [
    'North', 'Northeast', 'East', 'Southeast',
    'South', 'Southwest', 'West', 'Northwest'
  ]
  return dirs[Math.round(degrees / 45) % 8]
}

export default function Sensors() {
  const { deviceStatus, isDeviceOnline } = useApp()

  // Extract sensor values with safe fallbacks
  const oilDetected  = deviceStatus?.oil_detected             ?? false
  const heading      = deviceStatus?.heading                  ?? 0
  const tiltX        = deviceStatus?.tilt_x                   ?? 0
  const tiltY        = deviceStatus?.tilt_y                   ?? 0
  const gyroZ        = deviceStatus?.gyro_z                   ?? 0
  const rudder       = deviceStatus?.esp32_rudder_angle       ?? 0
  const gps          = deviceStatus?.device_gps               ?? null
  const currentCmd   = deviceStatus?.current_command          ?? null

  const cardClass =
    'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5'

  // Command text color
  const commandColor = (() => {
    if (!currentCmd) return 'text-gray-400'
    if (['forward', 'forward_left', 'forward_right'].includes(currentCmd))
      return 'text-green-400'
    if (currentCmd === 'backward') return 'text-yellow-400'
    if (['stop', 'emergency_stop'].includes(currentCmd)) return 'text-red-400'
    if (currentCmd === 'return_home') return 'text-blue-400'
    return 'text-gray-400'
  })()

  // Rudder direction text + color
  const rudderInfo = (() => {
    if (rudder < -10)
      return { text: `Turning Left ${Math.abs(rudder)}°`, color: 'text-yellow-400' }
    if (rudder > 10)
      return { text: `Turning Right ${rudder}°`, color: 'text-orange-400' }
    return { text: 'Straight', color: 'text-blue-400' }
  })()

  // Gyro status label + color
  const gyroStatus = (() => {
    const abs = Math.abs(gyroZ)
    if (abs < 0.5) return { text: 'Stable',        color: 'text-green-400',              pulse: false }
    if (abs < 2)   return { text: 'Rotating',       color: 'text-yellow-400',             pulse: false }
    return               { text: 'High Rotation!',  color: 'text-red-400 animate-pulse',  pulse: true  }
  })()

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

      {/* ── Card 1 — Oil Sensor ─────────────────────────────────────────────── */}
      <div className={cardClass}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Oil Sensor
        </p>

        <div className="py-6 flex flex-col items-center">
          {oilDetected ? (
            <>
              <Droplets className="w-14 h-14 text-red-400 mb-3 animate-pulse" />
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-2">
                <p className="text-2xl font-bold text-red-400">OIL DETECTED</p>
              </div>
              <p className="text-xs text-red-300 mt-2">Capacitive sensor triggered</p>
            </>
          ) : (
            <>
              <Droplets className="w-14 h-14 text-green-400 mb-3" />
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-6 py-2">
                <p className="text-2xl font-bold text-green-400">CLEAR</p>
              </div>
              <p className="text-xs text-green-300 mt-2">No oil detected</p>
            </>
          )}
        </div>

        <div className="border-t border-gray-700/50 pt-3 mt-3">
          <p className="text-xs text-gray-500">Sensor: LJC18A3-H-Z/BX</p>
          <p className="text-xs text-gray-500 mt-0.5">Type: Capacitive Proximity</p>
        </div>
      </div>

      {/* ── Card 2 — Compass / Heading ──────────────────────────────────────── */}
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-gray-400" />
            Compass / Heading
          </span>
          <span className="text-sm font-mono font-bold text-blue-400">
            {heading != null ? heading + '°' : '--'}
          </span>
        </div>

        {/* Visual compass */}
        <div className="flex justify-center my-3">
          <div className="w-32 h-32 rounded-full border-2 border-gray-600 relative flex items-center justify-center bg-gray-700/30">
            {/* Cardinal directions */}
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-xs font-bold text-red-400">
              N
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-gray-400">
              S
            </span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              E
            </span>
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              W
            </span>

            {/* Rotating needle */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `rotate(${heading}deg)`,
                transition: 'transform 0.5s ease'
              }}
            >
              <div className="w-1 h-12 bg-gradient-to-t from-gray-500 to-red-500 rounded-full" />
            </div>
          </div>
        </div>

        <p className="text-sm font-medium text-blue-400 text-center">
          {getCardinalDirection(heading)}
        </p>
      </div>

      {/* ── Card 3 — Tilt / Accelerometer ───────────────────────────────────── */}
      <div className={cardClass}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Tilt / Accelerometer
        </p>

        {/* Bubble level visual */}
        <div className="w-32 h-32 rounded-full border-2 border-gray-600 relative mx-auto my-3 bg-gray-700/30 overflow-hidden">
          {/* Crosshair */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-600" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />

          {/* Bubble */}
          <div
            className="w-8 h-8 rounded-full bg-blue-500/60 border-2 border-blue-400 absolute transition-all duration-300"
            style={{
              left: `calc(50% - 16px + ${Math.max(-40, Math.min(40, tiltX * (40 / 45)))}px)`,
              top: `calc(50% - 16px + ${Math.max(-40, Math.min(40, tiltY * (40 / 45)))}px)`
            }}
          />
        </div>

        {/* Tilt values */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <p className="text-xs text-gray-400">Tilt X</p>
            <p className="text-sm font-mono text-white dark:text-white text-gray-900">
              {tiltX != null ? tiltX.toFixed(2) + '°' : '--'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Tilt Y</p>
            <p className="text-sm font-mono text-white dark:text-white text-gray-900">
              {tiltY != null ? tiltY.toFixed(2) + '°' : '--'}
            </p>
          </div>
        </div>

        {/* High tilt warning */}
        {(Math.abs(tiltX) > 15 || Math.abs(tiltY) > 15) && (
          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="text-xs text-yellow-400">High tilt detected!</span>
          </div>
        )}
      </div>

      {/* ── Card 4 — Gyroscope ──────────────────────────────────────────────── */}
      <div className={cardClass}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-gray-400" />
          Gyroscope (Z-axis)
        </p>

        {/* Large value */}
        <p className="text-4xl font-bold text-purple-400 text-center my-4">
          {gyroZ != null ? gyroZ.toFixed(2) + ' °/s' : '--'}
        </p>

        {/* Visual rotation indicator */}
        <div className="w-24 h-24 rounded-full border-2 border-gray-600 relative mx-auto flex items-center justify-center">
          <div
            className="w-16 h-16 rounded-full border-t-2 border-purple-500"
            style={{
              transform: `rotate(${gyroZ * 10}deg)`,
              transition: 'transform 0.3s ease'
            }}
          />
          <div className="w-3 h-3 rounded-full bg-purple-500 absolute" />
        </div>

        {/* Stability status */}
        <p className={`text-xs text-center mt-3 ${gyroStatus.color}`}>
          {gyroStatus.text}
        </p>
      </div>

      {/* ── Card 5 — Rudder Angle ───────────────────────────────────────────── */}
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Rudder Angle
          </span>
          <span
            className={`text-sm font-mono font-bold ${
              rudder === 0
                ? 'text-blue-400'
                : rudder < 0
                  ? 'text-yellow-400'
                  : 'text-orange-400'
            }`}
          >
            {rudder != null ? rudder + '°' : '--'}
          </span>
        </div>

        {/* Boat top-down visual */}
        <div className="w-32 h-32 relative mx-auto my-3 flex items-center justify-center">
          {/* Boat body */}
          <div className="w-6 h-20 bg-gray-600 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

          {/* Rudder */}
          <div
            className="w-1 h-10 bg-blue-500 rounded-full absolute bottom-2 left-1/2 origin-top transition-transform duration-300"
            style={{ transform: `translateX(-50%) rotate(${rudder}deg)` }}
          />

          {/* Direction arrows */}
          {rudder < -10 && (
            <ArrowLeft className="w-5 h-5 text-yellow-400 absolute left-2 top-1/2 -translate-y-1/2" />
          )}
          {rudder > 10 && (
            <ArrowRight className="w-5 h-5 text-orange-400 absolute right-2 top-1/2 -translate-y-1/2" />
          )}
          {rudder >= -10 && rudder <= 10 && (
            <span className="text-xs text-blue-400 absolute bottom-0 left-1/2 -translate-x-1/2">
              ↑ Straight
            </span>
          )}
        </div>

        <p className={`text-sm font-medium text-center mt-2 ${rudderInfo.color}`}>
          {rudderInfo.text}
        </p>
      </div>

      {/* ── Card 6 — GPS & Movement ─────────────────────────────────────────── */}
      <div className={cardClass}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          GPS & Movement
        </p>

        {/* GPS coordinates */}
        <div className="divide-y divide-gray-700/50">
          <div className="flex justify-between py-1.5">
            <span className="text-xs text-gray-400">Latitude</span>
            <span className="text-sm font-mono text-gray-200 dark:text-gray-200 text-gray-800">
              {gps?.lat != null ? gps.lat.toFixed(6) : '--'}
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-xs text-gray-400">Longitude</span>
            <span className="text-sm font-mono text-gray-200 dark:text-gray-200 text-gray-800">
              {gps?.lng != null ? gps.lng.toFixed(6) : '--'}
            </span>
          </div>
        </div>

        {/* Current command */}
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-400 mb-1">Current Command</p>
          <p className={`text-sm font-bold uppercase ${commandColor}`}>
            {currentCmd ?? '--'}
          </p>
        </div>

        {/* Device online indicator */}
        <div className="mt-3 flex items-center gap-2">
          {isDeviceOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-400">Live data</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-xs text-gray-400">Last known data</span>
            </>
          )}
        </div>
      </div>

    </div>
  )
}

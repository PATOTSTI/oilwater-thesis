import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Battery, Zap, AlertOctagon, Loader2, Shield, ShieldOff, AlertTriangle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCommand } from '../hooks/useCommand'
import { armMotors } from '../api/endpoints'

const ROUTE_TITLES = {
  '/':          'Dashboard',
  '/map':       'Map & Navigation',
  '/control':   'Manual Control',
  '/detection': 'Oil Detection',
  '/cleaning':  'Cleaning Pattern',
  '/battery':   'Battery & Solar',
  '/sensors':   'Sensor Data',
  '/logs':      'Activity Logs',
}

const MODE_COLORS = {
  manual:    'border-blue-500/30   bg-blue-500/10   text-blue-400',
  automatic: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  cleaning:  'border-cyan-500/30   bg-cyan-500/10   text-cyan-400',
  returning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  standby:   'border-gray-600 bg-gray-700/40 text-gray-400',
}

export default function StatusBar() {
  const { pathname } = useLocation()
  const {
    isDeviceOnline,
    currentMode,
    batteryLevel,
    solarCharging,
    latencyMs,
    dataUpdatedAt,
    motorsArmed,
    setMotorsArmed,
  } = useApp()
  const { emergencyStop, isLoading } = useCommand()

  const [stopped,        setStopped]        = useState(false)
  const [flashing,       setFlashing]       = useState(false)
  const [now,            setNow]            = useState(Date.now())
  const [showArmConfirm, setShowArmConfirm] = useState(false)
  const [armChecked,     setArmChecked]     = useState(false)

  // Tick every second for the "last seen Xs ago" counter
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!showArmConfirm) setArmChecked(false)
  }, [showArmConfirm])

  const handleEStop = () => {
    emergencyStop()
    setStopped(true);  setTimeout(() => setStopped(false),  1000)
    setFlashing(true); setTimeout(() => setFlashing(false), 2000)
  }

  const batteryColor =
    batteryLevel > 50  ? 'text-green-400'
    : batteryLevel >= 20 ? 'text-yellow-400'
    : 'text-red-400 animate-pulse'

  const modeColor = MODE_COLORS[currentMode] ?? MODE_COLORS.standby
  const pageTitle = ROUTE_TITLES[pathname] ?? 'AquaDetect'
  const modeLabel = currentMode
    ? currentMode.charAt(0).toUpperCase() + currentMode.slice(1)
    : 'Standby'

  // Compute seconds since last successful HTTP response
  const secsSinceUpdate = dataUpdatedAt ? Math.floor((now - dataUpdatedAt) / 1000) : null

  // 3-state connection signal
  const connectionState =
    !isDeviceOnline               ? 'offline'
    : latencyMs != null && latencyMs > 300 ? 'weak'
    : 'connected'

  return (
    <>
    <div className={[
      'fixed left-56 right-0 top-0 z-40 h-14',
      'flex items-center justify-between px-6',
      'border-b border-gray-700 bg-gray-900',
    ].join(' ')}>

      {/* ── Left — current page title ──────────────────────────────────── */}
      <span className="text-base font-semibold text-white">
        {pageTitle}
      </span>

      {/* ── Center — heartbeat + mode badge ───────────────────────────── */}
      <div className="flex items-center gap-3">

        {/* Live heartbeat indicator */}
        {connectionState === 'connected' && (
          <div className="flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm font-medium text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            {latencyMs != null ? `Live · ${latencyMs}ms` : 'Live'}
          </div>
        )}
        {connectionState === 'weak' && (
          <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Weak signal
          </div>
        )}
        {connectionState === 'offline' && (
          <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm font-medium text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {secsSinceUpdate != null
              ? `Offline · last seen ${secsSinceUpdate}s ago`
              : 'Offline'}
          </div>
        )}

        {/* Mode badge */}
        <div className={`rounded-full border px-3 py-1 text-sm font-medium ${modeColor}`}>
          {modeLabel}
        </div>
      </div>

      {/* ── Right — battery + arm/disarm + emergency stop ─────────────── */}
      <div className="flex items-center gap-3">
        {/* Battery */}
        <div className={`flex items-center gap-1.5 text-sm font-medium ${batteryColor}`}>
          <Battery className="h-4 w-4" />
          <span>{batteryLevel}%</span>
          {solarCharging && <Zap className="h-3 w-3 text-yellow-400" />}
        </div>

        {/* ARM / DISARM pill */}
        {motorsArmed ? (
          <button
            type="button"
            onClick={() => {
              setMotorsArmed(false)
              armMotors(false).catch(console.error)
            }}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-all duration-200 cursor-pointer bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400"
          >
            <Shield className="w-3.5 h-3.5" />
            ARMED
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowArmConfirm(true)}
            disabled={!isDeviceOnline}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-all duration-200 bg-gray-700 border border-gray-600 text-gray-400 hover:bg-green-500/20 hover:border-green-500/50 hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-700 disabled:hover:border-gray-600 disabled:hover:text-gray-400"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            DISARMED
          </button>
        )}

        {/* Emergency Stop — always visible, always red */}
        <button
          type="button"
          onClick={handleEStop}
          disabled={isLoading}
          className={[
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5',
            'bg-red-600 hover:bg-red-500 text-white text-xs font-bold',
            'transition-colors duration-150 disabled:opacity-70',
            flashing ? 'ring-2 ring-red-400 ring-offset-1 ring-offset-gray-900' : '',
          ].join(' ')}
        >
          {isLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <AlertOctagon className="h-3.5 w-3.5" />}
          {stopped ? 'STOPPED' : 'E-STOP'}
        </button>
      </div>
    </div>

    {/* ── Arm confirmation overlay ──────────────────────────────────────── */}
    {showArmConfirm && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full">
          <Shield className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white text-center mb-2">Arm Motors?</h3>
          <p className="text-sm text-gray-400 text-center mb-4">
            This will enable motor control. Ensure the area around the boat is clear before proceeding.
          </p>
          <div className="flex items-start gap-2 mb-5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <input
              type="checkbox"
              checked={armChecked}
              onChange={() => setArmChecked(!armChecked)}
              className="mt-0.5 accent-yellow-400"
            />
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-yellow-300">
              I confirm the area is clear and it is safe to arm the motors.
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowArmConfirm(false); setArmChecked(false) }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!armChecked}
              onClick={() => {
                if (armChecked) {
                  setMotorsArmed(true)
                  setShowArmConfirm(false)
                  setArmChecked(false)
                  armMotors(true).catch(console.error)
                }
              }}
              className={[
                'flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors duration-150',
                'flex items-center justify-center gap-1.5',
                armChecked
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50',
              ].join(' ')}
            >
              <Shield className="w-4 h-4" />
              Arm Motors
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

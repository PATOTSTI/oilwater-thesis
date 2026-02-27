import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Battery, Zap, AlertOctagon, Loader2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCommand } from '../hooks/useCommand'

// Route → display title mapping
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

// Mode → Tailwind colour classes
const MODE_COLORS = {
  manual:    'bg-blue-500/20 text-blue-400',
  automatic: 'bg-purple-500/20 text-purple-400',
  cleaning:  'bg-cyan-500/20 text-cyan-400',
  returning: 'bg-yellow-500/20 text-yellow-400',
  standby:   'bg-gray-500/20 text-gray-400',
}

export default function StatusBar() {
  const { pathname } = useLocation()
  const { isDeviceOnline, currentMode, batteryLevel, solarCharging } = useApp()
  const { emergencyStop, isLoading } = useCommand()

  const [stopped,  setStopped]  = useState(false)
  const [flashing, setFlashing] = useState(false)

  const handleEStop = () => {
    emergencyStop()
    setStopped(true);  setTimeout(() => setStopped(false),  1000)
    setFlashing(true); setTimeout(() => setFlashing(false), 2000)
  }

  const batteryColor =
    batteryLevel > 50  ? 'text-green-400'
    : batteryLevel >= 20 ? 'text-yellow-400'
    : 'text-red-400 animate-pulse'

  const modeColor  = MODE_COLORS[currentMode] ?? MODE_COLORS.standby
  const pageTitle  = ROUTE_TITLES[pathname]   ?? 'AquaDetect'
  const modeLabel  = currentMode
    ? currentMode.charAt(0).toUpperCase() + currentMode.slice(1)
    : 'Standby'

  return (
    <div className={[
      'fixed left-16 right-0 top-0 z-40 h-14',
      'flex items-center justify-between px-6',
      'border-b border-gray-200 bg-white',
      'dark:border-gray-700 dark:bg-gray-900',
    ].join(' ')}>

      {/* ── Left — current page title ──────────────────────────────────── */}
      <span className="text-base font-semibold text-gray-900 dark:text-white">
        {pageTitle}
      </span>

      {/* ── Center — connection status pill + mode badge ───────────────── */}
      <div className="flex items-center gap-3">
        {/* Connection pill */}
        <div className={[
          'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
          isDeviceOnline ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400',
        ].join(' ')}>
          <span className={[
            'h-2 w-2 rounded-full',
            isDeviceOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-500',
          ].join(' ')} />
          {isDeviceOnline ? 'Online' : 'Offline'}
        </div>

        {/* Mode badge */}
        <div className={`rounded-full px-3 py-1 text-xs font-medium ${modeColor}`}>
          {modeLabel}
        </div>
      </div>

      {/* ── Right — battery indicator + emergency stop ─────────────────── */}
      <div className="flex items-center gap-3">
        {/* Battery */}
        <div className={`flex items-center gap-1.5 text-sm font-medium ${batteryColor}`}>
          <Battery className="h-4 w-4" />
          <span>{batteryLevel}%</span>
          {solarCharging && <Zap className="h-3 w-3 text-yellow-400" />}
        </div>

        {/* Emergency Stop */}
        <button
          type="button"
          onClick={handleEStop}
          disabled={isLoading}
          className={[
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5',
            'bg-red-600 hover:bg-red-700 text-white text-xs font-bold',
            'transition-colors duration-150 disabled:opacity-70',
            flashing ? 'ring-2 ring-red-400' : '',
          ].join(' ')}
        >
          {isLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <AlertOctagon className="h-3.5 w-3.5" />}
          {stopped ? 'STOPPED' : 'E-STOP'}
        </button>
      </div>
    </div>
  )
}
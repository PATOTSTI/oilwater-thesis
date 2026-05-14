import { useState, useEffect } from 'react'
import { BatteryLow, WifiOff, Droplets, Waves, AlertTriangle, X } from 'lucide-react'
import { useApp } from '../context/AppContext'

// ── Reappear intervals (ms); null = stays dismissed until condition resets ──────
const REAPPEAR_INTERVALS = {
  low_battery:    30000,
  device_offline: 15000,
  oil_detected:   null,
  cleaning_active: null,
}

export default function AlertBanner() {
  const { lowBatteryWarning, isDeviceOnline, oilDetected, currentMode, dataUpdatedAt } = useApp()
  const [dismissedAt, setDismissedAt] = useState({})
  const [now, setNow] = useState(Date.now())

  // Tick every second so the "no data" counter stays live
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Dismiss handler ─────────────────────────────────────────────────────────
  const handleDismiss = (alertId) => {
    setDismissedAt(prev => ({ ...prev, [alertId]: Date.now() }))
  }

  // ── Visibility check ────────────────────────────────────────────────────────
  const shouldShow = (alertId, condition) => {
    if (!condition) return false
    const dismissTime = dismissedAt[alertId]
    if (!dismissTime) return true
    const interval = REAPPEAR_INTERVALS[alertId]
    if (!interval) return false
    return Date.now() - dismissTime > interval
  }

  // ── Clear dismissed state when each condition resets so alert re-arms ───────
  useEffect(() => {
    if (!lowBatteryWarning)
      setDismissedAt(prev => { const u = { ...prev }; delete u.low_battery;    return u })
  }, [lowBatteryWarning])

  useEffect(() => {
    if (isDeviceOnline)
      setDismissedAt(prev => { const u = { ...prev }; delete u.device_offline; return u })
  }, [isDeviceOnline])

  useEffect(() => {
    if (!oilDetected)
      setDismissedAt(prev => { const u = { ...prev }; delete u.oil_detected;   return u })
  }, [oilDetected])

  useEffect(() => {
    if (currentMode !== 'cleaning')
      setDismissedAt(prev => { const u = { ...prev }; delete u.cleaning_active; return u })
  }, [currentMode])

  // ── No-data warning — triggers when no successful poll for > 5 s ────────────
  const secsSinceData = dataUpdatedAt ? Math.floor((now - dataUpdatedAt) / 1000) : null
  const showNoDataBanner = secsSinceData != null && secsSinceData >= 5

  // ── Alert definitions ────────────────────────────────────────────────────────
  const ALERTS = [
    {
      id:        'low_battery',
      condition: lowBatteryWarning,
      icon:      BatteryLow,
      message:   'LOW BATTERY — Device is returning to home position automatically',
      cls:       'bg-red-500/20 border-red-500 text-red-400',
    },
    {
      id:        'device_offline',
      condition: !isDeviceOnline,
      icon:      WifiOff,
      message:   'DEVICE OFFLINE — No status updates received from device',
      cls:       'bg-gray-500/20 border-gray-500 text-gray-400',
    },
    {
      id:        'oil_detected',
      condition: oilDetected,
      icon:      Droplets,
      message:   'OIL DETECTED — Capacitive sensor detected oil presence on water surface',
      cls:       'bg-yellow-500/20 border-yellow-500 text-yellow-400',
    },
    {
      id:        'cleaning_active',
      condition: currentMode === 'cleaning',
      icon:      Waves,
      message:   'CLEANING IN PROGRESS — Spiral pattern is currently active',
      cls:       'bg-cyan-500/20 border-cyan-500 text-cyan-400',
    },
  ]

  const active = ALERTS.filter(({ id, condition }) => shouldShow(id, condition))
  if (active.length === 0 && !showNoDataBanner) return null

  return (
    <div className="transition-all duration-300 ease-in-out">
      {/* No-data warning — live counter, not dismissable */}
      {showNoDataBanner && (
        <div className="flex items-center border-l-4 px-6 py-2 bg-amber-500/20 border-amber-500 text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="ml-3 flex-1 text-sm font-medium">
            ⚠ No data received for {secsSinceData}s — device may be unreachable
          </span>
        </div>
      )}

      {active.map(({ id, icon: Icon, message, cls }) => (
        <div
          key={id}
          className={[
            'flex items-center border-l-4 px-6 py-2',
            'transition-all duration-300 ease-in-out',
            cls,
          ].join(' ')}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="ml-3 flex-1 text-sm font-medium">{message}</span>
          <X
            className="ml-3 h-4 w-4 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            onClick={() => handleDismiss(id)}
          />
        </div>
      ))}
    </div>
  )
}

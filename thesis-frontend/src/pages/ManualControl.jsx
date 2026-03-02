/**
 * ManualControl.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual control page for the AquaDetect dashboard.
 *
 * Left column  – Movement controls (D-pad, speed, rudder)
 * Right column – System controls (mode, pump, status, emergency stop)
 */

import { useState, useEffect } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Waves,
  Play,
  AlertOctagon,
  Loader2,
  Info,
  AlertTriangle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCommand } from '../hooks/useCommand'
import { useMode } from '../hooks/useMode'

// ── Shared card style ─────────────────────────────────────────────────────────
const cardClass =
  'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5'

const titleClass = 'text-sm font-semibold text-gray-900 dark:text-white'

export default function ManualControl() {
  // ── Shared state across all movement cards ────────────────────────────────
  const [speed, setSpeed] = useState(200)
  const [rudderAngle, setRudderAngle] = useState(0)
  const [activeKey, setActiveKey] = useState(null)

  // ── Right-column state ────────────────────────────────────────────────────
  const [modeSuccess, setModeSuccess] = useState(false)   // "Mode changed!" flash
  const [stopped, setStopped] = useState(false)            // emergency-stop flash

  const { currentMode, deviceStatus } = useApp()
  const { sendCommand, emergencyStop, isLoading: cmdLoading } = useCommand()
  const { changeMode, isLoading: modeLoading } = useMode()

  const isManual = currentMode === 'manual'

  // ── Mode badge colour helper ──────────────────────────────────────────────
  const modeBadgeClass = (mode) => {
    switch (mode) {
      case 'manual':    return 'bg-blue-500/20 text-blue-400'
      case 'automatic': return 'bg-purple-500/20 text-purple-400'
      case 'cleaning':  return 'bg-cyan-500/20 text-cyan-400'
      case 'returning': return 'bg-yellow-500/20 text-yellow-400'
      default:          return 'bg-gray-500/20 text-gray-400'
    }
  }

  // ── Mode change handler — shows 2-second success toast ───────────────────
  const handleModeChange = (mode) => {
    changeMode(mode)
    setModeSuccess(false)
    // We poll until the mutation resolves; use a slight delay so the flag
    // fires after the request completes (optimistic UX).
    setTimeout(() => {
      setModeSuccess(true)
      setTimeout(() => setModeSuccess(false), 2000)
    }, 600)
  }

  // ── Emergency stop handler — 1-second flash ───────────────────────────────
  const handleEmergencyStop = () => {
    emergencyStop()
    setStopped(true)
    setTimeout(() => setStopped(false), 1000)
  }

  // ── Keyboard support ──────────────────────────────────────────────────────
  useEffect(() => {
    const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']

    const handleKeyDown = (e) => {
      if (!ARROW_KEYS.includes(e.key)) return

      // Always prevent browser scroll on arrow / space keys
      e.preventDefault()

      // Only activate controls in manual mode
      if (!isManual) return

      const keyName = e.key === ' ' ? 'Space' : e.key
      setActiveKey(keyName)

      switch (e.key) {
        case 'ArrowUp':
          sendCommand('forward', speed)
          break
        case 'ArrowDown':
          sendCommand('backward', speed)
          break
        case 'ArrowLeft':
          sendCommand('turn_left', speed)
          break
        case 'ArrowRight':
          sendCommand('turn_right', speed)
          break
        case ' ':
          sendCommand('stop', 0)
          break
      }
    }

    const handleKeyUp = (e) => {
      if (!ARROW_KEYS.includes(e.key)) return
      setActiveKey(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // Cleanup on unmount or when deps change
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isManual, speed, sendCommand])

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns Tailwind classes for a directional button based on its active key. */
  const dirBtnClass = (keyName) =>
    [
      'w-14 h-14 rounded-xl flex items-center justify-center',
      'transition-all duration-100 text-xs font-bold',
      activeKey === keyName
        ? 'bg-blue-400 scale-95 text-white'
        : 'bg-blue-600 hover:bg-blue-500 text-white',
    ].join(' ')

  /** Dynamic colour for the rudder angle display. */
  const rudderColor =
    rudderAngle === 0
      ? 'text-blue-400'
      : rudderAngle < 0
        ? 'text-yellow-400'
        : 'text-orange-400'

  /** Descriptive label shown below the rudder angle number. */
  const rudderLabel =
    rudderAngle === 0 ? 'Straight' : rudderAngle < 0 ? 'Turning Left' : 'Turning Right'

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 w-full h-full">
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN — Movement Controls
        ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full lg:w-96 flex flex-col gap-4">

          {/* ── Card 1: Directional D-pad Controls ──────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-4`}>Movement Controls</h2>

            {/* Mode warning — shown when keyboard controls are inactive */}
            {!isManual && (
              <p className="text-xs text-yellow-400 text-center mb-3">
                Switch to Manual mode to use keyboard controls
              </p>
            )}

            {/* D-pad — 3 × 3 CSS grid */}
            <div className="grid grid-cols-3 gap-2 w-48 mx-auto">

              {/* Row 1 — Forward */}
              <div />
              <button
                className={dirBtnClass('ArrowUp')}
                onClick={() => isManual && sendCommand('forward', speed)}
                aria-label="Forward"
              >
                <ArrowUp className="w-6 h-6" />
              </button>
              <div />

              {/* Row 2 — Left · Stop · Right */}
              <button
                className={dirBtnClass('ArrowLeft')}
                onClick={() => isManual && sendCommand('turn_left', speed)}
                aria-label="Turn Left"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>

              {/* Stop (centre) */}
              <button
                className={[
                  'w-14 h-14 rounded-xl flex items-center justify-center',
                  'transition-all duration-100 text-xs font-bold',
                  activeKey === 'Space'
                    ? 'bg-red-400 scale-95 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white',
                ].join(' ')}
                onClick={() => sendCommand('stop', 0)}
                aria-label="Stop"
              >
                <Square className="w-5 h-5" />
              </button>

              <button
                className={dirBtnClass('ArrowRight')}
                onClick={() => isManual && sendCommand('turn_right', speed)}
                aria-label="Turn Right"
              >
                <ArrowRight className="w-6 h-6" />
              </button>

              {/* Row 3 — Backward */}
              <div />
              <button
                className={dirBtnClass('ArrowDown')}
                onClick={() => isManual && sendCommand('backward', speed)}
                aria-label="Backward"
              >
                <ArrowDown className="w-6 h-6" />
              </button>
              <div />
            </div>

            {/* Keyboard hint */}
            <p className="text-xs text-gray-500 text-center mt-3">
              Use arrow keys to control • Space to stop
            </p>
          </div>

          {/* ── Card 2: Speed Control ────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Motor Speed (PWM)</h2>

            {/* Speed value display */}
            <div className="text-center mb-4">
              <span className="text-3xl font-bold text-blue-400">{speed}</span>
              <p className="text-xs text-gray-400 mt-1">
                {Math.round((speed / 255) * 100)}% power
              </p>
            </div>

            {/* Speed slider */}
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />

            {/* Speed preset buttons */}
            <div className="flex gap-2 mt-3 justify-center">
              {[
                { label: 'Slow',   value: 80  },
                { label: 'Normal', value: 180 },
                { label: 'Fast',   value: 255 },
              ].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setSpeed(value)}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Card 3: Rudder Angle ─────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Rudder Angle</h2>

            {/* Rudder value display */}
            <div className="text-center mb-4">
              <span className={`text-3xl font-bold ${rudderColor}`}>
                {rudderAngle}°
              </span>
              <p className="text-xs text-gray-400 mt-1">{rudderLabel}</p>
            </div>

            {/* Visual rudder indicator — rotates with the angle */}
            <div className="flex justify-center items-center h-6 mb-4">
              <div
                className="w-16 h-1 bg-blue-500 rounded"
                style={{ transform: `rotate(${rudderAngle}deg)` }}
              />
            </div>

            {/* Rudder slider */}
            <input
              type="range"
              min={-90}
              max={90}
              step={1}
              value={rudderAngle}
              onChange={(e) => {
                const val = Number(e.target.value)
                setRudderAngle(val)
                sendCommand('set_rudder', speed, val)
              }}
              className="w-full accent-blue-500 cursor-pointer"
            />

            {/* Slider end labels */}
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">-90° Left</span>
              <span className="text-xs text-gray-500">0°</span>
              <span className="text-xs text-gray-500">Right 90°</span>
            </div>

            {/* Reset to centre button */}
            <div className="flex justify-center mt-3">
              <button
                onClick={() => {
                  setRudderAngle(0)
                  sendCommand('set_rudder', speed, 0)
                }}
                className="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Reset to Center
              </button>
            </div>
          </div>

        </div>
        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN — System Controls
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col gap-4">

          {/* ── Card 1: Mode Switcher ────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Device Mode</h2>

            {/* Current mode badge */}
            <div className={`px-4 py-2 rounded-full text-sm font-bold text-center mb-3 capitalize ${modeBadgeClass(currentMode)}`}>
              {currentMode ?? 'unknown'}
            </div>

            {/* Mode change success flash */}
            {modeSuccess && (
              <p className="text-xs text-green-400 text-center mb-2">Mode changed!</p>
            )}

            {/* Mode buttons grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Manual',    value: 'manual'    },
                { label: 'Automatic', value: 'automatic' },
                { label: 'Standby',   value: 'standby'   },
                { label: 'Returning', value: 'returning' },
              ].map(({ label, value }) => {
                const isActive = currentMode === value
                return (
                  <button
                    key={value}
                    onClick={() => handleModeChange(value)}
                    disabled={modeLoading}
                    className={[
                      'text-xs font-medium py-2 px-3 rounded-lg transition-colors duration-150 flex items-center justify-center gap-1',
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300',
                    ].join(' ')}
                  >
                    {modeLoading && isActive && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    {label}
                  </button>
                )
              })}
            </div>

            {/* FIX 2 - Mode sync warning */}
            {(() => {
              const backendMode = currentMode
              const esp32Mode = deviceStatus?.esp32_mode
              return (
                <>
                  {/* Info note */}
                  <div className="border-t border-gray-700/50 mt-3 pt-3 flex items-start gap-2 text-xs text-gray-500">
                    <Info className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                    <span>
                      Mode is set from this dashboard. Device reports its current mode separately.
                    </span>
                  </div>

                  {/* Sync mismatch warning */}
                  {esp32Mode != null && backendMode !== esp32Mode && (
                    <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20 mt-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      <span>Device is still in <strong>{esp32Mode}</strong> mode. Waiting for sync...</span>
                    </div>
                  )}
                </>
              )
            })()}
          </div>

          {/* ── Card 2: Pump Control ─────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Pump Control</h2>

            {/* Pump status indicator */}
            {deviceStatus?.pump_status ? (
              <div className="bg-blue-500/20 rounded-xl p-4">
                <Waves className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-blue-400 font-bold text-center">RUNNING</p>
              </div>
            ) : (
              <div className="bg-gray-700/30 rounded-xl p-4">
                <Waves className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 font-bold text-center">IDLE</p>
              </div>
            )}

            {/* FIX 1 - Pump blocked message */}
            {(() => {
              const isPumpControllable = currentMode === 'manual'

              if (!isPumpControllable) {
                const pumpBlockedMsg = {
                  automatic: 'Pump activates automatically when oil is detected',
                  standby:   'Switch to Manual mode to control the pump',
                  returning: 'Pump is disabled while device is returning home',
                  cleaning:  'Pump is controlled automatically during cleaning',
                }[currentMode] ?? 'Switch to Manual mode to control the pump'

                return (
                  <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20 w-full justify-center mt-3">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{pumpBlockedMsg}</span>
                  </div>
                )
              }

              // Pump is controllable — show the normal toggle button
              return deviceStatus?.pump_status ? (
                <button
                  onClick={() => sendCommand('pump_off', 0)}
                  disabled={cmdLoading}
                  className="py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 w-full mt-3 bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  {cmdLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Square className="w-4 h-4" />
                  }
                  Turn Pump Off
                </button>
              ) : (
                <button
                  onClick={() => sendCommand('pump_on', 200)}
                  disabled={cmdLoading}
                  className="py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {cmdLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Play className="w-4 h-4" />
                  }
                  Turn Pump On
                </button>
              )
            })()}

            {/* Pump note */}
            <p className="text-xs text-gray-500 text-center mt-2">
              Pump extracts oil from water surface
            </p>
          </div>

          {/* ── Card 3: Current Status ───────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Current Status</h2>

            <div className="flex flex-col">
              {[
                {
                  label: 'Last Command',
                  value: deviceStatus?.current_command ?? '--',
                },
                {
                  label: 'ESP32 Command',
                  value: deviceStatus?.esp32_command ?? '--',
                },
                {
                  label: 'Current Mode',
                  value: deviceStatus?.current_mode ?? '--',
                },
                {
                  label: 'Rudder Angle',
                  value: deviceStatus?.esp32_rudder_angle != null
                    ? deviceStatus.esp32_rudder_angle + '°'
                    : '--',
                },
                {
                  label: 'Heading',
                  value: deviceStatus?.heading != null
                    ? deviceStatus.heading + '°'
                    : '--',
                },
                {
                  label: 'Time Since Update',
                  value: deviceStatus?.time_since_last_update != null
                    ? deviceStatus.time_since_last_update.toFixed(1) + 's ago'
                    : '--',
                },
              ].map(({ label, value }, i, arr) => (
                <div
                  key={label}
                  className={[
                    'flex justify-between items-center py-1.5',
                    i < arr.length - 1 ? 'border-b border-gray-700/50' : '',
                  ].join(' ')}
                >
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-sm font-mono font-medium text-gray-800 dark:text-gray-200">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Card 4: Emergency Stop ───────────────────────────────────── */}
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl shadow-lg p-5">
            <h2 className="text-sm font-semibold text-red-400 mb-2">Emergency Stop</h2>

            <p className="text-xs text-gray-400 mb-3">
              Immediately stops all motors and pump.
              Use in case of emergency or unexpected behavior.
            </p>

            {/* Emergency stop button */}
            <button
              onClick={handleEmergencyStop}
              className={[
                'py-3 px-4 rounded-xl flex items-center justify-center gap-2 w-full',
                'font-bold text-base text-white transition-all duration-100 active:scale-95',
                stopped
                  ? 'bg-red-400'
                  : 'bg-red-600 hover:bg-red-500 active:bg-red-700',
              ].join(' ')}
            >
              <AlertOctagon className="w-5 h-5" />
              {stopped ? 'STOPPED' : 'EMERGENCY STOP'}
            </button>

            {/* Warning text */}
            <p className="text-xs text-red-400/70 text-center mt-2">
              ⚠ This will halt all device operations
            </p>
          </div>

        </div>

      </div>
    </div>
  )
}
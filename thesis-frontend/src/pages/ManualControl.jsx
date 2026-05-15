/**
 * ManualControl.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual control page for the AquaDetect dashboard.
 *
 * Left column  – Movement controls (D-pad + stop, speed, rudder)
 * Right column – System controls (mode, pump, status)
 *
 * Color semantics:
 *   Blue  → navigation actions (directional arrows, slider adjustments)
 *   Amber → mode change buttons
 *   Green → active/on states (pump running, connected)
 *   Red   → stop / danger actions (motor stop, E-STOP in header)
 */

import { useState, useEffect } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  StopCircle,
  Waves,
  Play,
  Square,
  Loader2,
  AlertTriangle,
  Shield,
  ShieldOff,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCommand } from '../hooks/useCommand'
import { useMode } from '../hooks/useMode'

// ── Shared card style ─────────────────────────────────────────────────────────
const cardClass =
  'bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-5'

const titleClass = 'text-sm font-semibold text-white'

// Format elapsed seconds as HH:MM:SS
function formatElapsed(ms) {
  const secs = Math.floor(ms / 1000)
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function ManualControl() {
  // ── Shared state across all movement cards ────────────────────────────────
  const [speed, setSpeed] = useState(200)
  const [rudderAngle, setRudderAngle] = useState(0)
  const [activeKey, setActiveKey] = useState(null)

  // ── Right-column state ────────────────────────────────────────────────────
  const [modeSuccess, setModeSuccess] = useState(false)

  // ── Pump elapsed timer ────────────────────────────────────────────────────
  const [pumpRunSince, setPumpRunSince] = useState(null)
  const [pumpRunTime, setPumpRunTime] = useState('00:00:00')

  // ── Status panel live clock ───────────────────────────────────────────────
  const [statusNow, setStatusNow] = useState(Date.now())

  const { currentMode, deviceStatus, dataUpdatedAt, motorsArmed, setMotorsArmed } = useApp()
  const { sendCommand, isLoading: cmdLoading } = useCommand()
  const { changeMode, isLoading: modeLoading } = useMode()

  const isManual = currentMode === 'manual'
  const pumpRunning = !!deviceStatus?.pump_status

  // ── Pump run-time tracking ────────────────────────────────────────────────
  useEffect(() => {
    if (pumpRunning) {
      setPumpRunSince(prev => prev ?? Date.now())
    } else {
      setPumpRunSince(null)
      setPumpRunTime('00:00:00')
    }
  }, [pumpRunning])

  useEffect(() => {
    if (!pumpRunSince) return
    const t = setInterval(() => {
      setPumpRunTime(formatElapsed(Date.now() - pumpRunSince))
    }, 1000)
    return () => clearInterval(t)
  }, [pumpRunSince])

  // ── Status panel 1-second ticker ─────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setStatusNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Mode change handler ───────────────────────────────────────────────────
  const handleModeChange = (mode) => {
    changeMode(mode)
    setModeSuccess(false)
    setTimeout(() => {
      setModeSuccess(true)
      setTimeout(() => setModeSuccess(false), 2000)
    }, 600)
  }

  // ── Keyboard support ──────────────────────────────────────────────────────
  useEffect(() => {
    const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']

    const handleKeyDown = (e) => {
      if (!ARROW_KEYS.includes(e.key)) return
      e.preventDefault()

      if (e.key === ' ') {
        sendCommand('stop', 0)
        return
      }

      if (!isManual || !motorsArmed) return

      const keyName = e.key
      setActiveKey(keyName)

      switch (e.key) {
        case 'ArrowUp':    sendCommand('forward',    speed);       break
        case 'ArrowDown':  sendCommand('backward',   speed);       break
        case 'ArrowLeft':  sendCommand('turn_left',  speed, -45);  break
        case 'ArrowRight': sendCommand('turn_right', speed,  45);  break
      }
    }

    const handleKeyUp = (e) => {
      if (!ARROW_KEYS.includes(e.key)) return
      setActiveKey(null)
      if (e.key !== ' ' && isManual) {
        sendCommand('stop', 0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isManual, motorsArmed, speed, sendCommand])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const dirBtnClass = (keyName) =>
    [
      'w-14 h-14 rounded-xl flex items-center justify-center',
      'transition-all duration-100 font-bold',
      !motorsArmed
        ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
        : activeKey === keyName
          ? 'bg-blue-400 scale-95 text-white'
          : 'bg-blue-600 hover:bg-blue-500 text-white',
    ].join(' ')

  const rudderColor =
    rudderAngle === 0 ? 'text-blue-400'
    : rudderAngle < 0 ? 'text-yellow-400'
    : 'text-orange-400'

  const rudderLabel =
    rudderAngle === 0 ? 'Straight'
    : rudderAngle < 0 ? 'Turning Left'
    : 'Turning Right'

  // Stale detection — values older than 3 s turn amber
  const timeSinceLastPoll = dataUpdatedAt
    ? (statusNow - dataUpdatedAt) / 1000
    : null
  const isStale = timeSinceLastPoll != null && timeSinceLastPoll > 3

  // Live "time since update" counter (increments every second)
  const liveSinceUpdate = timeSinceLastPoll != null
    ? `${Math.floor(timeSinceLastPoll)}s ago`
    : '--'

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 w-full h-full">
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN — Movement Controls
        ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full lg:w-96 flex flex-col gap-4">

          {/* ── Arm status banner ────────────────────────────────────────── */}
          {motorsArmed ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-400" />
                <div>
                  <p className="text-sm font-bold text-green-400">Motors Armed</p>
                  <p className="text-xs text-green-400/70">Ready for operation</p>
                </div>
              </div>
              <button
                onClick={() => setMotorsArmed(false)}
                className="bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 border border-red-500/30"
              >
                <ShieldOff className="w-3.5 h-3.5" />
                Disarm
              </button>
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldOff className="w-4 h-4 text-red-400" />
                <div>
                  <p className="text-sm font-bold text-red-400">Motors Disarmed</p>
                  <p className="text-xs text-red-400/70">Arm motors before operation</p>
                </div>
              </div>
              <span className="text-xs text-gray-400">Use ARM button in header</span>
            </div>
          )}

          {/* ── Card 1: Directional D-pad Controls ──────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-4`}>Movement Controls</h2>

            {!isManual && (
              <p className="text-xs text-amber-400 text-center mb-3">
                Switch to Manual mode to use keyboard controls
              </p>
            )}

            {/* D-pad — 3 × 3 CSS grid; center cell is intentionally empty */}
            <div className="grid grid-cols-3 gap-2 w-48 mx-auto">
              {/* Row 1 — Forward */}
              <div />
              <button
                className={dirBtnClass('ArrowUp')}
                onMouseDown={() => isManual && motorsArmed && sendCommand('forward', speed)}
                onMouseUp={() => isManual && sendCommand('stop', 0)}
                onMouseLeave={() => isManual && sendCommand('stop', 0)}
                aria-label="Forward"
              >
                <ArrowUp className="w-6 h-6" />
              </button>
              <div />

              {/* Row 2 — Left · [empty] · Right */}
              <button
                className={dirBtnClass('ArrowLeft')}
                onMouseDown={() => isManual && motorsArmed && sendCommand('turn_left', speed, -45)}
                onMouseUp={() => isManual && sendCommand('stop', 0)}
                onMouseLeave={() => isManual && sendCommand('stop', 0)}
                aria-label="Turn Left"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div />
              <button
                className={dirBtnClass('ArrowRight')}
                onMouseDown={() => isManual && motorsArmed && sendCommand('turn_right', speed, 45)}
                onMouseUp={() => isManual && sendCommand('stop', 0)}
                onMouseLeave={() => isManual && sendCommand('stop', 0)}
                aria-label="Turn Right"
              >
                <ArrowRight className="w-6 h-6" />
              </button>

              {/* Row 3 — Backward */}
              <div />
              <button
                className={dirBtnClass('ArrowDown')}
                onMouseDown={() => isManual && motorsArmed && sendCommand('backward', speed)}
                onMouseUp={() => isManual && sendCommand('stop', 0)}
                onMouseLeave={() => isManual && sendCommand('stop', 0)}
                aria-label="Backward"
              >
                <ArrowDown className="w-6 h-6" />
              </button>
              <div />
            </div>

            {/* Stop motors button — below the D-pad, clearly separated */}
            <div className="mt-5">
              <button
                onClick={() => sendCommand('stop', 0)}
                className={[
                  'flex items-center justify-center gap-2 w-full py-3',
                  'rounded-full font-bold text-sm text-white',
                  'bg-red-600 hover:bg-red-500 transition-all duration-100 active:scale-95',
                  activeKey === 'Space' ? 'bg-red-400 scale-95' : '',
                ].join(' ')}
                aria-label="Stop motors"
              >
                <StopCircle className="w-5 h-5" />
                Stop motors
              </button>
            </div>

            {!motorsArmed && (
              <p className="text-xs text-red-400 text-center mt-2 flex items-center justify-center gap-1">
                <ShieldOff className="w-3 h-3" />
                Arm motors to enable controls
              </p>
            )}

            <p className="text-xs text-gray-500 text-center mt-3">
              Use arrow keys to navigate · Space to stop
            </p>
          </div>

          {/* ── Card 2: Speed Control ────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Motor Speed (PWM)</h2>

            {/* Dual display — PWM value + percentage */}
            <div className="flex items-baseline justify-center gap-2 mb-4">
              <span className="text-3xl font-bold text-blue-400">{speed}</span>
              <span className="text-sm text-gray-400">PWM</span>
              <span className="text-gray-600 text-sm">·</span>
              <span className="text-xl font-semibold text-blue-300">
                {Math.round((speed / 255) * 100)}%
              </span>
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

            {/* Snap presets: 33% / 66% / 100% */}
            <div className="flex gap-2 mt-3 justify-center">
              {[
                { label: 'Slow',   value: Math.round(255 * 0.33) },
                { label: 'Normal', value: Math.round(255 * 0.66) },
                { label: 'Fast',   value: 255 },
              ].map(({ label, value }) => {
                const pct = Math.round((value / 255) * 100)
                const isSnapped = speed === value
                return (
                  <button
                    key={label}
                    onClick={() => setSpeed(value)}
                    className={[
                      'text-xs px-3 py-1 rounded-lg transition-colors',
                      isSnapped
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300',
                    ].join(' ')}
                  >
                    {label} <span className="opacity-60">{pct}%</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Card 3: Rudder Angle ─────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Rudder Angle</h2>

            <div className="text-center mb-4">
              <span className={`text-3xl font-bold ${rudderColor}`}>
                {rudderAngle}°
              </span>
              <p className="text-xs text-gray-400 mt-1">{rudderLabel}</p>
            </div>

            {/* Visual rudder indicator */}
            <div className="flex justify-center items-center h-6 mb-4">
              <div
                className="w-16 h-1 bg-blue-500 rounded"
                style={{ transform: `rotate(${rudderAngle}deg)` }}
              />
            </div>

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

            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">-90° Left</span>
              <span className="text-xs text-gray-500">0°</span>
              <span className="text-xs text-gray-500">Right 90°</span>
            </div>

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

          {/* ── Card 1: Mode Selector ────────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Device Mode</h2>

            {modeSuccess && (
              <p className="text-xs text-green-400 text-center mb-2">Mode changed!</p>
            )}

            {/* 4-button mode grid — amber when active */}
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
                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300',
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

            {/* Device-reported mode status line */}
            {(() => {
              const esp32Mode = deviceStatus?.esp32_mode
              const mismatch = esp32Mode != null && currentMode !== esp32Mode
              return (
                <div className="mt-3 pt-3 border-t border-gray-700/50">
                  <p className="text-xs text-gray-400">
                    Device reports:{' '}
                    <span className={`font-medium capitalize ${mismatch ? 'text-amber-400' : 'text-gray-200'}`}>
                      {esp32Mode ?? '--'}
                    </span>
                    {mismatch && (
                      <span className="ml-1.5 text-amber-400/70">(waiting for sync)</span>
                    )}
                  </p>
                </div>
              )
            })()}
          </div>

          {/* ── Card 2: Pump Control ─────────────────────────────────────── */}
          <div className={[
            'rounded-xl shadow-lg p-5 border transition-colors duration-500',
            pumpRunning
              ? 'bg-gray-800 border-green-500/60'
              : 'bg-gray-800 border-gray-700',
          ].join(' ')}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={titleClass}>Pump Control</h2>
              {pumpRunning && (
                <span className="inline-flex items-center gap-1.5 bg-green-500/20 text-green-400 text-xs font-medium px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Running
                </span>
              )}
            </div>

            {/* Pump visual indicator */}
            {pumpRunning ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <Waves className="w-8 h-8 text-green-400 mx-auto mb-2 animate-wave" />
                <p className="text-green-400 font-bold text-center text-sm">RUNNING</p>
                <p className="text-green-400/70 text-xs text-center mt-1">
                  Running · {pumpRunTime}
                </p>
              </div>
            ) : (
              <div className="bg-gray-700/30 rounded-xl p-4">
                <Waves className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 font-bold text-center text-sm">IDLE</p>
              </div>
            )}

            {/* Pump control button or blocked message */}
            {(() => {
              const isPumpControllable = currentMode === 'manual'

              if (!isPumpControllable) {
                const msg = {
                  automatic: 'Pump activates automatically when oil is detected',
                  standby:   'Switch to Manual mode to control the pump',
                  returning: 'Pump disabled while returning home',
                  cleaning:  'Pump is controlled automatically during cleaning',
                }[currentMode] ?? 'Switch to Manual mode to control the pump'

                return (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20 mt-3 justify-center">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{msg}</span>
                  </div>
                )
              }

              return pumpRunning ? (
                <button
                  onClick={() => sendCommand('pump_off', 0)}
                  disabled={cmdLoading}
                  className="py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 w-full mt-3 bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  {cmdLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Square className="w-4 h-4" />}
                  Turn Pump Off
                </button>
              ) : (
                <button
                  onClick={() => sendCommand('pump_on', 200)}
                  disabled={cmdLoading}
                  className="py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 w-full mt-3 bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  {cmdLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Play className="w-4 h-4" />}
                  Turn Pump On
                </button>
              )
            })()}

            <p className="text-xs text-gray-500 text-center mt-2">
              Pump extracts oil from water surface
            </p>
          </div>

          {/* ── Card 3: Current Status ───────────────────────────────────── */}
          <div className={cardClass}>
            <h2 className={`${titleClass} mb-3`}>Current Status</h2>

            <div className="flex flex-col gap-0.5">
              {[
                {
                  label: 'Last Command',
                  value: deviceStatus?.current_command ?? '--',
                  isCounter: false,
                },
                {
                  label: 'ESP32 Command',
                  value: deviceStatus?.esp32_command ?? '--',
                  isCounter: false,
                },
                {
                  label: 'Current Mode',
                  value: deviceStatus?.current_mode ?? '--',
                  isCounter: false,
                },
                {
                  label: 'Rudder Angle',
                  value: deviceStatus?.esp32_rudder_angle != null
                    ? deviceStatus.esp32_rudder_angle + '°'
                    : '--',
                  isCounter: false,
                },
                {
                  label: 'Heading',
                  value: deviceStatus?.heading != null
                    ? deviceStatus.heading + '°'
                    : '--',
                  isCounter: false,
                },
                {
                  label: 'Time Since Update',
                  value: liveSinceUpdate,
                  isCounter: true,
                },
              ].map(({ label, value, isCounter }, i, arr) => (
                <div
                  key={label}
                  className={[
                    'flex items-center gap-2 py-2',
                    i < arr.length - 1 ? 'border-b border-gray-700/40' : '',
                  ].join(' ')}
                >
                  <span className="text-xs text-gray-400 shrink-0">{label}</span>
                  {/* Dot leader spacer */}
                  <span
                    className="flex-1 border-b border-dotted border-gray-600"
                    style={{ marginBottom: '2px' }}
                  />
                  <span className={[
                    'text-sm font-mono font-medium shrink-0',
                    isCounter
                      ? 'text-gray-400'
                      : isStale ? 'text-amber-400' : 'text-gray-200',
                  ].join(' ')}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

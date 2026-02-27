/**
 * AppContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global React context for the AquaDetect dashboard.
 *
 * Provides:
 *   Theme       – theme, toggleTheme (persisted in localStorage)
 *   Device data – deviceStatus, isDeviceOnline, currentMode, oilDetected
 *   Battery     – batteryLevel, batteryVoltage, solarCharging, lowBatteryWarning
 *   Alerts      – alerts[], dismissAlert(id)
 *
 * Usage:
 *   Wrap your app with <AppProvider>.
 *   Consume with the useApp() hook in any child component.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../api/apiClient'

// ── Context object ────────────────────────────────────────────────────────────
const AppContext = createContext(null)

// ── Local-storage key used to persist the user's theme preference ─────────────
const THEME_KEY = 'aquadetect_theme'

// ── Alert IDs — stable so add/remove logic is deterministic ──────────────────
const ALERT_LOW_BATTERY  = 'low-battery'
const ALERT_OIL_DETECTED = 'oil-detected'
const ALERT_OFFLINE      = 'device-offline'

// ─────────────────────────────────────────────────────────────────────────────
// AppProvider
// ─────────────────────────────────────────────────────────────────────────────
export function AppProvider({ children }) {

  // ── Theme ──────────────────────────────────────────────────────────────────
  // Initialise from localStorage; fall back to "dark".
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) ?? 'dark'
  )

  /** Flip between "dark" and "light" and persist the choice. */
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }, [])

  // ── Sync dark class to <html> ─────────────────────────────────────────────
  // Tailwind's "class" dark-mode strategy activates dark: variants when a
  // parent element has the "dark" class. Applying it to document.documentElement
  // (<html>) makes it the universal ancestor for the entire document, so every
  // dark: variant — including global scrollbar styles in index.css — responds
  // instantly whenever the user toggles the theme.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  // ── Status polling via React Query ────────────────────────────────────────
  // Polls GET /status every 3 s. On error the query data stays null so the app
  // keeps rendering; isDeviceOnline will be set to false automatically.
  const {
    data: deviceStatus = null,
    isError: queryError,
    dataUpdatedAt,          // changes on every successful fetch — drives alert re-sync
  } = useQuery({
    // Key must match the one hooks and mutations use so invalidateQueries()
    // from useCommand / useMode / useNavigation refreshes this entry too.
    queryKey: ['deviceStatus'],
    queryFn: async () => {
      // apiClient's response interceptor already unwraps the Axios wrapper,
      // so `envelope` is the backend's { success, data, message, timestamp }.
      const envelope = await apiClient.get('/status')
      if (!envelope.success) {
        throw new Error(envelope.message || 'Status fetch failed')
      }
      // Return only the inner payload so deviceStatus fields are accessed
      // directly (e.g. deviceStatus.time_since_last_update).
      return envelope.data
    },
    refetchInterval: 3000,  // poll every 3 seconds
    retry: false,           // detect offline quickly; global retry handles retries
  })

  // ── Derived device fields ─────────────────────────────────────────────────
  /**
   * isDeviceOnline — true only when:
   *   • the last query succeeded (no fetch error), AND
   *   • time_since_last_update is a number < 10 seconds
   */
  const isDeviceOnline =
    !queryError &&
    deviceStatus !== null &&
    deviceStatus.time_since_last_update !== null &&
    deviceStatus.time_since_last_update < 10

  /** Maps to backend field `current_mode`; defaults to "standby" when offline. */
  const currentMode = deviceStatus?.current_mode ?? 'standby'

  /** Maps to backend field `oil_detected`; defaults to false when offline. */
  const oilDetected = deviceStatus?.oil_detected ?? false

  // ── Derived battery fields ────────────────────────────────────────────────
  const batteryLevel    = deviceStatus?.battery_level   ?? 0
  const batteryVoltage  = deviceStatus?.battery_voltage ?? 0.0
  const solarCharging   = deviceStatus?.solar_charging  ?? false

  /** Triggers low-battery alerts and any UI warnings. */
  const lowBatteryWarning = batteryLevel < 20

  // ── Alerts state ──────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState([])

  /**
   * dismissedOilAlert — tracks whether the user manually dismissed the
   * oil-detected alert while the condition was still true.
   *
   * Reappear rules:
   *   LOW BATTERY  → always reappears on the next poll while condition is true
   *   OIL DETECTED → stays dismissed until oilDetected flips back to false,
   *                  then re-arms so the next detection shows it again
   *   DEVICE OFFLINE → always reappears on the next poll while condition is true
   */
  const [dismissedOilAlert, setDismissedOilAlert] = useState(false)

  // Reset the oil-alert dismissed flag as soon as the condition clears,
  // so the alert re-arms for the next detection event.
  useEffect(() => {
    if (!oilDetected) {
      setDismissedOilAlert(false)
    }
  }, [oilDetected])

  /**
   * Fully rebuild the alerts array whenever any driving condition changes
   * OR whenever a new poll result arrives (dataUpdatedAt changes each fetch).
   *
   * This means:
   *   • "always reappear" alerts are re-added on every successful poll while
   *     the condition remains true — a manual dismiss lasts at most ~3 s.
   *   • the oil alert respects dismissedOilAlert until oilDetected clears.
   */
  useEffect(() => {
    setAlerts(() => {
      const next = []

      // LOW BATTERY — critical, always reappears
      if (lowBatteryWarning) {
        next.push({
          id:      ALERT_LOW_BATTERY,
          type:    'danger',
          message: 'LOW BATTERY — Device returning to home position',
        })
      }

      // OIL DETECTED — stays dismissed until condition changes
      if (oilDetected && !dismissedOilAlert) {
        next.push({
          id:      ALERT_OIL_DETECTED,
          type:    'warning',
          message: 'OIL DETECTED — Capacitive sensor detected oil presence',
        })
      }

      // DEVICE OFFLINE — critical, always reappears
      if (!isDeviceOnline) {
        next.push({
          id:      ALERT_OFFLINE,
          type:    'info',
          message: 'DEVICE OFFLINE — No status updates received from device',
        })
      }

      return next
    })
  }, [
    // Re-run on every new poll result so "always reappear" alerts come back
    dataUpdatedAt,
    queryError,
    // Re-run when any individual condition flips
    lowBatteryWarning,
    oilDetected,
    isDeviceOnline,
    dismissedOilAlert,
  ])

  /**
   * dismissAlert — remove an alert by its id.
   * For the oil-detected alert, also sets the dismissed flag so it isn't
   * immediately re-added by the next poll.
   */
  const dismissAlert = useCallback((id) => {
    if (id === ALERT_OIL_DETECTED) {
      setDismissedOilAlert(true)
    }
    setAlerts(prev => prev.filter(alert => alert.id !== id))
  }, [])

  // ── Context value ─────────────────────────────────────────────────────────
  const value = {
    // Theme
    theme,
    toggleTheme,

    // Device status (raw payload from GET /status)
    deviceStatus,
    isDeviceOnline,
    currentMode,
    oilDetected,

    // Battery
    batteryLevel,
    batteryVoltage,
    solarCharging,
    lowBatteryWarning,

    // Alerts
    alerts,
    dismissAlert,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// useApp hook
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Consume the AppContext from any component inside AppProvider.
 * Throws a clear error if called outside the provider tree.
 */
export function useApp() {
  const ctx = useContext(AppContext)
  if (ctx === null) {
    throw new Error(
      'useApp() must be used inside an <AppProvider>. ' +
      'Make sure your component tree is wrapped with <AppProvider>.'
    )
  }
  return ctx
}

import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getBattery,
  getBatteryHistory,
  getFilterStatus,
  setFilterStatus as apiSetFilterStatus
} from '../api/endpoints'
import {
  Battery,
  Sun,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  BarChart2
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts'

export default function BatteryPage() {
  const { lowBatteryWarning } = useApp()

  // Local state
  const [batteryData, setBatteryData] = useState(null)
  const [batteryHistory, setBatteryHistory] = useState([])
  const [filterStatus, setFilterStatus] = useState(null)
  const [isUpdatingFilter, setIsUpdatingFilter] = useState(false)
  const [filterSuccess, setFilterSuccess] = useState(false)

  // Fetch all data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [battery, history, filter] = await Promise.all([
          getBattery(),
          getBatteryHistory(50),
          getFilterStatus()
        ])
        setBatteryData(battery)
        setBatteryHistory(history?.history ?? [])
        setFilterStatus(filter)
      } catch (err) {
        console.warn('[Battery] Fetch failed:', err.message)
      }
    }
    fetchData()
  }, [])

  // Poll battery every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const battery = await getBattery()
        setBatteryData(battery)
      } catch (err) {
        console.warn('[Battery] Poll failed:', err.message)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Battery level color helpers
  const getBatteryTextColor = (level) => {
    if (level == null) return 'text-gray-400'
    if (level > 50) return 'text-green-400'
    if (level >= 20) return 'text-yellow-400'
    return 'text-red-400 animate-pulse'
  }

  const getBatteryBarColor = (level) => {
    if (level == null) return 'bg-gray-500'
    if (level > 50) return 'bg-green-400'
    if (level >= 20) return 'bg-yellow-400'
    return 'bg-red-400'
  }

  // Format battery history for Recharts
  const chartData = batteryHistory.map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    }),
    level: item.battery_level,
    voltage: item.battery_voltage,
    solar: item.solar_charging ? 1 : 0
  }))

  // Power rails from batteryData
  const rails = batteryData?.power_rails ?? {}

  // Rail indicator helper
  const RailIndicator = ({ label, active }) => (
    <div className="flex justify-between items-center text-xs mt-1">
      <span className="text-gray-400">{label}</span>
      <span className="flex items-center gap-1">
        <span
          className={`w-2 h-2 rounded-full inline-block ${
            active ? 'bg-green-400' : 'bg-red-400'
          }`}
        />
        <span className={active ? 'text-green-400' : 'text-red-400'}>
          {active ? 'OK' : 'OFF'}
        </span>
      </span>
    </div>
  )

  // Shared card class
  const cardClass =
    'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5'

  const level = batteryData?.battery_level ?? null
  const voltage = batteryData?.battery_voltage ?? null
  const charging = batteryData?.solar_charging ?? false

  return (
    <div className="p-6 flex flex-col gap-6">

      {/* ── Row 1 — Four stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">

        {/* Card 1 — Battery Level */}
        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <span className="text-sm text-gray-400">Battery Level</span>
            <Battery className="w-5 h-5 text-gray-400 shrink-0" />
          </div>
          <p className={`text-3xl font-bold mt-2 ${getBatteryTextColor(level)}`}>
            {level != null ? level + '%' : '--'}
          </p>
          <div className="w-full h-2 rounded-full bg-gray-700 mt-3">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getBatteryBarColor(level)}`}
              style={{ width: level != null ? level + '%' : '0%' }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {voltage != null ? voltage.toFixed(2) + 'V' : '--'}
          </p>
        </div>

        {/* Card 2 — Solar Status */}
        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <span className="text-sm text-gray-400">Solar Panel</span>
            <Sun
              className={`w-5 h-5 shrink-0 ${
                charging ? 'text-yellow-400' : 'text-gray-500'
              }`}
            />
          </div>
          <p
            className={`text-2xl font-bold mt-2 flex items-center gap-1 ${
              charging ? 'text-yellow-400' : 'text-gray-400'
            }`}
          >
            {charging ? 'Charging' : 'Inactive'}
            {charging && (
              <Zap className="w-4 h-4 text-yellow-400 animate-bounce" />
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Source:{' '}
            {batteryData?.power_source
              ? batteryData.power_source
              : '--'}
          </p>
        </div>

        {/* Card 3 — Estimated Runtime */}
        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <span className="text-sm text-gray-400">Est. Runtime</span>
            <Clock className="w-5 h-5 text-gray-400 shrink-0" />
          </div>
          <p className="text-2xl font-bold mt-2 text-blue-400">
            {batteryData?.estimated_runtime ?? '--'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Based on current consumption
          </p>
          {(lowBatteryWarning || batteryData?.low_battery_warning) && (
            <p className="text-xs text-red-400 mt-1">
              ⚠ Return to base soon
            </p>
          )}
        </div>

        {/* Card 4 — Power Rails */}
        <div className={cardClass}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm text-gray-400">Power Rails</span>
            <Zap className="w-5 h-5 text-gray-400 shrink-0" />
          </div>
          <RailIndicator label="12V Motors" active={rails.motors_12v} />
          <RailIndicator label="5V Logic" active={rails.logic_5v} />
          <RailIndicator label="3.3V Sensors" active={rails.sensors_3v3} />
          <RailIndicator label="Servo Rail" active={rails.servos_rail} />
        </div>
      </div>

      {/* ── Row 2 — Battery History Chart ───────────────────────────────────── */}
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Battery History
          </span>
          <span className="text-xs text-gray-500">
            Last {batteryHistory.length} readings
          </span>
        </div>

        {chartData.length === 0 ? (
          // Empty state
          <div className="py-8 text-center">
            <BarChart2 className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No battery history yet</p>
            <p className="text-xs text-gray-500 mt-1">
              History builds up as device sends status updates
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={false}
                tickFormatter={(v) => v + '%'}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f9fafb'
                }}
                formatter={(value) => [value + '%', 'Battery']}
              />
              <ReferenceLine
                y={20}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: 'Low Battery', fill: '#ef4444', fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="level"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Row 3 — Filter Status Card ──────────────────────────────────────── */}
      <div className={cardClass}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Oil Filter Status
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-start">

          {/* Left — current status */}
          <div className="flex-1">
            {filterStatus == null ? (
              <p className="text-gray-400 text-lg font-bold">--</p>
            ) : filterStatus.status === 'clean' ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                  <p className="text-lg font-bold text-green-400">
                    Filter is Clean
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Ready for operation
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                  <p className="text-lg font-bold text-red-400">
                    Filter Needs Replacement
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Replace human hair filter before operation
                </p>
              </>
            )}

            {filterStatus?.last_updated && (
              <p className="text-xs text-gray-500 mt-2">
                Last changed:{' '}
                {new Date(filterStatus.last_updated).toLocaleString()}
              </p>
            )}
          </div>

          {/* Right — control buttons */}
          <div className="w-full sm:w-48 shrink-0">
            <button
              onClick={async () => {
                try {
                  setIsUpdatingFilter(true)
                  await apiSetFilterStatus('clean')
                  const updated = await getFilterStatus()
                  setFilterStatus(updated)
                  setFilterSuccess(true)
                  setTimeout(() => setFilterSuccess(false), 3000)
                } catch (err) {
                  console.warn('[Battery] Filter update failed:', err.message)
                } finally {
                  setIsUpdatingFilter(false)
                }
              }}
              disabled={
                isUpdatingFilter || filterStatus?.status === 'clean'
              }
              className={`w-full mb-2 flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors ${
                isUpdatingFilter || filterStatus?.status === 'clean'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              Mark as Clean
            </button>

            <button
              onClick={async () => {
                try {
                  setIsUpdatingFilter(true)
                  await apiSetFilterStatus('needs_replacement')
                  const updated = await getFilterStatus()
                  setFilterStatus(updated)
                } catch (err) {
                  console.warn('[Battery] Filter update failed:', err.message)
                } finally {
                  setIsUpdatingFilter(false)
                }
              }}
              disabled={
                isUpdatingFilter ||
                filterStatus?.status === 'needs_replacement'
              }
              className={`w-full flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors ${
                isUpdatingFilter ||
                filterStatus?.status === 'needs_replacement'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Needs Replacement
            </button>

            {filterSuccess && (
              <p className="text-xs text-green-400 mt-2">
                ✓ Filter status updated
              </p>
            )}
          </div>
        </div>

        {/* Info note */}
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-500">
            The oil filter uses human hair material which captures oil particles
            from water. Replace when flow rate decreases or after every 2 hours
            of active cleaning.
          </p>
        </div>
      </div>

    </div>
  )
}

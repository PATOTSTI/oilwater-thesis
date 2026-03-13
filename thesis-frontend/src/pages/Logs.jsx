import { useState, useEffect } from 'react'
import { getLogs, deleteLogs } from '../api/endpoints'
import {
  RefreshCw,
  Trash2,
  Search,
  FileText,
  Loader2,
  BarChart2,
  AlertTriangle,
  XCircle,
  CheckCircle
} from 'lucide-react'

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isClearing, setIsClearing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLevel, setSelectedLevel] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch logs from backend
  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const result = await getLogs()
      const logList = result?.logs ?? []
      setLogs(logList)
      setFilteredLogs(logList)
    } catch (err) {
      console.warn('[Logs] Fetch failed:', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch on mount
  useEffect(() => {
    fetchLogs()
  }, [])

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  // Apply combined filters whenever logs or filter state changes
  useEffect(() => {
    let filtered = [...logs]

    if (selectedLevel !== 'all') {
      filtered = filtered.filter((log) => log.event_type === selectedLevel)
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((log) => log.category === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.category.toLowerCase().includes(query)
      )
    }

    setFilteredLogs(filtered)
  }, [logs, selectedLevel, selectedCategory, searchQuery])

  // Clear all logs
  const handleClearLogs = async () => {
    try {
      setIsClearing(true)
      await deleteLogs()
      setLogs([])
      setFilteredLogs([])
    } catch (err) {
      console.warn('[Logs] Clear failed:', err.message)
    } finally {
      setIsClearing(false)
    }
  }

  // Derive unique categories from loaded logs
  const categories = ['all', ...new Set(logs.map((log) => log.category))]

  // Helper: dot color for a log level
  const levelDotColor = (level) => {
    switch (level) {
      case 'info':    return 'bg-blue-400'
      case 'warning': return 'bg-yellow-400'
      case 'error':   return 'bg-red-400'
      case 'success': return 'bg-green-400'
      default:        return 'bg-gray-400'
    }
  }

  // Helper: badge style for a log level
  const levelBadgeClass = (level) => {
    switch (level) {
      case 'info':    return 'bg-blue-500/20 text-blue-400'
      case 'warning': return 'bg-yellow-500/20 text-yellow-400'
      case 'error':   return 'bg-red-500/20 text-red-400'
      case 'success': return 'bg-green-500/20 text-green-400'
      default:        return 'bg-gray-500/20 text-gray-400'
    }
  }

  // Helper: active level filter button style
  const levelButtonActive = (level) => {
    switch (level) {
      case 'info':    return 'bg-blue-600 text-white'
      case 'warning': return 'bg-yellow-600 text-white'
      case 'error':   return 'bg-red-600 text-white'
      case 'success': return 'bg-green-600 text-white'
      default:        return 'bg-gray-600 text-white'
    }
  }

  const cardClass =
    'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg'

  const isFiltered =
    searchQuery.trim() ||
    selectedLevel !== 'all' ||
    selectedCategory !== 'all'

  return (
    <div className="p-6 flex flex-col gap-4">

      {/* ── Row 1 — Header + Controls ───────────────────────────────────────── */}
      <div className={`${cardClass} p-5`}>
        <div className="flex justify-between items-center flex-wrap gap-3">

          {/* Left — title */}
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              System Logs
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {filteredLogs.length} entries
            </p>
          </div>

          {/* Right — controls */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Auto-refresh toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Auto refresh</span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  autoRefresh ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                    autoRefresh ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Refresh button */}
            <button
              onClick={fetchLogs}
              className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>

            {/* Clear logs button */}
            <button
              onClick={handleClearLogs}
              disabled={isClearing}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                isClearing
                  ? 'bg-red-600/10 text-red-400 opacity-60 cursor-not-allowed'
                  : 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isClearing ? 'Clearing...' : 'Clear Logs'}
            </button>

          </div>
        </div>
      </div>

      {/* ── Row 2 — Filter Bar ──────────────────────────────────────────────── */}
      <div className={`${cardClass} p-5`}>
        <div className="flex flex-wrap gap-3 items-center">

          {/* Search input */}
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Level filter buttons */}
          <div className="flex gap-1 flex-wrap">
            {['all', 'info', 'warning', 'error', 'success'].map((level) => (
              <button
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium capitalize ${
                  selectedLevel === level
                    ? levelButtonActive(level)
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>

        </div>
      </div>

      {/* ── Row 3 — Logs List ───────────────────────────────────────────────── */}
      <div className={`${cardClass} px-0`}>

        {/* List header */}
        <div className="px-5 py-3 border-b border-gray-700/50 flex justify-between items-center">
          <span className="text-xs font-medium text-gray-400">Log Entries</span>
          {autoRefresh && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          )}
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-2" />
            <p className="text-sm text-gray-400">Loading logs...</p>
          </div>

        ) : filteredLogs.length === 0 ? (
          // Empty state
          <div className="py-12 flex flex-col items-center">
            <FileText className="w-10 h-10 text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-400">No logs found</p>
            <p className="text-xs text-gray-500 mt-1">
              {isFiltered
                ? 'Try adjusting your search or filters'
                : 'Logs will appear as the system operates'}
            </p>
          </div>

        ) : (
          // Log entries
          <div className="max-h-96 overflow-y-auto">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 border-b border-gray-700/30 last:border-0 hover:bg-gray-700/20 transition-colors flex items-start gap-3"
              >
                {/* Level dot */}
                <span
                  className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${levelDotColor(log.event_type)}`}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${levelBadgeClass(log.event_type)}`}
                    >
                      {log.event_type?.toUpperCase()}
                    </span>
                    <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded">
                      {log.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200 dark:text-gray-200 text-gray-800 mt-0.5 break-words">
                    {log.message}
                  </p>
                </div>

                {/* Timestamp */}
                <span className="flex-shrink-0 text-xs text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Row 4 — Log Summary Stats ───────────────────────────────────────── */}
      <div className={`${cardClass} p-5`}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Log Summary
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Info */}
          <div className="bg-gray-700/50 rounded-xl p-3 text-center">
            <BarChart2 className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-400">
              {logs.filter((l) => l.event_type === 'info').length}
            </p>
            <p className="text-xs text-gray-400">Info</p>
          </div>

          {/* Warnings */}
          <div className="bg-gray-700/50 rounded-xl p-3 text-center">
            <AlertTriangle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-yellow-400">
              {logs.filter((l) => l.event_type === 'warning').length}
            </p>
            <p className="text-xs text-gray-400">Warnings</p>
          </div>

          {/* Errors */}
          <div className="bg-gray-700/50 rounded-xl p-3 text-center">
            <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-400">
              {logs.filter((l) => l.event_type === 'error').length}
            </p>
            <p className="text-xs text-gray-400">Errors</p>
          </div>

          {/* Success */}
          <div className="bg-gray-700/50 rounded-xl p-3 text-center">
            <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-400">
              {logs.filter((l) => l.event_type === 'success').length}
            </p>
            <p className="text-xs text-gray-400">Success</p>
          </div>
        </div>
      </div>

    </div>
  )
}

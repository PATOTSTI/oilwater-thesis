/**
 * useDeviceStatus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls GET /status every 3 seconds and exposes the result via React Query.
 *
 * Two exports:
 *   useDeviceStatus()  – raw query result (data = unwrapped payload)
 *   useStatusData()    – convenience wrapper that names the payload `status`
 */

import { useQuery } from '@tanstack/react-query'
import { getStatus } from '../api/endpoints'

// ── Raw query hook ─────────────────────────────────────────────────────────────
// queryFn delegates entirely to getStatus, which:
//   1. Calls apiClient.get('/status') → interceptor strips Axios envelope → returns backend envelope
//   2. unwrap() checks envelope.success and returns envelope.data (the actual payload)

export function useDeviceStatus() {
  return useQuery({
    queryKey: ['deviceStatus'],
    queryFn: getStatus,
    refetchInterval: 3000,
    retry: 1,
    throwOnError: false,
  })
}

// ── Convenience wrapper ────────────────────────────────────────────────────────

/**
 * Returns { status, isLoading, error, refetch } where
 * `status` is the actual device status payload (or null).
 */
export function useStatusData() {
  const { data, ...rest } = useDeviceStatus()
  const status = data ?? null
  console.log('[useStatusData] final status:', status)
  return {
    status,
    ...rest
  }
}

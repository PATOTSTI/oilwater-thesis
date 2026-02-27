/**
 * useBattery.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls GET /battery every 5 seconds.
 *
 * Two exports:
 *   useBattery()      – raw query result (data = unwrapped payload)
 *   useBatteryData()  – convenience wrapper that names the payload `battery`
 */

import { useQuery } from '@tanstack/react-query'
import { getBattery } from '../api/endpoints'

// ── Raw query hook ─────────────────────────────────────────────────────────────

export function useBattery() {
  return useQuery({
    queryKey: ['battery'],
    queryFn: getBattery,
    refetchInterval: 5000,  // poll every 5 s
    retry: 1,
    throwOnError: false,    // surface errors via state, never crash the app
  })
}

// ── Convenience wrapper ────────────────────────────────────────────────────────

/**
 * Returns { battery, isLoading, error, refetch } where
 * `battery` is the actual battery payload (or null).
 */
export function useBatteryData() {
  const { data, ...rest } = useBattery()
  return {
    battery: data ?? null,  
    ...rest
  }
}

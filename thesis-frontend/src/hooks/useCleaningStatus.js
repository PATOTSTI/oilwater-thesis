/**
 * useCleaningStatus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls GET /cleaning/status every 2 seconds, but ONLY when the device is
 * actively in "cleaning" mode.  The query is fully disabled (no requests,
 * no background refetches) in any other mode.
 *
 * Exports:
 *   useCleaningStatus()  – raw query result
 */

import { useQuery } from '@tanstack/react-query'
import { getCleaningStatus } from '../api/endpoints'
import { useApp } from '../context/AppContext'

export function useCleaningStatus() {
  const { currentMode } = useApp()
  const isCleaningActive = currentMode === 'cleaning'

  return useQuery({
    queryKey: ['cleaningStatus'],
    queryFn: getCleaningStatus,
    // Poll only while cleaning is active; stop entirely otherwise.
    refetchInterval: isCleaningActive ? 2000 : false,
    enabled: isCleaningActive,
    retry: 1,
    throwOnError: false,
  })
}

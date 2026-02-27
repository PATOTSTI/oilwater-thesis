/**
 * useMode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Switches the device operating mode (standby / autonomous / manual / cleaning).
 * Invalidates ['deviceStatus'] on success so AppContext and other consumers
 * immediately see the updated mode.
 *
 * Exports:
 *   useMode()  – returns { changeMode, isLoading, error }
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setMode } from '../api/endpoints'

export function useMode() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (mode) => setMode(mode),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviceStatus'] })
    },

    onError: (err) =>
      console.error('[useMode] Failed:', err.message),
  })

  return {
    /** @param {string} mode - 'standby' | 'autonomous' | 'manual' | 'cleaning' */
    changeMode: (mode) => mutation.mutate(mode),
    isLoading: mutation.isPending,   // React Query v5: isPending (not isLoading)
    error: mutation.error,
  }
}

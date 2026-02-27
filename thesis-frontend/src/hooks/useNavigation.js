/**
 * useNavigation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends navigation targets (GPS coordinates or "return home") to the device.
 * Invalidates ['deviceStatus'] on success so the map and status bar update.
 *
 * Exports:
 *   useNavigation()  – returns { navigateToLocation, navigateHome, isLoading, error, isSuccess }
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { navigateTo } from '../api/endpoints'

export function useNavigation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data) => navigateTo(data),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviceStatus'] })
    },

    onError: (err) =>
      console.error('[useNavigation] Failed:', err.message),
  })

  /**
   * Navigate the boat to a specific GPS coordinate.
   * @param {number}      lat         - target latitude
   * @param {number}      lng         - target longitude
   * @param {string}      source      - how the target was chosen (default 'manual_input')
   * @param {string|null} detectionId - link to a detection record if applicable
   */
  const navigateToLocation = (
    lat,
    lng,
    source = 'manual_input',
    detectionId = null
  ) =>
    mutation.mutate({
      target_lat: lat,
      target_lng: lng,
      source,
      ...(detectionId && { detection_id: detectionId }),
      home: false,
    })

  /** Command the boat to return to its saved home / dock position. */
  const navigateHome = () =>
    mutation.mutate({
      home: true,
      source: 'manual_input',
      target_lat: 0,
      target_lng: 0,
    })

  return {
    navigateToLocation,
    navigateHome,
    isLoading: mutation.isPending,   // React Query v5: isPending (not isLoading)
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  }
}

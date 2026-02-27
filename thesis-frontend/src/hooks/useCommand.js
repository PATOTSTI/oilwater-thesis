/**
 * useCommand.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends movement / action commands to the device.
 * Invalidates the ['deviceStatus'] query on success so the status bar and
 * other polling consumers refresh immediately.
 *
 * Exports:
 *   useCommand()  – returns { sendCommand, emergencyStop, isLoading, error, isSuccess }
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setCommand } from '../api/endpoints'

export function useCommand() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ command, speed, angle }) =>
      setCommand(command, speed, angle),

    onSuccess: () => {
      // Refresh device status so UI reflects the new command immediately.
      queryClient.invalidateQueries({ queryKey: ['deviceStatus'] })
    },

    onError: (err) =>
      console.error('[useCommand] Failed:', err.message),
  })

  /**
   * Send a named command to the device.
   * @param {string}      command - command identifier (e.g. 'forward', 'stop')
   * @param {number}      speed   - PWM speed (default 200)
   * @param {number|null} angle   - steering angle; omit with null (default)
   */
  const sendCommand = (command, speed = 200, angle = null) =>
    mutation.mutate({ command, speed, angle })

  /** Immediately halt all motors — bypasses normal speed/angle logic. */
  const emergencyStop = () =>
    mutation.mutate({ command: 'emergency_stop', speed: 0, angle: null })

  return {
    sendCommand,
    emergencyStop,
    isLoading: mutation.isPending,   // React Query v5: isPending (not isLoading)
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  }
}

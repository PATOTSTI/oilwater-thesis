/**
 * endpoints.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All API endpoint functions for the AquaDetect dashboard.
 *
 * Each function:
 *   1. Calls apiClient — which returns the backend envelope
 *      { success, data, message, timestamp } directly (via interceptor).
 *   2. Throws an Error if `success` is false, using the backend's message.
 *   3. Returns `envelope.data` — the actual payload — so callers never need
 *      to unwrap the envelope themselves.
 *
 * No hardcoded URLs here — the base URL lives exclusively in apiClient.js.
 */

import apiClient from './apiClient'

// ── Helper ────────────────────────────────────────────────────────────────────
// Shared unwrap logic so each endpoint stays one-liner-readable.
function unwrap(envelope) {
  if (!envelope.success) {
    throw new Error(envelope.message || 'Request failed')
  }
  return envelope.data
}

// ─── COMMANDS ─────────────────────────────────────────────────────────────────

/** Retrieve the currently active command on the device. */
export const getCommand = async () =>
  unwrap(await apiClient.get('/command'))

/**
 * Send a movement / action command to the device.
 * @param {string} command  - e.g. 'forward' | 'stop' | 'emergency_stop'
 * @param {number} speed    - PWM speed value (default 200)
 * @param {number|null} angle - steering angle, omitted when null
 */
export const setCommand = async (command, speed = 200, angle = null) =>
  unwrap(
    await apiClient.post('/command', {
      command,
      speed,
      ...(angle !== null && { angle }),
    })
  )

// ─── MODE ─────────────────────────────────────────────────────────────────────

/**
 * Switch the device operating mode.
 * @param {string} mode - e.g. 'standby' | 'autonomous' | 'manual' | 'cleaning'
 */
export const setMode = async (mode) =>
  unwrap(await apiClient.post('/mode', { mode }))

// ─── NAVIGATE ─────────────────────────────────────────────────────────────────

/**
 * Send a navigation target to the device.
 * @param {object} data - e.g. { target_lat, target_lng, source, home }
 */
export const navigateTo = async (data) =>
  unwrap(await apiClient.post('/navigate', data))

// ─── STATUS ───────────────────────────────────────────────────────────────────

/** Retrieve the latest device status snapshot. */
export const getStatus = async () => {
  const envelope = await apiClient.get('/status')
  console.log('[getStatus] raw envelope from apiClient:', envelope)
  const payload = unwrap(envelope)
  console.log('[getStatus] unwrapped payload:', payload)
  return payload
}

/**
 * Retrieve recent status snapshots.
 * @param {number} limit - maximum records to return (default 20)
 */
export const getStatusHistory = async (limit = 20) =>
  unwrap(await apiClient.get('/status/history', { params: { limit } }))

// ─── DETECTION ────────────────────────────────────────────────────────────────

/**
 * Submit an image for oil detection via the YOLOv8 model.
 * The Content-Type header is overridden to multipart/form-data so Axios
 * constructs the correct boundary; do NOT set it to application/json here.
 * @param {FormData} formData - must contain the image file field
 */
export const detectOil = async (formData) =>
  unwrap(
    await apiClient.post('/detect', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  )

/**
 * Retrieve past detection results.
 * @param {object} params - optional query params (e.g. { limit, offset })
 */
export const getDetections = async (params = {}) =>
  unwrap(await apiClient.get('/detections', { params }))

// ─── CLEANING ─────────────────────────────────────────────────────────────────

/**
 * Start an oil-cleaning operation.
 * @param {object} data - e.g. { target_lat, target_lng, detection_id }
 */
export const startCleaning = async (data) =>
  unwrap(await apiClient.post('/cleaning/start', data))

/** Stop the current cleaning operation. */
export const stopCleaning = async () =>
  unwrap(await apiClient.post('/cleaning/stop'))

/** Retrieve the current cleaning operation status. */
export const getCleaningStatus = async () =>
  unwrap(await apiClient.get('/cleaning/status'))

// ─── BATTERY ──────────────────────────────────────────────────────────────────

/** Retrieve the latest battery / solar snapshot. */
export const getBattery = async () =>
  unwrap(await apiClient.get('/battery'))

/**
 * Retrieve battery history for trend charts.
 * @param {number} limit - maximum records to return (default 50)
 */
export const getBatteryHistory = async (limit = 50) =>
  unwrap(await apiClient.get('/battery/history', { params: { limit } }))

// ─── HOME ─────────────────────────────────────────────────────────────────────

/** Save the current GPS position as the home / dock location. */
export const setHome = async () =>
  unwrap(await apiClient.post('/home/set'))

/** Retrieve the stored home / dock location. */
export const getHome = async () =>
  unwrap(await apiClient.get('/home'))

// ─── FILTER ───────────────────────────────────────────────────────────────────

/**
 * Update the oil-collection filter status.
 * @param {string} status - e.g. 'active' | 'idle' | 'full'
 */
export const setFilterStatus = async (status) =>
  unwrap(await apiClient.post('/filter/status', { status }))

/** Retrieve the current filter status. */
export const getFilterStatus = async () =>
  unwrap(await apiClient.get('/filter/status'))

// ─── LOGS ─────────────────────────────────────────────────────────────────────

/**
 * Retrieve system logs.
 * @param {object} params - optional query params (e.g. { limit, level })
 */
export const getLogs = async (params = {}) =>
  unwrap(await apiClient.get('/logs', { params }))

/**
 * Permanently clear all stored logs.
 * Requires the `confirm: true` body so the backend treats it as intentional.
 */
export const deleteLogs = () => apiClient.delete('/logs', { 
    data: { confirm: true } 
  }).then(unwrap)

// ─── HEALTH ───────────────────────────────────────────────────────────────────

/** Simple liveness check — returns quickly even when device is offline. */
export const getHealth = async () =>
  unwrap(await apiClient.get('/health'))

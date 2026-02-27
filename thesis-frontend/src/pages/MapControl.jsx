import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { useApp } from '../context/AppContext'

// ── Auto-center: flies to device position once when device comes online ────────
function MapAutoCenter({ deviceGps, isOnline }) {
  const map = useMap()
  useEffect(() => {
    const lat = deviceGps?.lat
    const lng = deviceGps?.lng
    if (isOnline && lat && lat !== 0.0 && lng && lng !== 0.0) {
      map.flyTo([lat, lng], 16)
    }
  }, [isOnline]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function MapControl() {
  const { deviceStatus, isDeviceOnline } = useApp()

  // Read GPS fields directly from the full payload object
  const deviceGps = deviceStatus?.device_gps ?? null
  const homeGps   = deviceStatus?.home_gps   ?? null
  const targetGps = deviceStatus?.target_gps ?? null
  const heading   = deviceStatus?.heading    ?? 0

  // Debug — remove once confirmed working
  console.log('[MapControl] deviceStatus:', deviceStatus)
  console.log('[MapControl] deviceGps:', deviceGps)

  // Helper: null/undefined first, then reject the backend default 0.0
  const hasCoords = (gps) =>
    gps != null &&
    gps.lat != null && gps.lng != null &&
    gps.lat !== 0.0 && gps.lng !== 0.0

  return (
    <div className="flex flex-col p-6">

      {/* ── Map Card ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">

        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Live Device Location
          </p>

          {/* Connection status pill */}
          {isDeviceOnline ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-medium text-green-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-500/20 px-3 py-1 text-xs font-medium text-gray-400">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Offline
            </span>
          )}
        </div>

        {/* Leaflet map */}
        <div className="h-[calc(100vh-220px)] min-h-96 overflow-hidden rounded-lg">
          <MapContainer
            center={[14.5995, 120.9842]}
            zoom={16}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* Auto-center on device coming online */}
            <MapAutoCenter deviceGps={deviceGps} isOnline={isDeviceOnline} />

            {/* ── Device position marker (blue) ─────────────────────────────── */}
            {hasCoords(deviceGps) && (
              <CircleMarker
                center={[deviceGps.lat, deviceGps.lng]}
                radius={10}
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>
                  <strong>Device Position</strong><br />
                  Lat: {deviceGps.lat.toFixed(4)}<br />
                  Lng: {deviceGps.lng.toFixed(4)}<br />
                  Heading: {heading}°
                </Popup>
              </CircleMarker>
            )}

            {/* ── Home point marker (green) ─────────────────────────────────── */}
            {hasCoords(homeGps) && (
              <CircleMarker
                center={[homeGps.lat, homeGps.lng]}
                radius={8}
                pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>Home Point</Popup>
              </CircleMarker>
            )}

            {/* ── Navigation target marker (red) ───────────────────────────── */}
            {hasCoords(targetGps) && (
              <CircleMarker
                center={[targetGps.lat, targetGps.lng]}
                radius={8}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>Navigation Target</Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        {/* Map legend */}
        <div className="mt-3 flex gap-4">
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-blue-500" />Device
          </span>
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-green-500" />Home
          </span>
          <span className="text-xs text-gray-400">
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-red-500" />Target
          </span>
        </div>
      </div>

    </div>
  )
}

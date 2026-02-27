import axios from 'axios'

// ── Axios instance ─────────────────────────────────────────────────────────────
// Single source-of-truth for all HTTP communication with the FastAPI backend.
// All callers receive the backend's response envelope { success, data, message,
// timestamp } directly — no need to unwrap `.data` after every call.
const apiClient = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 s — fail fast rather than hanging indefinitely
})

// ── Response interceptor ───────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  // SUCCESS — unwrap the Axios wrapper and hand callers the envelope directly.
  (response) => response.data,

  // ERROR — normalise into a plain Error so every call site gets a consistent
  // `.message` string regardless of whether the backend responded or not.
  (error) => {
    const timestamp = new Date().toISOString()

    if (error.response) {
      // Backend replied with a non-2xx status.
      const message =
        error.response.data?.message ||
        `Request failed with status ${error.response.status}`
      console.error(`[apiClient ${timestamp}] Server error:`, message)
      throw new Error(message)
    } else {
      // No response — backend is down or the request timed out.
      const message = 'Backend is offline. Check your connection.'
      console.error(`[apiClient ${timestamp}] Network error:`, message)
      throw new Error(message)
    }
  }
)

export default apiClient
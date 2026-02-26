# core/logger.py
# ---------------------------------------------------------------------------
# Centralised activity logger for the oil-water separation system.
#
# Usage (from any route file):
#   from core.logger import log_event
#
#   log_event("command", "New movement command issued", {"command": "forward"})
#
# Event types:
#   "command"    → movement or pump command issued to ESP32
#   "mode_change"→ operating mode switched
#   "detection"  → YOLOv8 inference result
#   "navigation" → navigation target set or reached
#   "cleaning"   → cleaning pattern started, progressed, or stopped
#   "status"     → notable device status update (warnings only, not every poll)
#   "warning"    → automated system warning (low battery, connection loss, etc.)
#   "error"      → unexpected or failed operation
# ---------------------------------------------------------------------------

from datetime import datetime, timezone
from typing import Optional


# Valid event types — used for documentation; not enforced at runtime
# so new types can be added without changing this file.
EVENT_TYPES = {
    "command", "mode_change", "detection",
    "navigation", "cleaning", "status", "warning", "error",
}


def log_event(
    event_type: str,
    message: str,
    data: Optional[dict] = None,
) -> None:
    """Append one structured entry to the in-memory event log.

    Automatically trims the log when it exceeds MAX_LOGS entries so memory
    usage stays bounded over long demo runs.

    Args:
        event_type: Category string (see EVENT_TYPES above).
        message:    Human-readable description shown in the dashboard log view.
        data:       Optional dict with extra context (IDs, values, GPS, etc.).
                    Keep keys short — this goes straight into the JSON response.
    """
    # Import here to avoid a circular import at module load time
    from core.state import app_state, MAX_LOGS

    entry = {
        "timestamp": datetime.now(timezone.utc),
        "event_type": event_type,
        "message": message,
        "data": data or {},
    }

    app_state["event_log"].append(entry)

    # Trim oldest entries when the cap is exceeded
    if len(app_state["event_log"]) > MAX_LOGS:
        app_state["event_log"] = app_state["event_log"][-MAX_LOGS:]

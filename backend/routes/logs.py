# routes/logs.py
# ---------------------------------------------------------------------------
# Endpoints for the chronological activity log.
#
# The activity log is a structured, timestamped list of notable events that
# happen inside the backend. It is written by core/logger.py (log_event())
# which is called by every route that performs a significant action.
#
# The log is stored in app_state["event_log"] (in-memory, capped at MAX_LOGS).
# It is designed for:
#   - Live monitoring on the frontend dashboard during a demo run
#   - Quick debugging when something unexpected happens
#   - Thesis data collection and presentation
#
# Event types logged across the system:
#   "command"    → movement or pump command issued
#   "mode_change"→ operating mode switched
#   "detection"  → YOLOv8 inference result (detections found or none)
#   "navigation" → navigation started or target reached
#   "cleaning"   → cleaning pattern started, completed, or stopped
#   "status"     → notable device status events (not every ESP32 poll)
#   "warning"    → automated system warnings (low battery, etc.)
#   "error"      → unexpected or failed operations
#
# Routes in this file:
#   GET    /logs → paginated, filterable event log
#   DELETE /logs → clear all logs (requires confirm: true)
# ---------------------------------------------------------------------------

from fastapi import APIRouter, Query, HTTPException

from core.state import app_state
from core.response import make_response
from models.schemas import LogEntry, LogsResponse, ClearLogsRequest, StandardResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /logs
# ---------------------------------------------------------------------------
@router.get(
    "/logs",
    response_model=StandardResponse,
    summary="Returns the chronological activity log with optional filtering",
)
def get_logs(
    limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description=(
            "Maximum number of log entries to return (1–500). "
            "The most recent `limit` entries are returned, newest first. Default 50."
        ),
    ),
    event_type: str = Query(
        default=None,
        description=(
            "Optional filter — only return entries of this event type. "
            "One of: command, mode_change, detection, navigation, cleaning, "
            "status, warning, error."
        ),
    ),
):
    """Return the activity log, most recent entries first.

    The response includes a `total` count of matching entries (after filtering)
    and a `returned` count of how many are in this response (after limiting).

    **Query parameters:**

    | Parameter    | Default | Description |
    |--------------|---------|-------------|
    | `limit`      | 50      | Max entries to return per call |
    | `event_type` | null    | Filter by event category |

    **Example — fetch only warnings:**
    ```
    GET /logs?event_type=warning&limit=10
    ```

    **Called by:** Frontend dashboard (live log panel).
    """
    logs = app_state["event_log"]

    # ---- Apply optional event_type filter ----
    if event_type:
        logs = [e for e in logs if e["event_type"] == event_type]

    total = len(logs)

    # ---- Take the most recent `limit` entries ----
    page = logs[-limit:] if len(logs) > limit else logs

    # Reverse so the newest entry appears first (most useful for a live panel)
    page = list(reversed(page))

    print(
        f"[GET /logs] total={total}, returned={len(page)}, "
        f"filter='{event_type or 'none'}', limit={limit}"
    )

    result = LogsResponse(
        logs=[LogEntry(**e) for e in page],
        total=total,
        returned=len(page),
    )
    return make_response(
        data=result.model_dump(),
        message=f"Returning {len(page)} of {total} log entries.",
    )


# ---------------------------------------------------------------------------
# DELETE /logs
# ---------------------------------------------------------------------------
@router.delete(
    "/logs",
    response_model=StandardResponse,
    summary="Clear the entire activity log (requires confirmation)",
)
def clear_logs(body: ClearLogsRequest):
    """Permanently clear all activity log entries.

    This is a destructive operation — the log cannot be recovered after
    clearing. A confirmation flag is required to prevent accidents.

    **Request body:**
    ```json
    { "confirm": true }
    ```

    Sending `{ "confirm": false }` returns a 400 error with an explanation.

    **Use case:** Call this before starting a new demo run to keep the log
    clean and relevant for the current session.

    **Called by:** Frontend dashboard (operator action before demo).
    """
    # Require explicit confirmation to prevent accidental log deletion
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail=(
                "Log clear aborted. Set 'confirm' to true in the request body to proceed. "
                "Example: { \"confirm\": true }"
            ),
        )

    count = len(app_state["event_log"])
    app_state["event_log"] = []

    print(f"[DELETE /logs] Event log cleared — {count} entries removed.")

    return make_response(
        data={"entries_removed": count},
        message=f"Event log cleared successfully. {count} entries removed.",
    )

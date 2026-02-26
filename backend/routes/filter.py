# routes/filter.py
# ---------------------------------------------------------------------------
# Endpoints for the physical oil-absorption filter status flag.
#
# The physical filter (made from human hair) must be replaced manually by
# the operator. These endpoints are simply a UI flag — they do NOT control
# any hardware. The operator uses the dashboard to mark the filter status,
# which then shows a warning badge when replacement is needed.
#
# Routes in this file:
#   POST /filter/status → operator sets the filter condition
#   GET  /filter/status → frontend reads the current flag and timestamp
# ---------------------------------------------------------------------------

from datetime import datetime, timezone

from fastapi import APIRouter

from core.state import app_state
from core.response import make_response
from models.schemas import FilterStatusRequest, FilterStatusResponse, StandardResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /filter/status
# ---------------------------------------------------------------------------
@router.post(
    "/filter/status",
    response_model=StandardResponse,
    summary="Operator updates the physical filter condition",
)
def set_filter_status(body: FilterStatusRequest):
    """Update the physical filter status flag.

    This is a manual operator action — the API has no way to detect filter
    condition automatically. The operator inspects the filter and sets its
    status via the dashboard.

    **Accepted values for `status`:**
    - `"clean"` — filter is in good condition, no action needed
    - `"needs_replacement"` — filter is saturated, operator should replace it

    The `last_updated` timestamp is set to the current UTC time so the
    frontend can display how long ago the status was last changed.

    **Called by:** Frontend dashboard (operator action).
    """
    updated_at = datetime.now(timezone.utc)
    previous = app_state["filter_status"]

    # Update state
    app_state["filter_status"] = body.status
    app_state["filter_updated_at"] = updated_at

    print(
        f"[POST /filter/status] '{previous}' → '{body.status}' "
        f"at {updated_at.isoformat()}"
    )

    return make_response(
        data=FilterStatusResponse(
            status=body.status,
            needs_replacement=body.status == "needs_replacement",
            last_updated=updated_at,
        ).model_dump(),
        message=(
            "Filter marked as needing replacement. Please replace the filter before the next run."
            if body.status == "needs_replacement"
            else "Filter marked as clean."
        ),
    )


# ---------------------------------------------------------------------------
# GET /filter/status
# ---------------------------------------------------------------------------
@router.get(
    "/filter/status",
    response_model=StandardResponse,
    summary="Returns the current physical filter condition and last-updated timestamp",
)
def get_filter_status():
    """Return the current filter status flag.

    The `needs_replacement` field is a convenience boolean derived directly
    from `status == "needs_replacement"` — it saves the frontend from doing
    the string comparison itself.

    `last_updated` is `null` if the status has never been set via
    POST /filter/status (the default "clean" value has no timestamp).

    **Called by:** Frontend dashboard (warning badge, status panel).
    """
    status = app_state["filter_status"]
    updated_at = app_state["filter_updated_at"]

    print(f"[GET /filter/status] status='{status}', last_updated={updated_at}")

    return make_response(
        data=FilterStatusResponse(
            status=status,
            needs_replacement=status == "needs_replacement",
            last_updated=updated_at,
        ).model_dump(),
        message=f"Filter status is '{status}'.",
    )

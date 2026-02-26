# routes/battery.py
# ---------------------------------------------------------------------------
# Endpoints for monitoring battery and solar power systems.
#
# All data comes from app_state and status_history — no extra storage needed.
# The ESP32 sends battery readings on every POST /status update.
#
# Routes in this file:
#   GET /battery         → latest power snapshot with low-battery warning
#   GET /battery/history → battery level over time (from rolling status history)
# ---------------------------------------------------------------------------

from fastapi import APIRouter, Query

from core.state import app_state
from core.response import make_response
# UPDATED: import PowerRails to build the nested rails object in the response
from models.schemas import BatteryResponse, BatteryHistoryEntry, PowerRails, StandardResponse

router = APIRouter()

# Must match the threshold used in routes/status.py for the auto-return rule
LOW_BATTERY_THRESHOLD = 20

# Assumed full-charge runtime in minutes for the linear estimate.
# Adjust this to match your actual battery capacity.
FULL_CHARGE_RUNTIME_MINUTES = 120


def _format_runtime(minutes: float) -> str:
    """Convert a float number of minutes into a human-readable time estimate.

    Examples:
        _format_runtime(45)  → '~45 minutes'
        _format_runtime(90)  → '~1 hr 30 min'
        _format_runtime(120) → '~2 hours'

    Args:
        minutes: Estimated remaining runtime as a float.

    Returns:
        A string like '~45 minutes' or '~1 hr 30 min'.
    """
    if minutes <= 0:
        return "~0 minutes"
    if minutes < 60:
        return f"~{round(minutes)} minutes"
    hours = int(minutes // 60)
    remaining_min = round(minutes % 60)
    if remaining_min == 0:
        return f"~{hours} hour{'s' if hours > 1 else ''}"
    return f"~{hours} hr {remaining_min} min"


# ---------------------------------------------------------------------------
# GET /battery
# ---------------------------------------------------------------------------
@router.get(
    "/battery",
    response_model=StandardResponse,
    summary="Returns the latest battery and solar power snapshot",
)
def get_battery():
    """Return the current battery level, voltage, solar status, and runtime estimate.

    The `low_battery_warning` field is True when battery level drops below 20%.
    This threshold also triggers the auto-return rule in POST /status.

    The `estimated_runtime` is a simple linear estimate based on the current
    battery percentage and a fixed assumed full-charge runtime. It is only
    included once at least one POST /status update has been received.

    | Field                | Description |
    |----------------------|-------------|
    | `battery_level`      | Battery percentage 0–100 |
    | `battery_voltage`    | Actual voltage reading (e.g. 11.4 V) |
    | `solar_charging`     | True if the solar panel is actively charging |
    | `power_source`       | "solar" or "battery" |
    | `low_battery_warning`| True if battery_level < 20% |
    | `estimated_runtime`  | Human-readable estimate like "~45 minutes" |

    **Called by:** Frontend dashboard (battery widget, status bar).
    """
    # True once at least one POST /status update has been processed.
    # False means every field below is still the boot default — not a real device reading.
    data_initialized = app_state["last_updated"] is not None

    level = app_state["battery_level"]
    voltage = app_state["battery_voltage"]
    solar = app_state["solar_charging"]
    source = app_state["power_source"]
    warning = level < LOW_BATTERY_THRESHOLD

    # Runtime estimate is only meaningful after receiving at least one real reading
    estimated_runtime = None
    if data_initialized:
        runtime_minutes = (level / 100.0) * FULL_CHARGE_RUNTIME_MINUTES
        estimated_runtime = _format_runtime(runtime_minutes)

    # UPDATED: Read current rail status from state.
    # All default to True until ESP32 firmware sends real rail readings via POST /status.
    # TODO (future): When rail sensing is added to ESP32, these will reflect actual values.
    rails = app_state["power_rails"]

    print(
        f"[GET /battery] data_initialized={data_initialized} | "
        f"level={level}%, voltage={voltage}V, "
        f"solar={solar}, source={source}, warning={warning}, "
        f"runtime={estimated_runtime}, "
        f"rails=12V:{rails['motors_12v']} 5V:{rails['logic_5v']} "
        f"3.3V:{rails['sensors_3v3']} servo:{rails['servos_rail']}"
    )

    if not data_initialized:
        msg = (
            "No POST /status received yet — values are boot defaults, not live device readings. "
            "Call POST /status from the ESP32 to populate real battery data."
        )
    elif warning:
        msg = f"Battery at {level}%. LOW BATTERY WARNING — device will auto-return below 20%."
    else:
        msg = f"Battery at {level}%."

    return make_response(
        data=BatteryResponse(
            battery_level=level,
            battery_voltage=voltage,
            solar_charging=solar,
            power_source=source,
            low_battery_warning=warning,
            estimated_runtime=estimated_runtime,
            # UPDATED: pass the PowerRails object built from state
            power_rails=PowerRails(**rails),
            data_initialized=data_initialized,
        ).model_dump(),
        message=msg,
    )


# ---------------------------------------------------------------------------
# GET /battery/history
# ---------------------------------------------------------------------------
@router.get(
    "/battery/history",
    response_model=StandardResponse,
    summary="Returns battery level over time from the status history log",
)
def get_battery_history(
    limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description=(
            "Maximum number of history entries to return. "
            "Returns the most recent `limit` entries (newest last). Default 50, max 500."
        ),
    ),
):
    """Return a time-series of battery readings from the status history.

    This endpoint extracts the power-related fields from the rolling status
    history. It is useful for:
    - Drawing a battery-level-over-time chart on the frontend.
    - Identifying when solar charging started or stopped.
    - Exporting raw power data for thesis analysis.

    The history is ordered oldest → newest. The most recent `limit` entries
    are returned, so if `limit=50` and there are 80 entries, the last 50 are
    returned.

    **Called by:** Frontend (battery history chart, thesis data export).
    """
    history = app_state["status_history"]

    # Take only the most recent `limit` entries to keep the response small
    page = history[-limit:] if len(history) > limit else history

    entries = [
        BatteryHistoryEntry(
            timestamp=entry["received_at"],
            battery_level=entry["battery_level"],
            battery_voltage=entry["battery_voltage"],
            solar_charging=entry["solar_charging"],
            power_source=entry["power_source"],
        ).model_dump()
        for entry in page
    ]

    print(f"[GET /battery/history] Returning {len(entries)} entries (limit={limit}).")

    return make_response(
        data={"entries": entries, "total": len(entries)},
        message=f"Returning {len(entries)} battery history entries.",
    )

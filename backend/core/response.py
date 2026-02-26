# core/response.py
# ---------------------------------------------------------------------------
# Standardised API response helper used by all route handlers.
#
# Every endpoint returns the same envelope:
#   {
#     "success"   : bool      → True on success, False on error
#     "data"      : any       → payload specific to the endpoint
#     "message"   : str       → human-readable summary
#     "timestamp" : datetime  → UTC time the response was generated
#   }
# ---------------------------------------------------------------------------

from datetime import datetime, timezone
from typing import Any


def make_response(
    data: Any = None,
    message: str = "OK",
    success: bool = True,
) -> dict:
    """Return the standard response envelope as a plain dict.

    FastAPI serialises datetime objects to ISO-8601 strings automatically,
    so the timestamp is kept as a datetime rather than converted here.
    """
    return {
        "success": success,
        "data": data,
        "message": message,
        "timestamp": datetime.now(timezone.utc),
    }

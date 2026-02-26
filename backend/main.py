# main.py
# ---------------------------------------------------------------------------
# Entry point for the Oil-Water Separation FastAPI backend.
#
# Responsibilities:
#   - Load the YOLOv8 model once at startup using a lifespan event
#   - Register all route modules
#   - Enable CORS so the frontend can communicate across origins
#   - Attach global exception handlers so errors return the standard envelope
#
# To run the server:
#   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# ---------------------------------------------------------------------------

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.state import app_state
from core.response import make_response
from ml.detector import load_model
from routes import commands, status, detection, cleaning, home, battery, filter, logs
from models.schemas import StandardResponse


# ---------------------------------------------------------------------------
# Lifespan: runs once when the server starts and once when it shuts down.
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup ----
    print("=" * 60)
    print("  Oil-Water Separation API — Starting up")
    print("=" * 60)

    # Record startup time so GET /health can compute uptime
    app_state["startup_time"] = datetime.now(timezone.utc)

    try:
        app_state["model"] = load_model("ml/best.pt")
        print("[STARTUP] YOLOv8 model is ready.")
    except FileNotFoundError as e:
        # Non-fatal: server still starts; POST /detect returns 503 until best.pt exists
        print(f"[STARTUP] WARNING: {e}")
        print("[STARTUP] Detection endpoint will be unavailable until the model is added.")

    print("[STARTUP] All systems ready. Visit http://localhost:8000/docs for the API docs.")
    print(
        "[STARTUP] WARNING: This API uses in-process memory for all state (battery, mode, "
        "commands, etc.). Run with a SINGLE worker only — multiple workers will each have "
        "their own isolated state, causing GET /battery and GET /command to return stale "
        "defaults even after POST /status has been called."
    )
    print("[STARTUP] Recommended: uvicorn main:app --workers 1")
    print("=" * 60)

    yield  # Server is running — handle requests

    # ---- Shutdown ----
    print("=" * 60)
    print("  Oil-Water Separation API — Shutting down")
    print("=" * 60)
    app_state["model"] = None


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Oil-Water Separation API",
    description=(
        "Backend API for an intelligent oil-water separation system. "
        "Controls an ESP32 drone via movement commands, receives sensor data, "
        "and runs YOLOv8 inference to detect oil slicks from camera images. "
        "Every endpoint returns { success, data, message, timestamp }."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS — allow all origins for development
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handlers
# Ensure every error — including 404, 422, and unhandled crashes — returns
# the same { success, data, message, timestamp } envelope as success responses.
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Wrap FastAPI/Starlette HTTP errors in the standard response envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "message": str(exc.detail),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Wrap Pydantic validation errors (422) in the standard response envelope."""
    errors = exc.errors()
    # Build a concise summary: "field_name: error message; ..."
    summary = "; ".join(
        f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}"
        for e in errors
    )
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "data": {"validation_errors": errors},
            "message": f"Validation failed — {summary}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected server errors so the client always gets JSON."""
    print(f"[ERROR] Unhandled exception on {request.url}: {exc!r}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "message": "An unexpected server error occurred. Check server logs.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Routers — each file in routes/ handles a logical group of endpoints
# ---------------------------------------------------------------------------
app.include_router(commands.router,  tags=["Commands & Mode"])
app.include_router(status.router,    tags=["Device Status"])
app.include_router(detection.router, tags=["Oil Detection"])
app.include_router(cleaning.router,  tags=["Cleaning Pattern"])
app.include_router(home.router,      tags=["Home Reference"])
app.include_router(battery.router,   tags=["Battery & Solar"])
app.include_router(filter.router,    tags=["Filter Status"])
app.include_router(logs.router,      tags=["Activity Logs"])


# ---------------------------------------------------------------------------
# Root — quick liveness check
# ---------------------------------------------------------------------------
@app.get("/", response_model=StandardResponse, tags=["Health"])
def root():
    print("[GET /] Liveness ping received.")
    return make_response(
        data={"docs": "/docs", "health": "/health"},
        message="Oil-Water Separation API is running.",
    )


# ---------------------------------------------------------------------------
# GET /health — detailed readiness check for monitoring dashboards
# ---------------------------------------------------------------------------
@app.get("/health", response_model=StandardResponse, tags=["Health"])
def health_check():
    """
    Returns:
    - **status**: always "ok" if this endpoint responds
    - **model_loaded**: True once YOLOv8 best.pt has been loaded successfully
    - **device_connected**: True if the ESP32 sent a status update within the
      last 10 seconds (stale / disconnected = False)
    - **uptime_seconds**: seconds since the server process started
    - **version**: API version string
    """
    model_loaded = app_state["model"] is not None

    # Device is considered connected if a status update arrived within 10 s
    device_connected = False
    if app_state["last_updated"] is not None:
        last = app_state["last_updated"]
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last).total_seconds()
        device_connected = elapsed <= 10.0

    # Uptime in seconds
    uptime_seconds = 0.0
    if app_state["startup_time"] is not None:
        uptime_seconds = round(
            (datetime.now(timezone.utc) - app_state["startup_time"]).total_seconds(), 2
        )

    print(
        f"[GET /health] model_loaded={model_loaded}, "
        f"device_connected={device_connected}, uptime={uptime_seconds}s"
    )

    return make_response(
        data={
            "status": "ok",
            "model_loaded": model_loaded,
            "device_connected": device_connected,
            "uptime_seconds": uptime_seconds,
            "version": "1.0.0",
        },
        message="API is healthy.",
    )

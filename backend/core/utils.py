# core/utils.py
# ---------------------------------------------------------------------------
# GPS math utilities used by the backend to compute navigation metrics
# and aerial image geo-referencing.
#
# Functions:
#   haversine_distance    → straight-line distance between two GPS points (metres)
#   bearing_to_target     → compass bearing from point A to point B (0–360°)
#   compute_heading_error → signed angular difference between heading and bearing
#   compute_gsd           → ground sample distance in metres/pixel for nadir camera
#   pixel_to_gps          → convert a pixel coordinate to a GPS position
# ---------------------------------------------------------------------------

import math


# Earth's mean radius in metres (WGS-84 approximation, accurate to ~0.5%)
_EARTH_RADIUS_M = 6_371_000.0


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in metres between two GPS coordinates.

    Uses the Haversine formula, which gives a good approximation for the
    short distances typical of a surface robot (< 1 km).

    Args:
        lat1, lng1: Starting point in decimal degrees.
        lat2, lng2: Destination point in decimal degrees.

    Returns:
        Distance in metres as a float, rounded to 2 decimal places.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return round(_EARTH_RADIUS_M * c, 2)


def bearing_to_target(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the initial compass bearing (0–360°) from point A to point B.

    0° = North, 90° = East, 180° = South, 270° = West.

    Args:
        lat1, lng1: Current position in decimal degrees.
        lat2, lng2: Target position in decimal degrees.

    Returns:
        Bearing in degrees, normalised to [0, 360), rounded to 2 decimal places.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lam = math.radians(lng2 - lng1)

    x = math.sin(d_lam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lam)

    bearing = math.degrees(math.atan2(x, y))
    return round(bearing % 360, 2)


def compute_heading_error(current_heading: float, bearing: float) -> float:
    """Return the signed heading error between the current heading and a target bearing.

    A positive value means the boat needs to turn right (clockwise).
    A negative value means the boat needs to turn left (counter-clockwise).
    The result is normalised to the range (-180, +180] so it always
    represents the shortest turning direction.

    Args:
        current_heading: Magnetometer reading in degrees (0–360).
        bearing:         Desired bearing to target in degrees (0–360).

    Returns:
        Signed heading error in degrees, rounded to 2 decimal places.
    """
    error = (bearing - current_heading + 180) % 360 - 180
    return round(error, 2)


def compute_gsd(altitude_m: float, image_width_px: int, fov_deg: float = 84.0) -> float:
    """Return the Ground Sample Distance (GSD) in metres per pixel.

    Assumes a nadir (straight-down) camera with a known horizontal field of view.
    GSD is the width of a single image pixel projected onto the ground.

    Args:
        altitude_m:     Drone altitude above ground in metres.
        image_width_px: Width of the captured image in pixels.
        fov_deg:        Horizontal camera field of view in degrees (default 84°).

    Returns:
        GSD in metres/pixel, rounded to 6 decimal places.
    """
    ground_width_m = 2.0 * altitude_m * math.tan(math.radians(fov_deg / 2.0))
    return round(ground_width_m / image_width_px, 6)


def pixel_to_gps(
    cx: float,
    cy: float,
    image_width: int,
    image_height: int,
    drone_lat: float,
    drone_lng: float,
    drone_altitude_m: float,
    drone_heading_deg: float,
    fov_deg: float = 84.0,
) -> tuple[float, float]:
    """Convert a pixel coordinate in a nadir image to a GPS position.

    The model assumes:
      - The camera points straight down (nadir).
      - Image x-axis is aligned with the drone's right direction.
      - Image y-axis increases downward (standard image convention).
      - Drone heading is the compass bearing the drone faces (0° = North).

    Args:
        cx, cy:              Pixel coordinate to project (can be fractional).
        image_width/height:  Full image dimensions in pixels.
        drone_lat/lng:       Drone GPS position when the image was taken.
        drone_altitude_m:    Drone altitude above ground in metres.
        drone_heading_deg:   Drone compass heading (0–360°).
        fov_deg:             Horizontal camera FOV in degrees (default 84°).

    Returns:
        (estimated_lat, estimated_lng) as a tuple of floats rounded to 7 dp.
    """
    gsd = compute_gsd(drone_altitude_m, image_width, fov_deg)

    # Pixel offset from the image centre
    # positive dx → drone's right;  positive dy_img → downward in image
    dx_px = cx - image_width / 2.0
    dy_px = cy - image_height / 2.0

    # Convert pixel offset to ground metres
    # forward direction = up in image = negative dy_img
    forward_m = -dy_px * gsd   # positive = ahead of drone
    right_m = dx_px * gsd      # positive = right of drone

    # Rotate ground offsets from drone-body frame to North-East frame
    h_rad = math.radians(drone_heading_deg)
    north_m = forward_m * math.cos(h_rad) - right_m * math.sin(h_rad)
    east_m = forward_m * math.sin(h_rad) + right_m * math.cos(h_rad)

    # Convert metres to degrees (flat-earth approximation, accurate for < 1 km)
    meters_per_deg_lat = 111_111.0
    meters_per_deg_lng = 111_111.0 * math.cos(math.radians(drone_lat))

    est_lat = round(drone_lat + north_m / meters_per_deg_lat, 7)
    est_lng = round(drone_lng + east_m / meters_per_deg_lng, 7)

    return est_lat, est_lng


def generate_spiral_waypoints(
    center_lat: float,
    center_lng: float,
    max_radius: float,
    step_size: float,
    max_waypoints: int = 1000,
    # UPDATED: per-waypoint speed control for the BTS7960 43A motor drivers.
    # Inner loops are tighter and slower; outer loops are wider and faster.
    inner_speed: int = 120,
    outer_speed: int = 180,
) -> list[dict]:
    """Generate a series of GPS waypoints forming an outward Archimedean spiral.

    The spiral starts at the first ring (radius = step_size) and expands
    outward one ring at a time until max_radius is reached.  The number of
    waypoints per ring is proportional to its circumference so spacing
    between consecutive waypoints stays roughly equal to step_size.

    UPDATED: Each waypoint now includes a per-segment `speed` (PWM 0-255 for
    the BTS7960 motor drivers) and a rudder `turn_angle` (servo angle -90 to
    +90 for the S020A-180 servos). Both values are linearly interpolated from
    the inner values to the outer values based on the ring radius:

        radius_ratio = 0.0  → innermost ring  → inner_speed, angle = 45°
        radius_ratio = 1.0  → outermost ring  → outer_speed, angle = 10°

    Args:
        center_lat/lng:  GPS centre of the spiral (oil location).
        max_radius:      Outer radius of the spiral in metres.
        step_size:       Radius increment per ring AND target spacing in metres.
        max_waypoints:   Hard cap to prevent runaway generation (default 1000).
        inner_speed:     PWM speed for the innermost loops (default 120, range 0-255).
        outer_speed:     PWM speed for the outermost loops (default 180, range 0-255).

    Returns:
        List of waypoint dicts, each containing:
            lat        → GPS latitude
            lng        → GPS longitude
            turn_angle → rudder servo angle for this arc segment (-90 to +90).
                         Larger (sharper) for tight inner loops, smaller (wider)
                         for outer loops.
            distance   → metres from the previous waypoint
            radius     → spiral ring radius this waypoint belongs to (metres)
            speed      → PWM speed value for the BTS7960 motor drivers (0-255)
    """
    waypoints: list[dict] = []
    num_loops = max(1, round(max_radius / step_size))

    meters_per_deg_lat = 111_111.0
    cos_lat = math.cos(math.radians(center_lat))
    meters_per_deg_lng = 111_111.0 * cos_lat

    # Denominator for radius_ratio — avoids division by zero when all rings are
    # the same size (e.g. max_radius == step_size → single ring).
    radius_range = max(max_radius - step_size, step_size)

    prev_lat, prev_lng = center_lat, center_lng

    for loop in range(1, num_loops + 1):
        radius = loop * step_size

        # UPDATED: radius_ratio goes from 0.0 (innermost) to 1.0 (outermost).
        # Used to interpolate both speed and rudder turn_angle linearly.
        radius_ratio = max(0.0, min(1.0, (radius - step_size) / radius_range))

        # UPDATED: Speed scales up from inner_speed → outer_speed as rings widen.
        # Slower on tight inner loops reduces overshoot; faster on wide outer loops
        # covers the larger arc distance more efficiently.
        wp_speed = round(inner_speed + radius_ratio * (outer_speed - inner_speed))

        # UPDATED: Rudder angle scales down from 45° → 10° as rings widen.
        # Tight inner loops need a sharp rudder angle (≈45°) to complete the
        # small-radius arc; wide outer loops only need a gentle angle (≈10°).
        # The angle is always positive here — the navigation command ("turn_left"
        # or "turn_right") determines the actual direction the ESP32 applies it.
        wp_turn_angle = round(45 - radius_ratio * 35)   # 45 inner → 10 outer

        # Scale points-per-ring with circumference so arc spacing ≈ step_size
        circumference = 2.0 * math.pi * radius
        num_points = max(8, int(circumference / step_size))

        for j in range(num_points):
            if len(waypoints) >= max_waypoints:
                return waypoints

            # Angle: 0° = North, clockwise (matches compass convention)
            angle_rad = 2.0 * math.pi * j / num_points

            north_m = radius * math.cos(angle_rad)
            east_m = radius * math.sin(angle_rad)

            wp_lat = round(center_lat + north_m / meters_per_deg_lat, 7)
            wp_lng = round(center_lng + east_m / meters_per_deg_lng, 7)

            dist = haversine_distance(prev_lat, prev_lng, wp_lat, wp_lng)

            waypoints.append({
                "lat": wp_lat,
                "lng": wp_lng,
                # UPDATED: rudder servo angle for this arc segment (-90 to +90)
                "turn_angle": wp_turn_angle,
                "distance": dist,
                "radius": round(radius, 4),
                # UPDATED: PWM speed for the BTS7960 motor drivers on this segment
                "speed": wp_speed,
            })

            prev_lat, prev_lng = wp_lat, wp_lng

    return waypoints


def heading_error_to_rudder_angle(error: float) -> int:
    """Map a heading error (degrees) to a proportional rudder servo angle (-90 to +90).

    Used by both the navigation command generator and GET /status to keep the
    suggested rudder angle consistent across the system.

    Positive error means the target is to the right → positive (right) angle.
    Negative error means the target is to the left  → negative (left) angle.

    Dead-band / step mapping (mirrors CHANGE 5 spec):
        abs(error) ≤ 10°        → 0   (straight, within dead-band)
        abs(error) 10° – 30°    → ±15 (gentle correction)
        abs(error) 30° – 60°    → ±35 (moderate correction)
        abs(error) > 60°        → ±60 (sharp correction, hard-capped at 60°)

    Args:
        error: Signed heading error in degrees (-180 to +180).

    Returns:
        Rudder angle as an integer in the range -90 to +90.
    """
    abs_error = abs(error)
    if abs_error <= 10:
        angle = 0
    elif abs_error <= 30:
        angle = 15
    elif abs_error <= 60:
        angle = 35
    else:
        angle = 60
    # Apply sign: positive error = right turn, negative error = left turn
    return angle if error >= 0 else -angle


def compute_navigation_command(
    current_lat: float,
    current_lng: float,
    target_lat: float,
    target_lng: float,
    current_heading: float,
    arrival_radius_m: float = 2.0,
) -> dict:
    """Compute the next navigation action using proportional rudder heading correction.

    UPDATED: Replaces the old binary turn_left / turn_right logic with a
    proportional rudder angle mapped from the heading error.  The boat always
    moves "forward" — the rudder servo is what steers it.  Speed is also
    reduced when a large correction is needed to prevent overshooting.

    Called on every GET /command poll in "automatic" and "cleaning" modes.

    Decision logic:
        1. If distance to target ≤ arrival_radius_m  → command "stop"
        2. Compute heading_error = bearing_to_target − current_heading
        3. Map heading_error to rudder angle via heading_error_to_rudder_angle()
        4. Speed = 150 PWM when abs(heading_error) > 30°
                 = 200 PWM when abs(heading_error) ≤ 30° (on track)
        5. Return command "forward" with the computed rudder_angle and speed

    Args:
        current_lat/lng:  Current device GPS position.
        target_lat/lng:   Destination GPS position.
        current_heading:  Magnetometer heading in degrees (0–360).
        arrival_radius_m: Distance in metres considered "arrived" (default 2 m).

    Returns:
        dict with keys:
            command       → "forward" or "stop"
            rudder_angle  → rudder servo angle (-90 to +90); 0 when stopped
            speed         → PWM value for the BTS7960 motor drivers (0–255);
                            150 during large corrections, 200 on straight runs, 0 when stopped
            heading_error → raw signed heading error in degrees; useful for callers
                            that want to make their own speed decisions (e.g. cleaning mode)
    """
    distance = haversine_distance(current_lat, current_lng, target_lat, target_lng)

    # Arrived at target — full stop, neutral rudder
    if distance <= arrival_radius_m:
        return {"command": "stop", "rudder_angle": 0, "speed": 0, "heading_error": 0.0}

    bearing = bearing_to_target(current_lat, current_lng, target_lat, target_lng)
    error = compute_heading_error(current_heading, bearing)

    # UPDATED: proportional rudder angle replaces binary turn_left / turn_right
    rudder_angle = heading_error_to_rudder_angle(error)

    # UPDATED: reduce speed for large heading corrections to avoid overshooting
    speed = 150 if abs(error) > 30 else 200

    return {
        "command": "forward",
        "rudder_angle": rudder_angle,
        "speed": speed,
        # Include the raw error so callers (e.g. cleaning mode) can apply their
        # own speed logic without re-computing heading error a second time.
        "heading_error": round(error, 2),
    }

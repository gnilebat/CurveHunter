"""Curvature scoring for route geometries."""
import math


def _bearing(a: list[float], b: list[float]) -> float:
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.degrees(math.atan2(x, y))


def _haversine_m(a: list[float], b: list[float]) -> float:
    R = 6_371_000
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _angle_delta(b1: float, b2: float) -> float:
    delta = abs(b2 - b1)
    return 360 - delta if delta > 180 else delta


def overall_curvature(
    coords: list[list[float]],
    skip_mask: list[bool] | None = None
) -> tuple[float, float]:
    """
    Returns (curvature_score, length_km) for the whole path.
    If `skip_mask` is provided, vertices marked True are excluded from both
    the angle sum and the length sum — used to ignore urban curves.
    """
    if len(coords) < 3:
        return 0.0, 0.0
    total_angle = 0.0
    total_dist = 0.0
    for i in range(1, len(coords) - 1):
        if skip_mask is not None and (skip_mask[i - 1] or skip_mask[i] or skip_mask[i + 1]):
            continue
        b1 = _bearing(coords[i - 1], coords[i])
        b2 = _bearing(coords[i], coords[i + 1])
        total_angle += _angle_delta(b1, b2)
        total_dist += _haversine_m(coords[i - 1], coords[i])
    if skip_mask is None or not (skip_mask[-2] or skip_mask[-1]):
        total_dist += _haversine_m(coords[-2], coords[-1])
    length_km = total_dist / 1000
    score = total_angle / length_km if length_km > 0 else 0
    return score, length_km


URBAN_ROAD_CLASSES = {"residential", "living_street", "service", "pedestrian"}
HIGHWAY_LIKE_ROAD_CLASSES = {"motorway", "trunk"}


def build_class_mask(
    n_coords: int,
    road_class_ranges: list,
    classes: set[str]
) -> list[bool]:
    """Generic per-coordinate mask for any set of OSM road_class values."""
    mask = [False] * n_coords
    for entry in road_class_ranges:
        from_idx, to_idx, cls = entry[0], entry[1], entry[2]
        if isinstance(cls, str) and cls.lower() in classes:
            for i in range(max(0, from_idx), min(to_idx + 1, n_coords)):
                mask[i] = True
    return mask


def length_in_mask_m(coords: list[list[float]], mask: list[bool]) -> float:
    """Sum haversine length of edges where both endpoints fall inside the mask."""
    total = 0.0
    for i in range(len(coords) - 1):
        if i < len(mask) and i + 1 < len(mask) and mask[i] and mask[i + 1]:
            total += _haversine_m(coords[i], coords[i + 1])
    return total


def build_urban_mask(
    n_coords: int,
    road_class_ranges: list,
    max_speed_ranges: list
) -> list[bool]:
    """GraphHopper details → per-coordinate urban mask."""
    is_urban = [False] * n_coords
    for entry in road_class_ranges:
        from_idx, to_idx, cls = entry[0], entry[1], entry[2]
        if isinstance(cls, str) and cls.lower() in URBAN_ROAD_CLASSES:
            for i in range(max(0, from_idx), min(to_idx + 1, n_coords)):
                is_urban[i] = True
    for entry in max_speed_ranges:
        from_idx, to_idx, speed = entry[0], entry[1], entry[2]
        if isinstance(speed, (int, float)) and 0 < speed <= 50:
            for i in range(max(0, from_idx), min(to_idx + 1, n_coords)):
                is_urban[i] = True
    return is_urban


def build_max_speed_per_vertex(
    n_coords: int,
    max_speed_ranges: list
) -> list[int]:
    """Per-vertex max-speed in km/h (0 = untagged). For nav-time UI."""
    speeds = [0] * n_coords
    for entry in max_speed_ranges:
        from_idx, to_idx, speed = entry[0], entry[1], entry[2]
        if isinstance(speed, (int, float)) and speed > 0:
            s = int(round(speed))
            for i in range(max(0, from_idx), min(to_idx + 1, n_coords)):
                speeds[i] = s
    return speeds


def build_speed_below_mask(
    n_coords: int,
    max_speed_ranges: list,
    min_speed: int
) -> list[bool]:
    """
    True = edge has a tagged max_speed strictly below `min_speed`.
    Untagged edges (speed == 0) are NOT marked — they fall through as
    counted, since most rural roads in OSM Germany lack max_speed tags.
    """
    below = [False] * n_coords
    if min_speed <= 0:
        return below
    for entry in max_speed_ranges:
        from_idx, to_idx, speed = entry[0], entry[1], entry[2]
        if isinstance(speed, (int, float)) and 0 < speed < min_speed:
            for i in range(max(0, from_idx), min(to_idx + 1, n_coords)):
                below[i] = True
    return below


def build_highway_mask(n_coords: int, road_class_ranges: list) -> list[bool]:
    """GraphHopper details → per-coordinate mask for Autobahnen + Kraftfahrstraßen."""
    is_highway = [False] * n_coords
    for entry in road_class_ranges:
        from_idx, to_idx, cls = entry[0], entry[1], entry[2]
        if isinstance(cls, str) and cls.lower() in HIGHWAY_LIKE_ROAD_CLASSES:
            for i in range(max(0, from_idx), min(to_idx + 1, n_coords)):
                is_highway[i] = True
    return is_highway


def segment_curvature(
    coords: list[list[float]],
    window_m: float = 500.0,
    urban_mask: list[bool] | None = None,
    highway_mask: list[bool] | None = None,
    below_speed_mask: list[bool] | None = None
) -> list[dict]:
    """
    Split the path into ~window_m sized chunks and score each.
    Returns: [{"coordinates": [[lng,lat],...], "score": float, "length_km": float}, ...]
    Adjacent segments share an endpoint so the rendered line has no gaps.
    """
    if len(coords) < 3:
        return [{
            "coordinates": coords, "score": 0.0, "length_km": 0.0,
            "is_urban": False, "is_highway": False, "is_below_speed": False
        }]

    segments: list[dict] = []
    buf: list[list[float]] = [coords[0]]
    buf_indices: list[int] = [0]
    buf_len = 0.0

    def mask_fraction(mask: list[bool] | None, indices: list[int]) -> float:
        if mask is None or not indices:
            return 0.0
        hits = sum(1 for i in indices if i < len(mask) and mask[i])
        return hits / len(indices)

    for i in range(1, len(coords)):
        d = _haversine_m(coords[i - 1], coords[i])
        buf.append(coords[i])
        buf_indices.append(i)
        buf_len += d

        if buf_len >= window_m and len(buf) >= 3:
            score, length_km = overall_curvature(buf)
            segments.append({
                "coordinates": buf,
                "score": round(score, 1),
                "length_km": round(length_km, 3),
                "is_urban": mask_fraction(urban_mask, buf_indices) >= 0.5,
                "is_highway": mask_fraction(highway_mask, buf_indices) >= 0.5,
                "is_below_speed": mask_fraction(below_speed_mask, buf_indices) >= 0.5
            })
            buf = [coords[i]]
            buf_indices = [i]
            buf_len = 0.0

    if len(buf) >= 2:
        if segments and len(buf) < 3:
            last = segments[-1]
            last["coordinates"] = last["coordinates"] + buf[1:]
            score, length_km = overall_curvature(last["coordinates"])
            last["score"] = round(score, 1)
            last["length_km"] = round(length_km, 3)
        else:
            score, length_km = overall_curvature(buf)
            segments.append({
                "coordinates": buf,
                "score": round(score, 1),
                "length_km": round(length_km, 3),
                "is_urban": mask_fraction(urban_mask, buf_indices) >= 0.5,
                "is_highway": mask_fraction(highway_mask, buf_indices) >= 0.5,
                "is_below_speed": mask_fraction(below_speed_mask, buf_indices) >= 0.5
            })

    return segments

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


def overall_curvature(coords: list[list[float]]) -> tuple[float, float]:
    """Returns (curvature_score, length_km) for the whole path."""
    if len(coords) < 3:
        return 0.0, 0.0
    total_angle = 0.0
    total_dist = 0.0
    for i in range(1, len(coords) - 1):
        b1 = _bearing(coords[i - 1], coords[i])
        b2 = _bearing(coords[i], coords[i + 1])
        total_angle += _angle_delta(b1, b2)
        total_dist += _haversine_m(coords[i - 1], coords[i])
    total_dist += _haversine_m(coords[-2], coords[-1])
    length_km = total_dist / 1000
    score = total_angle / length_km if length_km > 0 else 0
    return score, length_km


def segment_curvature(
    coords: list[list[float]],
    window_m: float = 500.0
) -> list[dict]:
    """
    Split the path into ~window_m sized chunks and score each.
    Returns: [{"coordinates": [[lng,lat],...], "score": float, "length_km": float}, ...]
    Adjacent segments share an endpoint so the rendered line has no gaps.
    """
    if len(coords) < 3:
        return [{"coordinates": coords, "score": 0.0, "length_km": 0.0}]

    segments: list[dict] = []
    buf: list[list[float]] = [coords[0]]
    buf_len = 0.0

    for i in range(1, len(coords)):
        d = _haversine_m(coords[i - 1], coords[i])
        buf.append(coords[i])
        buf_len += d

        if buf_len >= window_m and len(buf) >= 3:
            score, length_km = overall_curvature(buf)
            segments.append({"coordinates": buf, "score": round(score, 1), "length_km": round(length_km, 3)})
            buf = [coords[i]]
            buf_len = 0.0

    # Tail: append remainder to the last segment to avoid a tiny stub
    if len(buf) >= 2:
        if segments and len(buf) < 3:
            last = segments[-1]
            last["coordinates"] = last["coordinates"] + buf[1:]
            score, length_km = overall_curvature(last["coordinates"])
            last["score"] = round(score, 1)
            last["length_km"] = round(length_km, 3)
        else:
            score, length_km = overall_curvature(buf)
            segments.append({"coordinates": buf, "score": round(score, 1), "length_km": round(length_km, 3)})

    return segments

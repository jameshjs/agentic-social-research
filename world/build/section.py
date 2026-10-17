"""Shared geometry for the Bloor St W section: Spadina Ave to Bathurst St.

The local frame is street-aligned: x runs east along Bloor from the Bathurst
intersection (x = 0) towards Spadina; y is metres north of the Bloor centreline.
"""
import math

# Clip box (west, south, east, north) in WGS84. About 150-300 m either side of Bloor.
BBOX = (-79.4130, 43.6630, -79.4020, 43.6695)

# OSM intersection nodes on the Bloor centreline (shared node between Bloor and the cross street).
BATHURST = (43.665134, -79.411206)
SPADINA = (43.666669, -79.403816)

_LAT0, _LON0 = BATHURST
_KX = 111320.0 * math.cos(math.radians(_LAT0))
_KY = 110574.0
_dx = (SPADINA[1] - _LON0) * _KX
_dy = (SPADINA[0] - _LAT0) * _KY
THETA = math.atan2(_dy, _dx)            # bearing of Bloor, counter-clockwise from east
SECTION_LENGTH_M = math.hypot(_dx, _dy)
_C, _S = math.cos(-THETA), math.sin(-THETA)


def to_local(lat, lon):
    """WGS84 -> (x along Bloor, y north of Bloor) in metres."""
    e = (lon - _LON0) * _KX
    n = (lat - _LAT0) * _KY
    return (round(e * _C - n * _S, 1), round(e * _S + n * _C, 1))


def from_local(x, y):
    c, s = math.cos(THETA), math.sin(THETA)
    e, n = x * c - y * s, x * s + y * c
    return (round(_LAT0 + n / _KY, 7), round(_LON0 + e / _KX, 7))


def mercator_to_wgs84(x, y):
    r = 6378137.0
    return (math.degrees(2 * math.atan(math.exp(y / r)) - math.pi / 2), math.degrees(x / r))


def in_bbox(lat, lon):
    w, s, e, n = BBOX
    return w <= lon <= e and s <= lat <= n


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def ring_area(ring):
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2

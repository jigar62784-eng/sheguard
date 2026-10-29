/**
 * geo.js — small geometry helpers (no Maps dependency, so they are unit-testable).
 * Points are {lat, lng}. Distances are metres.
 */
const R = 6371008.8; // mean Earth radius (m)
const rad = d => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance from point p to segment a-b using a local equirectangular projection (accurate at city scale). */
export function pointToSegment(p, a, b) {
  const k = Math.cos(rad(p.lat));
  const px = rad(p.lng) * k * R, py = rad(p.lat) * R;
  const ax = rad(a.lng) * k * R, ay = rad(a.lat) * R;
  const bx = rad(b.lng) * k * R, by = rad(b.lat) * R;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Minimum distance from a point to a polyline (array of {lat,lng}). */
export function distanceToPath(p, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, pointToSegment(p, path[i - 1], path[i]));
  return best;
}

/** Bounding box of a path expanded by `meters` on every side. */
export function bbox(path, meters = 0) {
  const lats = path.map(p => p.lat), lngs = path.map(p => p.lng);
  const dLat = (meters / R) * (180 / Math.PI);
  const dLng = dLat / Math.cos(rad((Math.min(...lats) + Math.max(...lats)) / 2));
  return { south: Math.min(...lats) - dLat, north: Math.max(...lats) + dLat, west: Math.min(...lngs) - dLng, east: Math.max(...lngs) + dLng };
}

/** Evenly spaced sample points along a path (at most `max`, roughly every `every` metres). */
export function samplePath(path, every = 800, max = 5) {
  const out = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length && out.length < max; i++) {
    acc += haversine(path[i - 1], path[i]);
    if (acc >= every) { out.push(path[i]); acc = 0; }
  }
  return out;
}

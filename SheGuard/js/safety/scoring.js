/**
 * scoring.js — transparent route comparison using ONLY stored, sourced records.
 *
 * WHAT THIS IS: a count of nearby recorded public-safety records, weighted by recency and
 * normalised by route length. It is a data-density indicator, NOT a prediction of danger.
 *
 * WHAT THIS IS NOT:
 *  - "Fewer records" does not mean "safe": absence of records is not evidence of safety.
 *  - "More records" does not mean "dangerous": reporting rates and access to reporting differ by area.
 *
 * RULES IMPLEMENTED (spec §5):
 *  1. Configurable corridor around every route (cfg.corridorMeters).
 *  2. Records are de-duplicated (same source + coordinates + occurrence time).
 *  3. Time decay only for records with a known occurredAt: weight = 0.5^(ageDays / halfLifeDays).
 *     Half-life default 365 days — a documented, adjustable assumption (README → "Scoring model").
 *     Undated records are COUNTED separately and never given an invented date.
 *  4. Only records with point-level or locality-level precision and known coordinates are used.
 *     Aggregate state/district statistics (e.g. NCRB annual tables) are never placed on a map line.
 *  5. No arbitrary weights across incident categories: every matching record counts equally.
 *  6. Factors, counts, freshness and limitations are returned so the UI can display them.
 *  7. If there are fewer than cfg.minRecords matching records across the candidate routes, or the
 *     route lies outside a source's declared coverage, the result is "insufficient" — no number is produced.
 */
import { distanceToPath, bbox } from "./geo.js";

export const DEFAULT_SCORING = {
  corridorMeters: 150,
  halfLifeDays: 365,
  maxAgeDays: 1095,        // ignore records older than 3 years
  minRecords: 10,          // minimum matched records across all candidate routes
  usablePrecisions: ["point", "street", "locality"]
};

const dayMs = 86400000;
const toDate = v => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

/** Remove exact duplicates (same source, same coordinates, same occurrence time). */
export function dedupe(records) {
  const seen = new Set(), out = [];
  for (const r of records) {
    const k = `${r.sourceId}|${r.latitude}|${r.longitude}|${toDate(r.occurredAt)?.getTime() ?? "na"}|${r.incidentCategory ?? ""}`;
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

/** Do all route vertices fall inside the source's declared coverage box? (coverage = {south,north,west,east} or null) */
function insideCoverage(path, cov) {
  if (!cov) return false; // unknown coverage → cannot claim it covers the route
  return path.every(p => p.lat >= cov.south && p.lat <= cov.north && p.lng >= cov.west && p.lng <= cov.east);
}

/**
 * @param routes   [{path, distanceMeters}]
 * @param records  normalised records from Firestore (safetyRecords)
 * @param sources  metadata docs from safetySources (for coverage + freshness)
 * @returns {status:"scored"|"insufficient", reason?, perRoute:[...]}
 */
export function compareRoutes(routes, records, sources, cfg = {}) {
  const c = { ...DEFAULT_SCORING, ...cfg };
  const now = Date.now();
  const usable = dedupe(records).filter(r =>
    typeof r.latitude === "number" && typeof r.longitude === "number" && c.usablePrecisions.includes(r.geographicPrecision));
  const srcById = Object.fromEntries(sources.map(s => [s.id, s]));

  const perRoute = routes.map(route => {
    const matched = usable.filter(r => distanceToPath({ lat: r.latitude, lng: r.longitude }, route.path) <= c.corridorMeters);
    const dated = matched.filter(r => toDate(r.occurredAt) && (now - toDate(r.occurredAt)) / dayMs <= c.maxAgeDays);
    const undated = matched.filter(r => !toDate(r.occurredAt));
    const weighted = dated.reduce((s, r) => s + Math.pow(0.5, (now - toDate(r.occurredAt)) / dayMs / c.halfLifeDays), 0);
    const km = route.distanceMeters / 1000;
    const usedSources = [...new Set(matched.map(r => r.sourceId))];
    const covered = usedSources.length > 0 && usedSources.every(id => insideCoverage(route.path, srcById[id]?.coverageBox));
    const newest = dated.map(r => toDate(r.occurredAt).getTime()).sort((a, b) => b - a)[0];
    return {
      matchedCount: matched.length, datedCount: dated.length, undatedCount: undated.length,
      weightedCount: weighted, densityPerKm: km > 0 ? weighted / km : null,
      sourceNames: usedSources.map(id => srcById[id]?.name || id),
      newestRecord: newest ? new Date(newest) : null,
      withinDeclaredCoverage: covered,
      factors: [
        `Corridor: ${c.corridorMeters} m either side of the route`,
        `Records matched: ${matched.length} (${dated.length} dated, ${undated.length} undated)`,
        `Recency weighting: half-life ${c.halfLifeDays} days; records older than ${c.maxAgeDays} days ignored`,
        `Weighted count: ${weighted.toFixed(2)} over ${km.toFixed(1)} km`
      ]
    };
  });

  const totalMatched = new Set(perRoute.flatMap((_, i) => usable
    .filter(r => distanceToPath({ lat: r.latitude, lng: r.longitude }, routes[i].path) <= c.corridorMeters).map(r => r.id))).size;

  if (usable.length === 0) return { status: "insufficient", reason: "No point-level public-safety records are stored for this area. Official sources currently connected publish aggregate statistics only.", perRoute, config: c };
  if (totalMatched < c.minRecords) return { status: "insufficient", reason: `Only ${totalMatched} usable record(s) lie near these routes (minimum ${c.minRecords}).`, perRoute, config: c };
  if (!perRoute.every(r => r.withinDeclaredCoverage || r.matchedCount === 0)) return { status: "insufficient", reason: "Part of a route lies outside the area the data source says it covers.", perRoute, config: c };
  return { status: "scored", perRoute, config: c };
}

/** Bounding box to pre-filter Firestore records for a set of routes. */
export function boxForRoutes(routes, meters) {
  const all = routes.flatMap(r => r.path);
  return bbox(all, meters);
}

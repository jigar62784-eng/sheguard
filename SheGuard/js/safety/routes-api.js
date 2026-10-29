/**
 * routes-api.js — real route calculation through the documented Google Routes API:
 *   POST https://routes.googleapis.com/directions/v2:computeRoutes
 * Nothing here is hardcoded: geometry, distance and durations all come from the response.
 * Mode "direct" calls Google from the browser (key restricted by referrer);
 * mode "proxy" sends the same body to java-backend, which holds a server-side key.
 */
import { mapsConfig } from "../maps-config.js";
import { auth } from "../firebase.js";
import { loadMaps } from "../maps-loader.js";

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
// Only request the fields we show (billing tier depends on the fields requested).
const FIELD_MASK = [
  "routes.duration", "routes.staticDuration", "routes.distanceMeters", "routes.description",
  "routes.routeLabels", "routes.polyline.encodedPolyline",
  "routes.legs.steps.distanceMeters", "routes.legs.steps.navigationInstruction"
].join(",");
const TRAVEL_MODE = { walking: "WALK", driving: "DRIVE", cycling: "BICYCLE" };

/** Turn an HTTP/API failure into a message the user can act on. */
function apiError(status, body) {
  const msg = body?.error?.message || "";
  if (status === 400) return Object.assign(new Error(`Google could not use this request: ${msg || "invalid origin, destination or mode."}`), { code: "INVALID_REQUEST" });
  if (status === 401 || status === 403) return Object.assign(new Error("Routes API refused the key. Enable Routes API + billing and check referrer/API restrictions."), { code: "AUTH" });
  if (status === 429) return Object.assign(new Error("Routes API quota exceeded. Try again later or raise the quota in Google Cloud Console."), { code: "QUOTA" });
  return Object.assign(new Error(`Routes API error (${status}). ${msg}`), { code: "API_ERROR" });
}

const waypoint = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/**
 * @param origin/destination {lat,lng}
 * @param mode "walking" | "driving" | "cycling"
 * @returns array of routes with decoded geometry, distance (m), duration (s), steps
 */
export async function computeRoutes({ origin, destination, mode }) {
  const maps = await loadMaps();
  await maps.importLibrary("geometry");
  const body = {
    origin: waypoint(origin), destination: waypoint(destination),
    travelMode: TRAVEL_MODE[mode], computeAlternativeRoutes: true,
    languageCode: "en-IN", regionCode: mapsConfig.defaultRegion, units: "METRIC"
  };
  if (mode === "driving") body.routingPreference = "TRAFFIC_AWARE"; // traffic only valid for DRIVE

  let res;
  try {
    if (mapsConfig.routesMode === "proxy") {
      const token = await auth.currentUser.getIdToken();
      res = await fetch(`${mapsConfig.backendBaseUrl}/api/routes/compute`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fieldMask: FIELD_MASK, request: body })
      });
    } else {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": mapsConfig.apiKey, "X-Goog-FieldMask": FIELD_MASK },
        body: JSON.stringify(body)
      });
    }
  } catch (e) {
    throw Object.assign(new Error("Network error while contacting the routing service."), { code: "NETWORK" });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(res.status, data);
  if (!data.routes?.length) throw Object.assign(new Error("No route found between these places for the selected travel mode."), { code: "ZERO_RESULTS" });

  return data.routes.map((r, i) => ({
    index: i,
    label: (r.routeLabels || []).join(", ").replaceAll("_", " ").toLowerCase(),
    summary: r.description || `Route ${i + 1}`,
    distanceMeters: r.distanceMeters,
    durationSec: parseInt(r.duration, 10),                 // "123s" → 123 (traffic-aware for DRIVE)
    staticDurationSec: parseInt(r.staticDuration, 10),
    path: google.maps.geometry.encoding.decodePath(r.polyline.encodedPolyline),
    steps: (r.legs || []).flatMap(l => l.steps || []).map(s => ({
      text: s.navigationInstruction?.instructions || "Continue", distanceMeters: s.distanceMeters
    }))
  }));
}

/** Deep link that opens the chosen trip in Google Maps (Google Maps picks its own preferred alternative). */
export function googleMapsUrl({ origin, destination, mode }) {
  const m = { walking: "walking", driving: "driving", cycling: "bicycling" }[mode];
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=${m}`;
}

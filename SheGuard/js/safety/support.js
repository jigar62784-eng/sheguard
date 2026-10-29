/**
 * support.js — nearby public support locations (police stations, hospitals, fire stations)
 * using Google Places API (New): google.maps.places.Place.searchNearby.
 * These are Google Maps business listings. SheGuard does NOT independently verify them,
 * and the UI says so. If the call fails we return {available:false} — never invented places.
 */
import { loadMaps } from "../maps-loader.js";
import { mapsConfig } from "../maps-config.js";
import { distanceToPath, samplePath } from "./geo.js";

export const SUPPORT_TYPES = ["police", "hospital", "fire_station"];

export async function searchNearbySupport(center, radius = mapsConfig.supportSearchRadiusMeters, types = SUPPORT_TYPES) {
  const maps = await loadMaps();
  const { Place } = await maps.importLibrary("places");
  const { places } = await Place.searchNearby({
    fields: ["id", "displayName", "location", "formattedAddress", "types", "nationalPhoneNumber"],
    locationRestriction: { center, radius },
    includedTypes: types, maxResultCount: 20
  });
  return places.map(p => ({
    id: p.id, name: p.displayName, address: p.formattedAddress, phone: p.nationalPhoneNumber || null,
    types: (p.types || []).filter(t => SUPPORT_TYPES.includes(t)),
    lat: p.location.lat(), lng: p.location.lng()
  }));
}

/** Support locations near a route: sample a few points, query each, de-duplicate by place id. */
export async function supportAlongRoute(route) {
  try {
    const samples = samplePath(route.path.map(p => ({ lat: p.lat(), lng: p.lng() })), 800, 5);
    const lists = await Promise.all(samples.map(s => searchNearbySupport(s)));
    const byId = new Map(lists.flat().map(p => [p.id, p]));
    const plain = route.path.map(p => ({ lat: p.lat(), lng: p.lng() }));
    const found = [...byId.values()].map(p => ({ ...p, distanceToRoute: distanceToPath(p, plain) }))
      .filter(p => p.distanceToRoute <= mapsConfig.supportSearchRadiusMeters)
      .sort((a, b) => a.distanceToRoute - b.distanceToRoute);
    return { available: true, places: found };
  } catch (e) {
    console.error("Nearby support lookup failed", e);
    return { available: false, places: [], error: e.message };
  }
}

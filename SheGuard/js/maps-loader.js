/**
 * maps-loader.js — loads the Google Maps JavaScript API once, using the key from maps-config.js.
 * Libraries: places (autocomplete + nearby search), geometry (polyline decoding).
 */
import { mapsConfig, isMapsConfigured } from "./maps-config.js";

let loadPromise = null;
export function loadMaps() {
  if (!isMapsConfigured) return Promise.reject(Object.assign(new Error("Google Maps API key is not configured (js/maps-config.js)."), { code: "MAPS_NOT_CONFIGURED" }));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    // Google calls this when an auth/billing/referrer problem is detected after the script loads.
    window.gm_authFailure = () => reject(Object.assign(new Error("Google Maps rejected the API key (check billing, enabled APIs and referrer restrictions)."), { code: "MAPS_AUTH_FAILURE" }));
    window.__sgMapsReady = () => resolve(window.google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsConfig.apiKey)}&libraries=places,geometry&loading=async&region=${mapsConfig.defaultRegion}&callback=__sgMapsReady&v=weekly`;
    s.async = true;
    s.onerror = () => reject(Object.assign(new Error("Could not load Google Maps (network blocked or key invalid)."), { code: "MAPS_LOAD_FAILED" }));
    document.head.appendChild(s);
  });
  return loadPromise;
}

/**
 * Attach the Places Autocomplete (new) web component to a container.
 * Returns { get(): {address?, lat?, lng?, label} | null, set(location,label), clear() }.
 */
export async function attachAutocomplete(container, { placeholder, onChange } = {}) {
  await loadMaps();
  await google.maps.importLibrary("places");
  const el = new google.maps.places.PlaceAutocompleteElement({ includedRegionCodes: [mapsConfig.defaultRegion.toLowerCase()] });
  if (placeholder) el.setAttribute("placeholder", placeholder);
  container.appendChild(el);
  let value = null;
  // Event name changed between API versions: handle both.
  const handler = async ev => {
    try {
      const place = ev.placePrediction ? ev.placePrediction.toPlace() : ev.place;
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      value = { lat: place.location.lat(), lng: place.location.lng(), label: place.formattedAddress || place.displayName };
      onChange?.(value);
    } catch (e) { value = null; console.error("Place details failed", e); }
  };
  el.addEventListener("gmp-select", handler);
  el.addEventListener("gmp-placeselect", handler);
  return {
    get: () => value,
    set: (v) => { value = v; if (v?.label) el.value = v.label; },
    clear: () => { value = null; el.value = ""; }
  };
}

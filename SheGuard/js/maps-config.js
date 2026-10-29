/**
 * maps-config.js — Google Maps Platform configuration (kept SEPARATE from Firebase on purpose).
 *
 * A Maps browser key is visible to anyone who loads the page, so protect it in Google Cloud Console:
 *   1. APIs & Services → Library → enable: "Maps JavaScript API", "Places API (New)", "Routes API".
 *   2. Billing must be enabled on the project (Maps Platform requires it).
 *   3. Credentials → Create API key → restrict by HTTP referrers (your domain + http://localhost:*)
 *      and restrict to those three APIs. Set a daily quota cap to bound cost.
 *
 * If Routes API rejects browser calls with your key restrictions, set routesMode to "proxy" and run
 * java-backend (it calls Routes API with a server-side key you never ship to the browser).
 *
 * PLACEHOLDER BELOW — it is not a working key.
 */
export const mapsConfig = {
  apiKey: "REPLACE_WITH_GOOGLE_MAPS_API_KEY",
  routesMode: "direct",                       // "direct" (browser → Routes API) | "proxy" (browser → java-backend)
  backendBaseUrl: "http://localhost:8080",    // used for proxy mode, SOS dispatch and admin data refresh
  defaultRegion: "IN",                        // CLDR region code used to bias results
  corridorMeters: 150,                        // width of the corridor around a route used for record matching
  supportSearchRadiusMeters: 600              // radius for nearby police/hospital lookups along a route
};
export const isMapsConfigured = !String(mapsConfig.apiKey).startsWith("REPLACE_WITH");

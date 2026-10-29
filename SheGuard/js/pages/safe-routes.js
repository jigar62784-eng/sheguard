/**
 * safe-routes.js — real route planning + transparent, source-backed comparison.
 * Pipeline: autocomplete → Routes API (real geometry) → Firestore safety records → scoring.js → UI.
 * No route is ever labelled "safe"; when data is thin the UI says "Insufficient safety data".
 */
import { initPage } from "../guard.js";
import { loadMaps, attachAutocomplete } from "../maps-loader.js";
import { isMapsConfigured } from "../maps-config.js";
import { mapsConfig } from "../maps-config.js";
import { computeRoutes, googleMapsUrl } from "../safety/routes-api.js";
import { compareRoutes, boxForRoutes } from "../safety/scoring.js";
import { supportAlongRoute } from "../safety/support.js";
import { listSafetyRecordsInBox, listSafetySources, addJourney } from "../db.js";
import { $, esc, notice, fmtKm, fmtDuration, fmtDate } from "../ui.js";

const { user } = await initPage({ page: "safe-routes" });
if (!isMapsConfigured) {
  notice("#msg", "bad", "<b>Google Maps key not configured.</b> Add a restricted key in <code>js/maps-config.js</code> (README → Google Maps setup). Route planning is disabled until then.");
  $("#go").disabled = true;
  throw new Error("MAPS_NOT_CONFIGURED");
}

let map, origin = null, dest = null, routes = [], lines = [], selected = 0, scoring = null, support = [];
try {
  const maps = await loadMaps();
  const { Map } = await maps.importLibrary("maps");
  map = new Map($("#map"), { center: { lat: 28.4744, lng: 77.5040 }, zoom: 11, mapTypeControl: false, streetViewControl: false });
} catch (e) { notice("#msg", "bad", `Map could not load: ${esc(e.message)}`); throw e; }

const acO = await attachAutocomplete($("#origin-ac"), { placeholder: "Starting address", onChange: v => (origin = v) });
const acD = await attachAutocomplete($("#dest-ac"), { placeholder: "Destination address", onChange: v => (dest = v) });

/* Current location — only after the user clicks and the browser permission is granted. */
$("#use-loc").addEventListener("click", () => {
  if (!navigator.geolocation) return notice("#msg", "bad", "This browser does not support location.");
  navigator.geolocation.getCurrentPosition(
    pos => { origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "My current location" }; acO.set(origin); notice("#msg", "ok", "Using your current location as the start."); },
    err => notice("#msg", "bad", err.code === 1 ? "Location permission denied. Type a starting address instead." : "Could not determine your location."),
    { enableHighAccuracy: true, timeout: 10000 });
});

const COLORS = { on: "#1b7f79", off: "#8a97a1" };
function draw() {
  lines.forEach(l => l.setMap(null));
  lines = routes.map((r, i) => new google.maps.Polyline({
    map, path: r.path, strokeColor: i === selected ? COLORS.on : COLORS.off,
    strokeWeight: i === selected ? 7 : 4, strokeOpacity: i === selected ? 0.95 : 0.65, zIndex: i === selected ? 10 : 1
  }));
  lines.forEach((l, i) => l.addListener("click", () => select(i)));
}

function safetyHtml(i) {
  if (!scoring) return `<dd>Safety information unavailable for this area.</dd>`;
  if (scoring.status === "insufficient") return `<dd><b>Insufficient safety data.</b> <span class="muted small">${esc(scoring.reason)}</span></dd>`;
  const s = scoring.perRoute[i];
  return `<dd>${s.densityPerKm.toFixed(2)} weighted records/km<br><span class="small muted">Lower means fewer <i>recorded</i> incidents nearby — not “safer”. ${s.factors.map(f => esc(f)).join(" · ")}<br>Sources: ${esc(s.sourceNames.join(", ") || "—")}${s.newestRecord ? ` · newest record ${fmtDate(s.newestRecord)}` : ""}</span></dd>`;
}
function supportHtml(i) {
  const s = support[i];
  if (!s) return `<dd class="muted">Not checked</dd>`;
  if (!s.available) return `<dd class="muted">Unavailable (${esc(s.error || "lookup failed")})</dd>`;
  if (!s.places.length) return `<dd>None found within ${mapsConfig.supportSearchRadiusMeters} m of this route in Google Maps listings.</dd>`;
  const near = s.places[0];
  return `<dd>${s.places.length} within ${mapsConfig.supportSearchRadiusMeters} m · nearest: ${esc(near.name)} (${fmtKm(near.distanceToRoute)} from route)<br><span class="small muted">Google Maps listings, not verified by SheGuard.</span></dd>`;
}
function renderList() {
  $("#routes").innerHTML = routes.map((r, i) => `
    <div class="route-opt" role="button" tabindex="0" aria-pressed="${i === selected}" data-i="${i}">
      <b>${esc(r.summary)}</b> ${r.label ? `<span class="badge info">${esc(r.label)}</span>` : ""}
      <dl>
        <dt>Distance</dt><dd>${fmtKm(r.distanceMeters)}</dd>
        <dt>Time</dt><dd>${fmtDuration(r.durationSec)}${$("#mode").value === "driving" ? ` <span class="small muted">(traffic-aware; ${fmtDuration(r.staticDurationSec)} without traffic)</span>` : ""}</dd>
        <dt>Nearby services</dt>${supportHtml(i)}
        <dt>Recorded incidents</dt>${safetyHtml(i)}
      </dl></div>`).join("");
}
function renderSteps() {
  const r = routes[selected];
  $("#steps").innerHTML = r.steps.length ? `<ol class="steps">${r.steps.map(s => `<li>${esc(s.text)} <span class="muted">(${fmtKm(s.distanceMeters || 0)})</span></li>`).join("")}</ol>` : `<p class="muted">Step-by-step directions are not available for this route.</p>`;
  $("#open-gmaps").href = googleMapsUrl({ origin, destination: dest, mode: $("#mode").value });
}
function select(i) { selected = i; draw(); renderList(); renderSteps(); }
$("#routes").addEventListener("click", e => { const o = e.target.closest("[data-i]"); if (o) select(+o.dataset.i); });
$("#routes").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const o = e.target.closest("[data-i]"); if (o) { e.preventDefault(); select(+o.dataset.i); } } });

$("#route-form").addEventListener("submit", async e => {
  e.preventDefault();
  origin = acO.get() || origin; dest = acD.get() || dest;
  if (!origin || !dest) return notice("#msg", "bad", "Pick both a starting address and a destination from the suggestions list.");
  const btn = $("#go"); btn.disabled = true; $("#results").hidden = true;
  notice("#msg", "info", `<span class="spinner"></span> Calculating routes…`);
  try {
    const mode = $("#mode").value;
    routes = await computeRoutes({ origin, destination: dest, mode });
    selected = 0; scoring = null; support = [];
    const b = new google.maps.LatLngBounds(); routes.forEach(r => r.path.forEach(p => b.extend(p))); map.fitBounds(b);
    draw(); $("#results").hidden = false; renderList(); renderSteps();
    notice("#msg", "info", routes.length > 1 ? `${routes.length} alternative routes found.` : "Google returned one route for this trip.");

    // Safety data (Firestore) — failures degrade to "unavailable", never to made-up values.
    const plain = routes.map(r => ({ ...r, path: r.path.map(p => ({ lat: p.lat(), lng: p.lng() })) }));
    try {
      const [records, sources] = await Promise.all([listSafetyRecordsInBox(boxForRoutes(plain, mapsConfig.corridorMeters)), listSafetySources()]);
      scoring = compareRoutes(plain, records, sources, { corridorMeters: mapsConfig.corridorMeters });
      $("#provenance").innerHTML = sources.length
        ? `<ul class="small">${sources.map(s => `<li><b>${esc(s.name)}</b> — ${esc(s.sourceType || "")}; coverage: ${esc(s.coverageDescription || "not stated")}; published ${esc(s.publishedAt || "unknown")}; retrieved ${fmtDate(s.retrievedAt)}; status ${esc(s.status)}</li>`).join("")}</ul>`
        : `<p class="small">No official safety dataset has been imported. See README → Data sources.</p>`;
    } catch (err) { console.error(err); $("#provenance").innerHTML = `<p class="small">Safety information unavailable (${esc(err.code || err.message)}).</p>`; }
    renderList();

    if ($("#include-support").checked) {
      support = await Promise.all(plain.map((r, i) => supportAlongRoute(routes[i])));
      renderList();
    }
  } catch (err) {
    console.error(err);
    const hint = { QUOTA: "Quota exceeded.", AUTH: "Check your Maps key, billing and enabled APIs.", ZERO_RESULTS: "Try different places or another travel mode.", INVALID_REQUEST: "Check both addresses.", NETWORK: "Check your connection." }[err.code] || "";
    notice("#msg", "bad", `${esc(err.message)} ${hint}`);
  } finally { btn.disabled = false; }
});

$("#save-journey").addEventListener("click", async () => {
  const r = routes[selected]; if (!r) return;
  try {
    await addJourney(user.uid, { originLabel: origin.label, destinationLabel: dest.label, mode: $("#mode").value, distanceMeters: r.distanceMeters, durationSec: r.durationSec, routeIndex: selected, status: "planned" });
    notice("#msg", "ok", "Journey saved to your account.");
  } catch (e) { notice("#msg", "bad", "Could not save the journey."); }
});

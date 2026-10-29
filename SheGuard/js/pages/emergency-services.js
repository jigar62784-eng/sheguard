/**
 * emergency-services.js — official numbers, nearby public services, and SOS.
 *
 * SOS HONESTY RULES
 *  - Location is shared ONLY if the user ticks the box AND the browser permission prompt is accepted.
 *  - The browser cannot send SMS/e-mail itself. We create an alert request in Firestore, then ask the
 *    Java backend to dispatch it. The backend writes per-recipient results back to the alert document.
 *  - "Delivered" is shown only when the backend recorded a provider delivery confirmation.
 *    "Accepted by provider" is shown separately and is NOT delivery.
 *  - If the backend or providers are not configured the UI says so; nothing is simulated.
 */
import { initPage } from "../guard.js";
import { listContacts, createAlert, getAlert } from "../db.js";
import { officialContacts } from "../data/official-contacts.js";
import { searchNearbySupport } from "../safety/support.js";
import { attachAutocomplete } from "../maps-loader.js";
import { mapsConfig, isMapsConfigured } from "../maps-config.js";
import { auth } from "../firebase.js";
import { $, esc, notice, fmtKm } from "../ui.js";
import { haversine } from "../safety/geo.js";

const { user, profile } = await initPage({ page: "emergency-services" });

/* ---- Official numbers (static, with sources) ---- */
$("#official").innerHTML = `<div class="table-wrap"><table><tbody>${officialContacts.map(c =>
  `<tr><td><a class="btn lamp small" href="tel:${c.number}">Call ${c.number}</a></td><td>${esc(c.label)}<br><a class="small" href="${c.source}" rel="noopener" target="_blank">Source</a></td></tr>`).join("")}</tbody></table></div>
  <p class="hint">Numbers can vary by state. Confirm on the linked official source.</p>`;

/* ---- Nearby services ---- */
let origin = null;
function renderPlaces(places) {
  $("#nearby").innerHTML = places.length ? `<div class="table-wrap"><table><thead><tr><th>Place</th><th>Type</th><th>Distance</th><th></th></tr></thead><tbody>${places.map(p =>
    `<tr><td><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.address || "")}${p.phone ? " · " + esc(p.phone) : ""}</span></td>
     <td>${p.types.map(t => `<span class="badge info">${esc(t.replace("_", " "))}</span>`).join(" ")}</td><td>${fmtKm(p.distance)}</td>
     <td><a class="btn secondary small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${p.lat},${p.lng}&destination_place_id=${encodeURIComponent(p.id)}">Directions</a></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">No police stations, hospitals or fire stations found within 3 km in Google Maps listings. Safety information unavailable for this area.</div>`;
}
async function findNear(center) {
  origin = center; notice("#nearby-msg", "info", `<span class="spinner"></span> Searching…`);
  try {
    const places = (await searchNearbySupport(center, 3000)).map(p => ({ ...p, distance: haversine(center, p) })).sort((a, b) => a.distance - b.distance);
    notice("#nearby-msg", "warn", "These are Google Maps listings. SheGuard has not independently verified them — call ahead in an emergency.");
    renderPlaces(places);
  } catch (e) { console.error(e); notice("#nearby-msg", "bad", `Could not search nearby services: ${esc(e.message)}`); }
}
if (!isMapsConfigured) notice("#nearby-msg", "warn", "Google Maps key not configured (js/maps-config.js), so nearby search is unavailable. Official numbers above still work.");
else {
  const ac = await attachAutocomplete($("#area-ac"), { placeholder: "Search an area or address", onChange: v => findNear(v) }).catch(e => notice("#nearby-msg", "bad", esc(e.message)));
  $("#use-location").addEventListener("click", () => {
    if (!navigator.geolocation) return notice("#nearby-msg", "bad", "This browser does not support location.");
    navigator.geolocation.getCurrentPosition(
      pos => findNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => notice("#nearby-msg", "bad", err.code === 1 ? "Location permission was denied. Search an area instead." : "Could not get your location."),
      { enableHighAccuracy: true, timeout: 10000 });
  });
}

/* ---- SOS to trusted contacts ---- */
const sosBox = $("#sos-contacts");
let contacts = [];
try {
  contacts = (await listContacts(user.uid)).filter(c => c.consent);
  sosBox.innerHTML = contacts.length
    ? contacts.map(c => `<label class="check"><input type="checkbox" name="sos" value="${c.id}" checked> ${esc(c.name)} (${esc(c.phone)})</label>`).join("")
    : `<p class="muted">No contacts who have agreed to alerts. <a href="trusted-contacts.html">Add a trusted contact</a>.</p>`;
} catch (e) { notice("#sos-msg", "bad", "Could not load contacts."); }
$("#share-loc").checked = profile?.privacy?.locationSharingDefault === true && false; // never pre-tick: consent must be given per alert

const STATUS_TEXT = {
  not_configured: ["Not sent — no notification provider is configured on the backend.", "warn"],
  failed: ["Failed — the provider rejected the message.", "bad"],
  accepted_by_provider: ["Accepted by provider (delivery not yet confirmed).", "info"],
  delivered: ["Delivered (confirmed by provider).", "ok"],
  undelivered: ["Provider reported the message was not delivered.", "bad"]
};
function renderAlert(a) {
  const rows = (a.deliveries || []).map(d => {
    const [t, k] = STATUS_TEXT[d.status] || [d.status, "neutral"];
    const c = contacts.find(x => x.id === d.contactId);
    return `<li>${esc(c?.name || d.contactId)} via ${esc(d.channel)}: <span class="badge ${k}">${esc(t)}</span></li>`;
  }).join("");
  $("#sos-result").innerHTML = `<div class="notice ${a.status === "completed" ? "" : "warn"}"><b>Alert status: ${esc(a.status.replace("_", " "))}</b>
    ${a.locationShared ? "<br>Location included (you consented)." : "<br>Location not included."}<ul>${rows}</ul>
    ${a.error ? `<p class="small">${esc(a.error)}</p>` : ""}<p class="small">If you are in danger, call <a href="tel:112">112</a> now. This tool is not a substitute.</p></div>`;
}

async function dispatch(alertId) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${mapsConfig.backendBaseUrl}/api/alerts/${alertId}/dispatch`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
}

let lastAlertId = null;
async function send() {
  const ids = [...document.querySelectorAll('input[name="sos"]:checked')].map(i => i.value);
  if (!ids.length) return notice("#sos-msg", "bad", "Choose at least one contact.");
  let location = null;
  if ($("#share-loc").checked) {
    try {
      const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 10000 }));
      location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch { return notice("#sos-msg", "bad", "Location permission was denied or unavailable. Untick “share my location” to send without it."); }
  }
  if (!confirm(`Send an SOS alert to ${ids.length} contact(s)${location ? " including your current location" : ""}?`)) return;
  $("#sos-send").disabled = true; notice("#sos-msg", "info", `<span class="spinner"></span> Creating alert…`);
  try {
    lastAlertId = await createAlert(user.uid, { shareLocation: !!location, location, contactIds: ids });
    await trySend();
  } catch (e) { console.error(e); notice("#sos-msg", "bad", `Could not create the alert: ${esc(e.message)}`); }
  $("#sos-send").disabled = false;
}
async function trySend() {
  try {
    await dispatch(lastAlertId);
    notice("#sos-msg", "info", "Dispatch requested. Checking results…");
    for (let i = 0; i < 6; i++) { // poll briefly; provider confirmations can arrive later
      const a = await getAlert(user.uid, lastAlertId);
      if (a) renderAlert(a);
      if (a && !["requested", "dispatching"].includes(a.status)) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    notice("#sos-msg", "", "");
  } catch (e) {
    console.error(e);
    notice("#sos-msg", "bad", `<b>Nobody has been notified.</b> The alert was saved but the notification backend could not be reached (${esc(e.message)}). Call 112 or phone your contacts directly. <button class="btn small" id="retry">Retry</button>`);
    $("#retry")?.addEventListener("click", trySend);
  }
}
$("#sos-send").addEventListener("click", send);

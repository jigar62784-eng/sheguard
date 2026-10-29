/**
 * dashboard.js — live summary. Every number comes from Firestore queries for the signed-in user.
 * Nothing is sample data; empty accounts show zeros and empty-state messages.
 */
import { initPage } from "../guard.js";
import { listMyReports, listContacts, listJourneys, listAlerts, listSafetySources } from "../db.js";
import { $, esc, fmtDate, notice } from "../ui.js";
import { isMapsConfigured } from "../maps-config.js";

const { user, profile } = await initPage({ page: "dashboard" });
$("#greeting").textContent = `Hello${(profile?.displayName || user.displayName) ? ", " + (profile?.displayName || user.displayName) : ""}`;

const results = await Promise.allSettled([listMyReports(user.uid), listContacts(user.uid), listJourneys(user.uid, 5), listAlerts(user.uid, 5), listSafetySources()]);
const [reports, contacts, journeys, alerts, sources] = results.map(r => (r.status === "fulfilled" ? r.value : null));
if (results.some(r => r.status === "rejected")) {
  notice("#status", "bad", "Some data could not be loaded. Check your connection, and that firestore.rules and indexes are deployed (README → Firebase setup).");
  console.error(results.filter(r => r.status === "rejected").map(r => r.reason));
}
const n = v => (v ? v.length : "—");
$("#stat-reports").textContent = n(reports);
$("#stat-open").textContent = reports ? reports.filter(r => r.status !== "closed").length : "—";
$("#stat-contacts").textContent = n(contacts);
$("#stat-journeys").textContent = n(journeys);

$("#recent-reports").innerHTML = reports?.length
  ? `<ul>${reports.slice(0, 5).map(r => `<li><b>${esc(r.reference)}</b> — ${esc(r.category)} <span class="badge neutral">${esc(r.status.replace("_", " "))}</span> <span class="muted small">${fmtDate(r.createdAt)}</span></li>`).join("")}</ul>`
  : `<div class="empty">No reports yet. <a href="report-incident.html">Report an incident</a></div>`;

$("#recent-alerts").innerHTML = alerts?.length
  ? `<ul>${alerts.map(a => `<li>${fmtDate(a.createdAt)} — <span class="badge ${a.deliverySummary?.delivered ? "ok" : a.status === "failed" ? "bad" : "neutral"}">${esc(a.status.replace("_", " "))}</span></li>`).join("")}</ul>`
  : `<p class="muted">No SOS alerts sent from this account.</p>`;

$("#data-sources").innerHTML = sources?.length
  ? `<ul>${sources.map(s => `<li><b>${esc(s.name)}</b> <span class="badge ${s.status === "ok" ? "ok" : "warn"}">${esc(s.status)}</span><br><span class="muted small">Coverage: ${esc(s.coverageDescription || "not stated")} · Retrieved ${fmtDate(s.retrievedAt)}</span></li>`).join("")}</ul>`
  : `<div class="notice warn">No official safety dataset has been imported yet. Route comparison will show “Insufficient safety data”. See README → “Data sources”.</div>`;

if (!isMapsConfigured) $("#maps-warning").innerHTML = `<div class="notice warn">Google Maps key not configured — route planning and nearby services are disabled. Edit <code>js/maps-config.js</code>.</div>`;

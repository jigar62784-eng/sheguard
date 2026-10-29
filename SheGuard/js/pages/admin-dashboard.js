/**
 * admin-dashboard.js — reviewer tools. Visible only to accounts with the `admin` custom claim;
 * the claim is checked again by Firestore rules on every read/write.
 * Reviewers update report status; every change writes an append-only audit log entry.
 */
import { initPage } from "../guard.js";
import { adminListReports, adminUpdateReport, adminListAudit, listSafetySources } from "../db.js";
import { auth } from "../firebase.js";
import { mapsConfig } from "../maps-config.js";
import { $, esc, fmtDate, notice, loading, authMessage } from "../ui.js";

const { user } = await initPage({ page: "admin-dashboard", adminOnly: true });

async function renderReports() {
  loading("#reports");
  const rows = await adminListReports();
  const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  $("#counts").innerHTML = ["saved", "under_review", "closed"].map(s => `<div class="card stat"><b>${counts[s] || 0}</b><span>${s.replace("_", " ")}</span></div>`).join("");
  $("#reports").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Category</th><th>Location (general)</th><th>Status</th><th>Review</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><code>${esc(r.reference)}</code><br><span class="small muted">${fmtDate(r.createdAt)}</span></td>
      <td>${esc(r.category)}<br><span class="small muted">${esc((r.description || "").slice(0, 140))}</span></td>
      <td>${esc(r.generalLocation?.label)}</td><td><span class="badge neutral">${esc(r.status)}</span></td>
      <td><select data-ref="${esc(r.reference)}" aria-label="Status for ${esc(r.reference)}"><option value="saved" ${r.status === "saved" ? "selected" : ""}>saved</option><option value="under_review" ${r.status === "under_review" ? "selected" : ""}>under review</option><option value="closed" ${r.status === "closed" ? "selected" : ""}>closed</option></select>
      <input data-note="${esc(r.reference)}" placeholder="Note to reporter (optional)" value="${esc(r.reviewerNote || "")}" maxlength="500" style="margin:.3rem 0">
      <button class="btn small" data-save="${esc(r.reference)}">Save</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">No reports yet.</div>`;
}
async function renderAudit() {
  const logs = await adminListAudit();
  $("#audit").innerHTML = logs.length ? `<ul class="small">${logs.map(l => `<li>${fmtDate(l.createdAt)} — ${esc(l.action)} on <code>${esc(l.target)}</code> by <code>${esc(l.actorUid)}</code></li>`).join("")}</ul>` : `<p class="muted">No audit entries.</p>`;
}
async function renderSources() {
  const s = await listSafetySources();
  $("#sources").innerHTML = s.length ? `<div class="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Records</th><th>Published</th><th>Retrieved</th><th></th></tr></thead><tbody>${s.map(x =>
    `<tr><td><b>${esc(x.name)}</b><br><span class="small muted">${esc(x.coverageDescription || "")}</span></td><td><span class="badge ${x.status === "ok" ? "ok" : "warn"}">${esc(x.status)}</span><br><span class="small">${esc(x.statusDetail || "")}</span></td>
     <td>${esc(x.recordCount ?? "—")}</td><td>${esc(x.publishedAt || "—")}</td><td>${fmtDate(x.retrievedAt)}</td>
     <td><button class="btn secondary small" data-refresh="${esc(x.id)}">Refresh</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">No sources registered. Start java-backend and press “Register/refresh sources”.</div>`;
}
$("#reports").addEventListener("click", async ev => {
  const b = ev.target.closest("[data-save]"); if (!b) return;
  const ref = b.dataset.save;
  try {
    await adminUpdateReport(user.uid, ref, { status: $(`select[data-ref="${CSS.escape(ref)}"]`).value, reviewerNote: $(`input[data-note="${CSS.escape(ref)}"]`).value.trim() });
    notice("#msg", "ok", `Updated ${esc(ref)}.`); await Promise.all([renderReports(), renderAudit()]);
  } catch (e) { notice("#msg", "bad", authMessage(e)); }
});
async function callBackend(path) {
  const token = await auth.currentUser.getIdToken(true); // force refresh so the admin claim is current
  const res = await fetch(`${mapsConfig.backendBaseUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Backend responded ${res.status}`);
  return body;
}
$("#sources").addEventListener("click", async ev => {
  const b = ev.target.closest("[data-refresh]"); if (!b) return;
  b.disabled = true;
  try { const r = await callBackend(`/api/admin/safety/refresh/${encodeURIComponent(b.dataset.refresh)}`); notice("#msg", r.status === "ok" ? "ok" : "warn", esc(r.message || r.status)); }
  catch (e) { notice("#msg", "bad", `Refresh failed: ${esc(e.message)}`); }
  await renderSources();
});
$("#register-sources").addEventListener("click", async () => {
  try { const r = await callBackend("/api/admin/safety/register"); notice("#msg", "ok", esc(r.message)); await renderSources(); }
  catch (e) { notice("#msg", "bad", `Could not reach the backend: ${esc(e.message)}`); }
});
try { await Promise.all([renderReports(), renderAudit(), renderSources()]); } catch (e) { console.error(e); notice("#msg", "bad", authMessage(e)); }

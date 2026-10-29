/**
 * my-reports.js — private report history. Distinguishes three separate facts:
 *   1) saved to SheGuard  2) submitted to an agency  3) acknowledged by an agency.
 * (2) and (3) are only shown as "yes" if a real integration has set them — none exists in this build.
 */
import { initPage } from "../guard.js";
import { listMyReports, evidenceUrl } from "../db.js";
import { $, esc, fmtDate, notice, loading } from "../ui.js";

const { user } = await initPage({ page: "my-reports" });
const box = $("#list");
loading(box);
const STATUS = { saved: ["Saved to SheGuard", "info"], under_review: ["Under review", "warn"], closed: ["Closed", "neutral"] };

try {
  const reports = await listMyReports(user.uid);
  if (!reports.length) { box.innerHTML = `<div class="empty">You have not submitted any reports. <a href="report-incident.html">Report an incident</a></div>`; }
  else {
    box.innerHTML = reports.map(r => {
      const [label, kind] = STATUS[r.status] || [r.status, "neutral"];
      return `<article class="card" style="margin-bottom:1rem">
        <div class="row spread"><h2 style="margin:0">${esc(r.reference)}</h2><span class="badge ${kind}">${esc(label)}</span></div>
        <p class="muted small">${esc(r.category)} · occurred ${fmtDate(r.occurredAt)} · saved ${fmtDate(r.createdAt)} · ${esc(r.generalLocation?.label)}${r.anonymous ? " · hidden from reviewers" : ""}</p>
        ${r.description ? `<p>${esc(r.description)}</p>` : ""}
        <ul class="small">
          <li>Saved to SheGuard: <span class="badge ok">yes</span></li>
          <li>Submitted to an agency: <span class="badge ${r.agency?.submitted ? "ok" : "neutral"}">${r.agency?.submitted ? "yes" : "no — not submitted"}</span></li>
          <li>Acknowledged by an agency: <span class="badge ${r.agency?.acknowledged ? "ok" : "neutral"}">${r.agency?.acknowledged ? "yes" : "no"}</span></li>
        </ul>
        ${r.reviewerNote ? `<p class="notice small"><b>Reviewer note:</b> ${esc(r.reviewerNote)}</p>` : ""}
        ${(r.evidence || []).length ? `<p class="small">Evidence: ${r.evidence.map((e, i) => `<a href="#" data-path="${esc(e.path)}">${esc(e.name)}</a>`).join(", ")}</p>` : ""}
      </article>`;
    }).join("");
    // Download URLs are fetched on click (they are tokenised and only available to the owner/reviewers).
    box.addEventListener("click", async ev => {
      const a = ev.target.closest("a[data-path]"); if (!a) return;
      ev.preventDefault();
      try { window.open(await evidenceUrl(a.dataset.path), "_blank", "noopener"); } catch { notice("#msg", "bad", "Could not open that file."); }
    });
  }
} catch (e) {
  console.error(e);
  box.innerHTML = "";
  notice("#msg", "bad", "Could not load your reports. If this is a new project, deploy firestore.rules and firestore.indexes.json (README → Firebase setup).");
}

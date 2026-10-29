/**
 * report-incident.js — incident submission workflow.
 * Saves to Firestore (reports + reportOwners) and uploads optional evidence to Cloud Storage.
 * The confirmation screen says "saved to SheGuard" only — no agency delivery is claimed.
 */
import { initPage } from "../guard.js";
import { createReport, attachEvidence } from "../db.js";
import { attachAutocomplete } from "../maps-loader.js";
import { isMapsConfigured } from "../maps-config.js";
import { $, esc, notice, authMessage } from "../ui.js";

const { user } = await initPage({ page: "report-incident" });
const MAX_FILES = 3, MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"];

// Location: Places autocomplete if Maps is configured; otherwise plain text (coordinates stay null).
let place = null;
if (isMapsConfigured) {
  const ac = await attachAutocomplete($("#location-ac"), { placeholder: "Area, landmark or street (general location)" }).catch(e => { console.error(e); return null; });
  if (ac) { $("#location-text").hidden = true; place = ac; }
}
// Don't allow future dates.
$("#when").max = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

$("#report-form").addEventListener("submit", async e => {
  e.preventDefault();
  const out = $("#msg"), btn = $("#submit");
  const files = [...$("#evidence").files];
  if (files.length > MAX_FILES) return notice(out, "bad", `Attach at most ${MAX_FILES} files.`);
  const badFile = files.find(f => !ALLOWED.includes(f.type) || f.size > MAX_BYTES);
  if (badFile) return notice(out, "bad", `“${esc(badFile.name)}” is not allowed. Use JPEG, PNG, WebP, PDF or MP4 up to 10 MB.`);
  const p = place?.get();
  const label = (p?.label || $("#location-text").value).trim();
  if (!label) return notice(out, "bad", "Add a general location (area or landmark).");

  btn.disabled = true; notice(out, "info", `<span class="spinner"></span> Saving your report…`);
  try {
    const reference = await createReport(user.uid, {
      category: $("#category").value, occurredAt: new Date($("#when").value),
      locationLabel: label, lat: p?.lat ?? null, lng: p?.lng ?? null,
      description: $("#description").value.trim(), anonymous: $("#anonymous").checked
    });
    let evidenceNote = "";
    if (files.length) {
      try { await attachEvidence(reference, files); evidenceNote = ` ${files.length} file(s) uploaded.`; }
      catch (err) { console.error(err); evidenceNote = ` <b>Evidence upload failed</b> (${esc(authMessage(err))}); your report itself is saved.`; }
    }
    $("#report-form").hidden = true;
    notice(out, "ok", `<b>Report saved to SheGuard.</b><br>Reference: <code>${esc(reference)}</code>.${evidenceNote}<br>
      <span class="small">This is <u>not</u> a police complaint. SheGuard has no agency integration configured, so nothing has been sent to or acknowledged by any police authority.
      To file an official complaint, contact your local police or use <a href="https://cybercrime.gov.in/" rel="noopener">cybercrime.gov.in</a> for cyber offences. In an emergency call 112.</span><br>
      <a href="my-reports.html">View my reports</a>`);
  } catch (err) {
    console.error(err);
    notice(out, "bad", `Could not save the report: ${esc(authMessage(err))}`);
    btn.disabled = false;
  }
});

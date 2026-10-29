/**
 * ui.js — tiny DOM helpers shared by all pages (no framework).
 * IMPORTANT: user-supplied text must go through esc() or textContent — never innerHTML directly.
 */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape text for safe insertion into HTML strings. */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Show a status message in a container: kind = ok | warn | bad | info. */
export function notice(container, kind, html) {
  const el = typeof container === "string" ? $(container) : container;
  if (!el) return;
  el.innerHTML = html ? `<div class="notice ${kind === "info" ? "" : kind}" role="${kind === "bad" ? "alert" : "status"}">${html}</div>` : "";
}

export function loading(container, text = "Loading…") {
  const el = typeof container === "string" ? $(container) : container;
  if (el) el.innerHTML = `<p class="muted"><span class="spinner" aria-hidden="true"></span> ${esc(text)}</p>`;
}

export function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null;
  return d && !isNaN(d) ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
}
export const fmtKm = m => (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m");
export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Friendly text for Firebase error codes. */
export function authMessage(err) {
  const c = err?.code || "";
  const map = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account uses that email.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes or reset your password.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in the Firebase console (Authentication → Sign-in method).",
    "auth/requires-recent-login": "For security, log in again before making this change.",
    "permission-denied": "You do not have permission to do that (Firestore/Storage rules refused the request).",
    "unavailable": "Firebase is unreachable right now. Try again shortly."
  };
  return map[c] || map[c.replace("firestore/", "")] || (err?.message || "Something went wrong.");
}

/** Banner shown when js/firebase-config.js still holds placeholders. */
export function setupBanner() {
  return `<div class="notice bad" role="alert"><b>Firebase is not configured.</b> Open <code>js/firebase-config.js</code> and paste your project's web config, then reload. See README → "Firebase setup".</div>`;
}

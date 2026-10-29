/**
 * guard.js — page bootstrap for protected pages.
 *   const { user, profile, isAdmin } = await initPage({ page: "dashboard" });
 * - Redirects to login.html (with ?next=) when signed out.
 * - Builds the shared sidebar.
 * - Applies analytics consent from the user's profile.
 * NOTE: this is a UX convenience ONLY. Real authorization is enforced by firestore.rules / storage.rules.
 */
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, isFirebaseConfigured, applyAnalyticsConsent } from "./firebase.js";
import { getProfile } from "./db.js";
import { logout } from "./auth.js";
import { $, esc, setupBanner } from "./ui.js";

const NAV = [
  ["dashboard", "dashboard.html", "Dashboard"],
  ["safe-routes", "safe-routes.html", "Safe routes"],
  ["report-incident", "report-incident.html", "Report an incident"],
  ["my-reports", "my-reports.html", "My reports"],
  ["emergency-services", "emergency-services.html", "Emergency services"],
  ["trusted-contacts", "trusted-contacts.html", "Trusted contacts"],
  ["settings", "settings.html", "Settings"]
];

function buildSidebar(page, user, isAdmin) {
  const sb = $("#sidebar");
  if (!sb) return;
  sb.innerHTML = `
    <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span>SheGuard</a>
    <nav aria-label="Main"><ul class="nav">
      ${NAV.map(([id, href, label]) => `<li><a href="${href}" ${id === page ? 'aria-current="page"' : ""}>${label}</a></li>`).join("")}
      ${isAdmin ? `<li class="nav-sep"></li><li><a href="admin-dashboard.html" ${page === "admin-dashboard" ? 'aria-current="page"' : ""}>Admin review</a></li>` : ""}
    </ul></nav>
    <p class="sidebar-user">${esc(user.displayName || user.email)}</p>
    <button class="btn secondary small" id="logout-btn" style="color:#fff;border-color:#6d7d8a">Log out</button>`;
  $("#logout-btn").addEventListener("click", async () => { await logout(); location.href = "login.html"; });
  const mb = $("#menu-btn");
  if (mb) mb.addEventListener("click", () => {
    const open = sb.classList.toggle("open");
    mb.setAttribute("aria-expanded", String(open));
  });
}

export function initPage({ page, adminOnly = false }) {
  return new Promise(resolve => {
    if (!isFirebaseConfigured) {
      const c = $("#content");
      if (c) c.innerHTML = setupBanner();
      return; // never resolves: nothing can work without Firebase
    }
    onAuthStateChanged(auth, async user => {
      if (!user) { location.replace(`login.html?next=${encodeURIComponent(location.pathname.split("/").pop())}`); return; }
      const [profile, token] = await Promise.all([getProfile(user.uid).catch(() => null), user.getIdTokenResult()]);
      const isAdmin = token.claims.admin === true; // custom claim set server-side (see README)
      if (adminOnly && !isAdmin) {
        $("#content").innerHTML = `<div class="notice bad" role="alert">This page is for authorised reviewers. Your account does not have the admin role.</div>`;
        buildSidebar(page, user, false);
        return;
      }
      buildSidebar(page, user, isAdmin);
      applyAnalyticsConsent(profile?.privacy?.analytics === true);
      resolve({ user, profile, isAdmin });
    });
  });
}

/** For login/register pages: bounce signed-in users onward. */
export function redirectIfSignedIn() {
  if (!isFirebaseConfigured) return;
  onAuthStateChanged(auth, user => {
    if (user) location.replace(new URLSearchParams(location.search).get("next")?.match(/^[\w-]+\.html$/)?.[0] || "dashboard.html");
  });
}

/**
 * settings.js — profile, privacy and account controls.
 * Deleting the account removes personal data we hold (profile, contacts, journeys, alerts, report links).
 * Report CONTENT is kept without any link to the account, so reviewers' records stay intact but unlinked.
 */
import {
  updatePassword, deleteUser, reauthenticateWithCredential, reauthenticateWithPopup,
  EmailAuthProvider, GoogleAuthProvider, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initPage } from "../guard.js";
import { applyAnalyticsConsent, db } from "../firebase.js";
import { updateProfileDoc } from "../db.js";
import { $, notice, authMessage } from "../ui.js";
import { doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const { user, profile } = await initPage({ page: "settings" });
$("#name").value = profile?.displayName || user.displayName || "";
$("#phone").value = profile?.phone || "";
$("#email").value = user.email || "";
$("#analytics").checked = profile?.privacy?.analytics === true;
$("#loc-default").checked = profile?.privacy?.locationSharingDefault === true;

$("#profile-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await updateProfile(user, { displayName: $("#name").value.trim() });
    await updateProfileDoc(user.uid, {
      displayName: $("#name").value.trim(), phone: $("#phone").value.trim(),
      "privacy.analytics": $("#analytics").checked, "privacy.locationSharingDefault": $("#loc-default").checked
    });
    await applyAnalyticsConsent($("#analytics").checked);
    notice("#msg", "ok", "Settings saved.");
  } catch (err) { notice("#msg", "bad", authMessage(err)); }
});

$("#password-form").addEventListener("submit", async e => {
  e.preventDefault();
  const pw = $("#new-password").value;
  if (pw.length < 8) return notice("#pw-msg", "bad", "Use at least 8 characters.");
  try { await updatePassword(user, pw); e.target.reset(); notice("#pw-msg", "ok", "Password changed."); }
  catch (err) { notice("#pw-msg", "bad", authMessage(err)); }
});

/** Re-authenticate (required by Firebase before destructive account changes). */
async function reauth() {
  if (user.providerData.some(p => p.providerId === "google.com")) return reauthenticateWithPopup(user, new GoogleAuthProvider());
  const pw = prompt("Enter your password to confirm:");
  if (!pw) throw new Error("Cancelled.");
  return reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
}

$("#delete-btn").addEventListener("click", async () => {
  if (!confirm("Delete your account and personal data? This cannot be undone.")) return;
  try {
    await reauth();
    for (const sub of ["contacts", "journeys", "alerts"]) {
      const s = await getDocs(collection(db, "users", user.uid, sub));
      await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
    }
    const links = await getDocs(query(collection(db, "reportOwners"), where("uid", "==", user.uid)));
    await Promise.all(links.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "users", user.uid));
    await deleteUser(user);
    location.href = "index.html";
  } catch (err) { console.error(err); notice("#msg", "bad", authMessage(err)); }
});

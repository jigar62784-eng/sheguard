/**
 * firebase.js — initialises Firebase ONCE and exports the service handles.
 * Every other module imports from here; nothing else calls initializeApp().
 * Uses the modular Firebase Web SDK from Google's CDN (no bundler needed).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getAnalytics, isSupported, setAnalyticsCollectionEnabled } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

export { isFirebaseConfigured };
export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

let analytics = null;
/**
 * Analytics is OFF unless the user opted in (settings page → users/{uid}.privacy.analytics).
 * Called from guard.js after the profile loads. Safe to call repeatedly.
 */
export async function applyAnalyticsConsent(allowed) {
  if (!app || !firebaseConfig.measurementId || String(firebaseConfig.measurementId).startsWith("REPLACE_WITH")) return;
  if (!(await isSupported())) return;
  analytics = analytics || getAnalytics(app);
  setAnalyticsCollectionEnabled(analytics, !!allowed);
}

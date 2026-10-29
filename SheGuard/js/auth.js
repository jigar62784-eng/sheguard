/**
 * auth.js — authentication actions (register, login, Google, logout, reset).
 * Passwords are handled ONLY by Firebase Authentication; they are never written to Firestore.
 * A matching users/{uid} profile document is created on first sign-in.
 */
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  updateProfile, setPersistence, browserLocalPersistence, browserSessionPersistence,
  GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "./firebase.js";

/** Create the profile document if it does not exist yet. */
async function ensureProfile(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, {
    displayName: user.displayName || extra.displayName || "",
    email: user.email || "",
    phone: extra.phone || "",
    privacy: { analytics: false, locationSharingDefault: false }, // everything opt-in
    createdAt: serverTimestamp()
  });
}

/** remember=true → persist across browser restarts; false → this tab/session only. */
async function applyPersistence(remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

export async function register({ name, email, password, phone }) {
  await applyPersistence(true);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await ensureProfile(cred.user, { displayName: name, phone });
  return cred.user;
}

export async function login({ email, password, remember }) {
  await applyPersistence(remember);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureProfile(cred.user);
  return cred.user;
}

/** Requires the Google provider to be enabled in the Firebase console. */
export async function loginWithGoogle() {
  await applyPersistence(true);
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  await ensureProfile(cred.user);
  return cred.user;
}

export const logout = () => signOut(auth);
export const resetPassword = email => sendPasswordResetEmail(auth, email);

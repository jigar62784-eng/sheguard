/**
 * auth-pages.js — logic for login.html, register.html and the reset-password form.
 * The page declares which form it contains via <body data-page="login|register">.
 */
import { isFirebaseConfigured } from "../firebase.js";
import { login, register, loginWithGoogle, resetPassword } from "../auth.js";
import { redirectIfSignedIn } from "../guard.js";
import { $, notice, authMessage, setupBanner } from "../ui.js";

const page = document.body.dataset.page;
const msg = $("#msg");
if (!isFirebaseConfigured) msg.innerHTML = setupBanner();
redirectIfSignedIn();

/** Only allow redirects to our own html pages (prevents open-redirect abuse of ?next=). */
const nextPage = () => new URLSearchParams(location.search).get("next")?.match(/^[\w-]+\.html$/)?.[0] || "dashboard.html";

async function run(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { notice(msg, "bad", authMessage(e)); } finally { btn.disabled = false; }
}

if (page === "login") {
  $("#login-form").addEventListener("submit", e => {
    e.preventDefault();
    run($("#submit"), async () => {
      await login({ email: $("#email").value.trim(), password: $("#password").value, remember: $("#remember").checked });
      location.href = nextPage();
    });
  });
  $("#google").addEventListener("click", () => run($("#google"), async () => { await loginWithGoogle(); location.href = nextPage(); }));
  $("#forgot").addEventListener("click", () => run($("#forgot"), async () => {
    const email = $("#email").value.trim();
    if (!email) throw Object.assign(new Error("Enter your email above first, then choose “Forgot password”."), {});
    await resetPassword(email);
    // Same wording whether or not the account exists (avoids revealing which emails are registered).
    notice(msg, "ok", "If an account exists for that email, a reset link is on its way.");
  }));
}

if (page === "register") {
  $("#register-form").addEventListener("submit", e => {
    e.preventDefault();
    run($("#submit"), async () => {
      const password = $("#password").value;
      if (password.length < 8) throw { code: "auth/weak-password" };
      if (password !== $("#confirm").value) throw new Error("The two passwords do not match.");
      await register({ name: $("#name").value.trim(), email: $("#email").value.trim(), password, phone: $("#phone").value.trim() });
      location.href = "dashboard.html";
    });
  });
  $("#google").addEventListener("click", () => run($("#google"), async () => { await loginWithGoogle(); location.href = "dashboard.html"; }));
}

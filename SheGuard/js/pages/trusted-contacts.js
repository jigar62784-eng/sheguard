/**
 * trusted-contacts.js — CRUD for users/{uid}/contacts. Rules restrict access to the owner.
 * A contact is only used by SOS when the user ticks "this person agreed to receive alerts".
 */
import { initPage } from "../guard.js";
import { listContacts, addContact, updateContact, deleteContact } from "../db.js";
import { $, esc, notice, loading, authMessage } from "../ui.js";

const { user } = await initPage({ page: "trusted-contacts" });
let editingId = null, cache = [];

async function render() {
  loading("#list");
  try {
    cache = await listContacts(user.uid);
    $("#list").innerHTML = cache.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Consent</th><th></th></tr></thead><tbody>
      ${cache.map(c => `<tr><td>${esc(c.name)}<br><span class="muted small">${esc(c.relationship || "")}</span></td><td>${esc(c.phone)}</td><td>${esc(c.email || "—")}</td>
      <td><span class="badge ${c.consent ? "ok" : "warn"}">${c.consent ? "agreed" : "not confirmed"}</span></td>
      <td><button class="btn secondary small" data-edit="${c.id}">Edit</button> <button class="btn danger small" data-del="${c.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">No trusted contacts yet. Add someone who has agreed to receive your SOS alerts.</div>`;
  } catch (e) { console.error(e); $("#list").innerHTML = ""; notice("#msg", "bad", authMessage(e)); }
}

$("#contact-form").addEventListener("submit", async e => {
  e.preventDefault();
  const phone = $("#phone").value.replace(/[\s-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return notice("#msg", "bad", "Enter the phone number in international format, e.g. +919876543210.");
  const data = { name: $("#name").value.trim(), phone, email: $("#email").value.trim(), relationship: $("#relationship").value.trim(), consent: $("#consent").checked };
  try {
    if (editingId) await updateContact(user.uid, editingId, data); else await addContact(user.uid, data);
    editingId = null; e.target.reset(); $("#submit").textContent = "Add contact";
    notice("#msg", "ok", "Contact saved."); await render();
  } catch (err) { console.error(err); notice("#msg", "bad", authMessage(err)); }
});

$("#list").addEventListener("click", async ev => {
  const ed = ev.target.closest("[data-edit]"), del = ev.target.closest("[data-del]");
  if (ed) {
    const c = cache.find(x => x.id === ed.dataset.edit); editingId = c.id;
    $("#name").value = c.name; $("#phone").value = c.phone; $("#email").value = c.email || ""; $("#relationship").value = c.relationship || ""; $("#consent").checked = !!c.consent;
    $("#submit").textContent = "Save changes"; $("#name").focus();
  }
  if (del && confirm("Delete this contact?")) {
    try { await deleteContact(user.uid, del.dataset.del); await render(); } catch (err) { notice("#msg", "bad", authMessage(err)); }
  }
});
await render();


/**
 * db.js — All Firestore/Storage access lives here (data layer).
 *
 * Collections:
 *   users/{uid}
 *   users/{uid}/contacts/{id}
 *   users/{uid}/journeys/{id}
 *   users/{uid}/alerts/{id}
 *   reports/{reference}
 *   reportOwners/{reference}
 *   safetySources/{sourceId}
 *   safetyRecords/{id}
 *   auditLogs/{id}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  ref as sref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

import { auth, db, storage } from "./firebase.js";

/* ---------------- Profile ---------------- */

export async function getProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export const updateProfileDoc = (uid, data) =>
  updateDoc(doc(db, "users", uid), data);

/* ---------------- Trusted contacts ---------------- */

const contactsCol = uid =>
  collection(db, "users", uid, "contacts");

export async function listContacts(uid) {
  const snapshot = await getDocs(
    query(contactsCol(uid), orderBy("createdAt", "desc"))
  );

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export const addContact = (uid, contact) =>
  addDoc(contactsCol(uid), {
    ...contact,
    createdAt: serverTimestamp()
  });

export const updateContact = (uid, id, contact) =>
  updateDoc(doc(db, "users", uid, "contacts", id), contact);

export const deleteContact = (uid, id) =>
  deleteDoc(doc(db, "users", uid, "contacts", id));

/* ---------------- Journeys ---------------- */

export const addJourney = (uid, journey) =>
  addDoc(collection(db, "users", uid, "journeys"), {
    ...journey,
    createdAt: serverTimestamp()
  });

export async function listJourneys(uid, n = 10) {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "journeys"),
      orderBy("createdAt", "desc"),
      limit(n)
    )
  );

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

/* ---------------- SOS alerts ---------------- */

/**
 * Creates an alert request.
 * Delivery results must be written by the backend.
 */
export async function createAlert(
  uid,
  { shareLocation, location, contactIds }
) {
  const result = await addDoc(
    collection(db, "users", uid, "alerts"),
    {
      status: "requested",
      locationShared: !!shareLocation,
      location: shareLocation && location ? location : null,
      contactIds,
      createdAt: serverTimestamp()
    }
  );

  return result.id;
}

export async function listAlerts(uid, n = 10) {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "alerts"),
      orderBy("createdAt", "desc"),
      limit(n)
    )
  );

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function getAlert(uid, id) {
  const snapshot = await getDoc(
    doc(db, "users", uid, "alerts", id)
  );

  return snapshot.exists()
    ? { id: snapshot.id, ...snapshot.data() }
    : null;
}

/* ---------------- Incident reports ---------------- */

/**
 * Generates references like SG-YYYYMMDD-XXXXXXXX.
 * Uses a cryptographically secure browser random number generator.
 */
export function newReportReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));

  const code = [...bytes]
    .map(byte => alphabet[byte % alphabet.length])
    .join("");

  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  return `SG-${date}-${code}`;
}

/**
 * Rounds coordinates to approximately 1 km precision.
 */
export const coarse = value =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;

/**
 * Creates a report and its owner link atomically.
 *
 * The report itself does not contain a user UID.
 * The owner link associates the report with the submitting user.
 *
 * Diagnostic logs are included to help investigate permission errors.
 */
export async function createReport(uid, {
  category,
  occurredAt,
  locationLabel,
  lat,
  lng,
  description,
  anonymous
}) {
  const reference = newReportReference();

  try {
    const user = auth.currentUser;

    console.log("[SheGuard] Report diagnostics:", {
      projectId: db.app.options.projectId,
      suppliedUid: uid,
      authenticatedUid: user?.uid ?? null,
      isAuthenticated: !!user,
      category,
      occurredAt:
        occurredAt instanceof Date
          ? occurredAt.toISOString()
          : String(occurredAt),
      locationLabel,
      hasDescription: !!description,
      anonymous: !!anonymous
    });

    if (!user) {
      throw new Error(
        "No signed-in Firebase user. Sign in before submitting a report."
      );
    }

    if (user.uid !== uid) {
      throw new Error(
        "The supplied UID does not match the signed-in Firebase user."
      );
    }

    if (
      !(occurredAt instanceof Date) ||
      Number.isNaN(occurredAt.getTime())
    ) {
      throw new Error(
        "Invalid incident date. Expected a valid JavaScript Date object."
      );
    }

    if (occurredAt.getTime() > Date.now()) {
      throw new Error(
        "The incident date cannot be in the future."
      );
    }

    const allowedCategories = [
      "Harassment",
      "Stalking",
      "Assault",
      "Theft or robbery",
      "Unsafe area (lighting, crowd, access)",
      "Online abuse",
      "Other"
    ];

    if (!allowedCategories.includes(category)) {
      throw new Error(
        `Invalid report category: ${String(category)}`
      );
    }

    if (typeof locationLabel !== "string") {
      throw new Error("The location label must be a string.");
    }

    if (locationLabel.length > 200) {
      throw new Error(
        "The location label must not exceed 200 characters."
      );
    }

    if (
      typeof description === "string" &&
      description.length > 2000
    ) {
      throw new Error(
        "The report description must not exceed 2000 characters."
      );
    }

    const ownerData = {
      uid,
      anonymous: !!anonymous,
      reference,
      createdAt: serverTimestamp()
    };

    const reportData = {
      reference,
      category,
      occurredAt: Timestamp.fromDate(occurredAt),
      generalLocation: {
        label: locationLabel,
        lat: coarse(lat),
        lng: coarse(lng)
      },
      description: description || "",
      evidence: [],
      anonymous: !!anonymous,
      status: "saved",
      agency: {
        submitted: false,
        acknowledged: false
      },
      createdAt: serverTimestamp()
    };

    console.log("[SheGuard] Owner payload:", ownerData);
    console.log("[SheGuard] Report payload:", reportData);

    const batch = writeBatch(db);

    batch.set(
      doc(db, "reportOwners", reference),
      ownerData
    );

    batch.set(
      doc(db, "reports", reference),
      reportData
    );

    await batch.commit();

    console.log("[SheGuard] Report saved successfully:", reference);

    return reference;
  } catch (error) {
    console.error("[SheGuard] Report save failed:", {
      code: error?.code ?? null,
      message: error?.message ?? String(error),
      name: error?.name ?? null,
      reference,
      projectId: db.app.options.projectId
    });

    throw error;
  }
}

/**
 * Uploads evidence to Firebase Storage, then adds its metadata
 * to the report document.
 */
export async function attachEvidence(reference, files) {
  const saved = [];

  for (const file of files) {
    const safeName = file.name
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 80);

    const path =
      `evidence/${reference}/${Date.now()}_${safeName}`;

    await uploadBytes(
      sref(storage, path),
      file,
      { contentType: file.type }
    );

    saved.push({
      path,
      name: safeName,
      contentType: file.type,
      size: file.size
    });
  }

  if (saved.length > 0) {
    await updateDoc(
      doc(db, "reports", reference),
      { evidence: arrayUnion(...saved) }
    );
  }

  return saved;
}

export const evidenceUrl = path =>
  getDownloadURL(sref(storage, path));

/* ---------------- User report history ---------------- */

/**
 * Retrieves report-owner links belonging to the signed-in user,
 * then fetches the corresponding reports.
 */
export async function listMyReports(uid) {
  const owners = await getDocs(
    query(
      collection(db, "reportOwners"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    )
  );

  const reports = await Promise.all(
    owners.docs.map(owner =>
      getDoc(doc(db, "reports", owner.id))
    )
  );

  return reports
    .filter(snapshot => snapshot.exists())
    .map(snapshot => ({
      id: snapshot.id,
      ...snapshot.data()
    }));
}

/* ---------------- Safety data (read-only) ---------------- */

export async function listSafetySources() {
  const snapshot = await getDocs(
    collection(db, "safetySources")
  );

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

/**
 * Queries latitude bounds in Firestore and filters longitude locally.
 */
export async function listSafetyRecordsInBox({
  south,
  north,
  west,
  east
}) {
  const snapshot = await getDocs(
    query(
      collection(db, "safetyRecords"),
      where("latitude", ">=", south),
      where("latitude", "<=", north),
      limit(2000)
    )
  );

  return snapshot.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .filter(record =>
      typeof record.longitude === "number" &&
      record.longitude >= west &&
      record.longitude <= east
    );
}

export async function countSafetyRecords() {
  const snapshot = await getDocs(
    query(
      collection(db, "safetyRecords"),
      limit(1)
    )
  );

  return !snapshot.empty;
}

/* ---------------- Admin ---------------- */

/**
 * These operations require the appropriate admin custom claim
 * and matching Firestore security rules.
 */
export async function adminListReports(n = 100) {
  const snapshot = await getDocs(
    query(
      collection(db, "reports"),
      orderBy("createdAt", "desc"),
      limit(n)
    )
  );

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function adminUpdateReport(
  actorUid,
  reference,
  { status, reviewerNote }
) {
  await updateDoc(
    doc(db, "reports", reference),
    {
      status,
      reviewerNote: reviewerNote || "",
      reviewedAt: serverTimestamp()
    }
  );

  await addDoc(collection(db, "auditLogs"), {
    actorUid,
    action: "report.status_update",
    target: reference,
    detail: { status },
    createdAt: serverTimestamp()
  });
}

export async function adminListAudit(n = 25) {
  const snapshot = await getDocs(
    query(
      collection(db, "auditLogs"),
      orderBy("createdAt", "desc"),
      limit(n)
    )
  );

  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function myReportStatsAdmin() {
  const reports = await adminListReports(500);

  return reports.reduce((counts, report) => {
    counts[report.status] =
      (counts[report.status] || 0) + 1;

    return counts;
  }, {});
}

package in.sheguard.service;

import com.google.cloud.firestore.*;
import in.sheguard.notify.NotificationProvider;
import in.sheguard.notify.NotificationProvider.SendResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Dispatches an SOS alert that the user already created in Firestore (users/{uid}/alerts/{id}).
 * Rules the code enforces:
 *  - Only the alert's owner can trigger dispatch (uid comes from the verified token, not the request body).
 *  - Only contacts with consent=true that belong to that user are used.
 *  - Location appears in the message only if the alert recorded locationShared=true.
 *  - An alert is dispatched once (status must be "requested").
 *  - Result per recipient is stored honestly: not_configured | failed | accepted_by_provider | (later) delivered.
 */
@Service
public class AlertService {
    private final Firestore db;
    private final List<NotificationProvider> providers;
    private final AuditService audit;
    @Value("${sheguard.public-base-url:}") private String publicBaseUrl;

    public AlertService(Firestore db, List<NotificationProvider> providers, AuditService audit) { this.db = db; this.providers = providers; this.audit = audit; }

    public Map<String, Object> dispatch(String uid, String alertId) throws Exception {
        DocumentReference ref = db.collection("users").document(uid).collection("alerts").document(alertId);
        // Claim the alert atomically so a double click or retry cannot send twice.
        boolean claimed = Boolean.TRUE.equals(db.runTransaction(t -> {
            DocumentSnapshot s = t.get(ref).get();
            if (!s.exists() || !"requested".equals(s.getString("status"))) return false;
            t.update(ref, "status", "dispatching");
            return true;
        }).get());
        if (!claimed) return Map.of("status", "ignored", "message", "Alert not found or already dispatched.");

        DocumentSnapshot alert = ref.get().get();
        @SuppressWarnings("unchecked") List<String> contactIds = (List<String>) alert.get("contactIds");
        boolean shareLoc = Boolean.TRUE.equals(alert.getBoolean("locationShared"));
        @SuppressWarnings("unchecked") Map<String, Object> loc = (Map<String, Object>) alert.get("location");
        String senderName = Optional.ofNullable(db.collection("users").document(uid).get().get().getString("displayName")).filter(s -> !s.isBlank()).orElse("A SheGuard user");

        StringBuilder text = new StringBuilder("SheGuard SOS: " + senderName + " asked you to check on them.");
        if (shareLoc && loc != null) text.append(" Location: https://maps.google.com/?q=").append(loc.get("lat")).append(",").append(loc.get("lng"));

        NotificationProvider sms = providers.stream().filter(p -> p.channel().equals("sms")).findFirst().orElseThrow();
        List<Map<String, Object>> deliveries = new ArrayList<>();
        int accepted = 0;
        for (String cid : contactIds == null ? List.<String>of() : contactIds) {
            DocumentSnapshot c = db.collection("users").document(uid).collection("contacts").document(cid).get().get();
            if (!c.exists() || !Boolean.TRUE.equals(c.getBoolean("consent"))) {
                deliveries.add(Map.of("contactId", cid, "channel", "sms", "status", "failed", "error", "Contact missing or has not agreed to alerts."));
                continue;
            }
            String callback = publicBaseUrl.isBlank() ? null
                    : publicBaseUrl + "/api/webhooks/twilio-status?uid=" + uid + "&alertId=" + alertId + "&contactId=" + cid;
            SendResult r = sms.send(c.getString("phone"), text.toString(), callback);
            if ("accepted_by_provider".equals(r.status())) accepted++;
            Map<String, Object> d = new HashMap<>();
            d.put("contactId", cid); d.put("channel", "sms"); d.put("status", r.status());
            d.put("providerMessageId", r.providerMessageId()); d.put("error", r.error());
            deliveries.add(d);
        }
        boolean none = deliveries.stream().allMatch(d -> "not_configured".equals(d.get("status")));
        String status = none ? "not_configured" : accepted > 0 ? "completed" : "failed";
        Map<String, Object> upd = new HashMap<>();
        upd.put("status", status); upd.put("deliveries", deliveries);
        upd.put("deliverySummary", Map.of("delivered", false, "acceptedByProvider", accepted));  // flips only via webhook
        upd.put("dispatchedAt", FieldValue.serverTimestamp());
        if (none) upd.put("error", "No notification provider is configured on the backend, so nobody was notified.");
        ref.update(upd).get();
        audit.log(uid, "alert.dispatch", alertId, Map.of("status", status));
        return Map.of("status", status);
    }

    /** Called by the webhook when the provider reports a later state for one recipient. */
    public void applyProviderStatus(String uid, String alertId, String contactId, String providerStatus) throws Exception {
        String mapped = switch (providerStatus) {
            case "delivered" -> "delivered";
            case "undelivered", "failed" -> "undelivered";
            default -> "accepted_by_provider";   // queued / sent: still not confirmed
        };
        DocumentReference ref = db.collection("users").document(uid).collection("alerts").document(alertId);
        db.runTransaction(t -> {
            DocumentSnapshot s = t.get(ref).get();
            if (!s.exists()) return null;
            @SuppressWarnings("unchecked") List<Map<String, Object>> list = (List<Map<String, Object>>) s.get("deliveries");
            if (list == null) return null;
            boolean any = false;
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> d : list) {
                Map<String, Object> copy = new HashMap<>(d);
                if (contactId.equals(d.get("contactId")) && !"delivered".equals(d.get("status"))) copy.put("status", mapped);
                if ("delivered".equals(copy.get("status"))) any = true;
                out.add(copy);
            }
            t.update(ref, "deliveries", out, "deliverySummary.delivered", any);
            return null;
        }).get();
    }
}

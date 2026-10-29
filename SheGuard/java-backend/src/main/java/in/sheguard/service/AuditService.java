package in.sheguard.service;

import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;

/** Writes append-only audit entries for privileged backend actions (same collection the admin UI reads). */
@Service
public class AuditService {
    private final Firestore db;
    public AuditService(Firestore db) { this.db = db; }

    public void log(String actorUid, String action, String target, Map<String, Object> detail) {
        Map<String, Object> m = new HashMap<>();
        m.put("actorUid", actorUid); m.put("action", action); m.put("target", target);
        m.put("detail", detail == null ? Map.of() : detail); m.put("createdAt", FieldValue.serverTimestamp());
        db.collection("auditLogs").add(m);
    }
}
